-- Moderation: user-submitted reports on content or people.
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL,          -- build | idea | maker | comment | message
  ref_id UUID,
  reason VARCHAR(40),
  detail TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open | reviewed | dismissed
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at DESC);
