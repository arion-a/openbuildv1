ALTER TABLE ideas ADD COLUMN IF NOT EXISTS build_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ideas_build_id ON ideas(build_id);
