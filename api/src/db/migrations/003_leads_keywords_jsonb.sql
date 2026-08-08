-- Fix leads.keywords storage: TEXT[] -> JSONB (matches JSON inserts from the API)
ALTER TABLE leads ALTER COLUMN keywords DROP DEFAULT;
ALTER TABLE leads ALTER COLUMN keywords TYPE JSONB USING to_jsonb(keywords);
ALTER TABLE leads ALTER COLUMN keywords SET DEFAULT '[]'::jsonb;
