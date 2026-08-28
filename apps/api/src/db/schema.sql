CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE project_status AS ENUM ('live', 'completed', 'paused');
CREATE TYPE session_status AS ENUM ('provisioning', 'running', 'completed', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  email VARCHAR(255) UNIQUE NOT NULL,
  firebase_uid VARCHAR(128) UNIQUE,
  avatar_url TEXT,
  gitea_id INTEGER,
  gitea_token_encrypted TEXT,
  password_hash TEXT,
  bio TEXT,
  github_username VARCHAR(39),
  github_url TEXT,
  lovable_url TEXT,
  replit_url TEXT,
  bolt_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  tagline TEXT,
  repo_name VARCHAR(200) NOT NULL,
  status project_status DEFAULT 'live',
  domain VARCHAR(100),
  tools_used TEXT[] DEFAULT '{}',
  potential_applications TEXT[] DEFAULT '{}',
  live_url TEXT,
  how_to_replicate TEXT,
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE project_contributors (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(20) DEFAULT 'contributor',
  fork_repo_name VARCHAR(200),
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  container_id VARCHAR(100),
  fork_repo_name VARCHAR(200),
  status session_status DEFAULT 'provisioning',
  web_terminal_url TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(300) NOT NULL,
  body TEXT,
  domain VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  upvotes INTEGER DEFAULT 0,
  build_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE idea_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES idea_threads(id),
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE idea_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  thread_count_at_generation INTEGER NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trending_ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  score FLOAT NOT NULL,
  period VARCHAR(20) NOT NULL,
  computed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  earned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, type)
);

CREATE TABLE idea_upvotes (
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (idea_id, user_id)
);

CREATE TABLE project_upvotes (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_domain ON projects(domain);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_ideas_domain ON ideas(domain);
CREATE INDEX idx_ideas_created ON ideas(created_at DESC);
CREATE INDEX idx_ideas_build_id ON ideas(build_id);
CREATE INDEX idx_idea_threads_idea ON idea_threads(idea_id);
CREATE INDEX idx_project_threads_project ON project_threads(project_id);

CREATE TABLE project_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_reviews_project ON project_reviews(project_id);
CREATE INDEX idx_project_reviews_user ON project_reviews(user_id, created_at DESC);
CREATE INDEX idx_trending_period ON trending_ideas(period, score DESC);

CREATE TABLE publications (
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

CREATE INDEX idx_publications_author ON publications(author_id, updated_at DESC);
CREATE INDEX idx_publications_status ON publications(status, published_at DESC);

-- User OpenCode settings (supports any LLM provider)
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  provider VARCHAR(30) DEFAULT 'anthropic',
  api_key_encrypted TEXT,
  api_key_legacy TEXT,
  model VARCHAR(50) DEFAULT 'claude-sonnet-4-6',
  claude_md TEXT,
  settings_json JSONB DEFAULT '{}',
  mcp_servers JSONB DEFAULT '[]',
  permissions JSONB DEFAULT '{}',
  custom_instructions TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
