ALTER TABLE api_credentials ADD COLUMN limit_restore_at TEXT;

CREATE INDEX api_credentials_personal_limit_restore
  ON api_credentials(subject_type, status, limit_restore_at);
