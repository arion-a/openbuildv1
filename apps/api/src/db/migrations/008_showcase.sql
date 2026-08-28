-- Showcase phase: builds and ideas carry a long description and ordered media.
-- media is a JSON array of image URLs (imgbb-hosted), first entry is the cover.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;

ALTER TABLE publications ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;
