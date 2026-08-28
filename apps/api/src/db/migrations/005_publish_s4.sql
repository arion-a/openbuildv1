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
