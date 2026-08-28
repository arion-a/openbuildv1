-- Work-account links shown on the public Maker page.
-- Lovable / Replit / Bolt have no third-party login; users paste public profile URLs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username VARCHAR(39);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lovable_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS replit_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bolt_url TEXT;
