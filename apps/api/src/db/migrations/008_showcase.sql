-- Showcase phase: builds and ideas carry a long description and ordered media.
-- media is a JSON array of image URLs (imgbb-hosted), first entry is the cover.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;
-- routes/projects.ts PUT already writes projects.stage; backfill the column it assumed.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stage VARCHAR(20);

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;

ALTER TABLE publications ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'::jsonb;
-- so domain survives a save-as-draft round trip (it was only read at publish time)
ALTER TABLE publications ADD COLUMN IF NOT EXISTS domain VARCHAR(100);
