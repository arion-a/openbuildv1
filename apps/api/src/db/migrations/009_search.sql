-- Full-text search over builds and ideas: generated STORED tsvector columns +
-- GIN indexes. Only plain text columns — array_to_string() is STABLE not
-- IMMUTABLE and Postgres rejects it in a generated expression, so tools/tags
-- are left to the array filters. Weights: title A, tagline/domain B, body C.

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
