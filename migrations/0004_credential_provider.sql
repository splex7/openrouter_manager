ALTER TABLE api_credentials RENAME COLUMN openrouter_key_hash TO upstream_key_ref;
ALTER TABLE api_credentials ADD COLUMN provider TEXT NOT NULL DEFAULT 'openrouter';
