import pg from 'pg';
import { config } from '../config/env.js';

export const pool = new pg.Pool({
  connectionString: config.database.url,
});

/** Idempotent: adds Maker work-link columns on existing databases. */
export async function ensureMakerColumns() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username VARCHAR(39);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS github_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lovable_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS replit_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bolt_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gitea_password TEXT;
  `);
}

/** S2 Build: demo URL, how-to-copy, votes, comments. */
export async function ensureBuildColumns() {
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS live_url TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS how_to_replicate TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS upvotes INTEGER DEFAULT 0;
    CREATE TABLE IF NOT EXISTS project_upvotes (
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS project_threads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_project_threads_project ON project_threads(project_id);
  `);
}

/** S3 Discussion: idea can point at the build that shipped it. */
export async function ensureDiscussionColumns() {
  await pool.query(`
    ALTER TABLE ideas ADD COLUMN IF NOT EXISTS build_id UUID REFERENCES projects(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_ideas_build_id ON ideas(build_id);
  `);
}

/** S4 Publish: drafts + ledger of published builds/ideas. */
export async function ensurePublishTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS publications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind VARCHAR(10) NOT NULL CHECK (kind IN ('build', 'idea')),
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      title VARCHAR(300) NOT NULL DEFAULT '',
      body TEXT,
      live_url TEXT,
      how_to_replicate TEXT,
      tools_used TEXT[] DEFAULT '{}',
      source_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      published_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_publications_author ON publications(author_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status, published_at DESC);
  `);
}

/** Reviews so maker stats and activity have real data. */
export async function ensureReviewTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_reviews (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      body TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_reviews_project ON project_reviews(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_reviews_user ON project_reviews(user_id, created_at DESC);
  `);
}

export async function ensureWaitlistTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

/** Phase 3 social: direct messages, notifications, follows. */
export async function ensureSocialTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      from_user UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_to ON messages (to_user, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_from ON messages (from_user, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (to_user) WHERE read_at IS NULL;

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(30) NOT NULL,
      ref_kind VARCHAR(20),
      ref_id UUID,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

    CREATE TABLE IF NOT EXISTS follows (
      follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (follower_id, followee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows (followee_id);
  `);
}

/** Full-text search: generated tsvector columns + GIN indexes on builds and ideas.
 *  Only plain text columns go in the generated expression — array_to_string() is
 *  STABLE, not IMMUTABLE, so tools/tags can't live here (they're covered by the
 *  array filters instead). */
export async function ensureSearchColumns() {
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(tagline, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(domain, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'C')
      ) STORED;
    CREATE INDEX IF NOT EXISTS idx_projects_search ON projects USING GIN (search_tsv);

    ALTER TABLE ideas ADD COLUMN IF NOT EXISTS search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(domain, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(body, '')), 'C')
      ) STORED;
    CREATE INDEX IF NOT EXISTS idx_ideas_search ON ideas USING GIN (search_tsv);
  `);
}

/** Showcase: long description + ordered media (image URLs) for builds and ideas. */
export async function ensureShowcaseColumns() {
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage VARCHAR(20);
    ALTER TABLE ideas ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE publications ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE publications ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE publications ADD COLUMN IF NOT EXISTS domain VARCHAR(100);
  `);
}
