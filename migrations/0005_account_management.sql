ALTER TABLE accounts ADD COLUMN display_name TEXT;

CREATE INDEX IF NOT EXISTS audit_events_actor_action_created
  ON audit_events(actor_account_id, action, created_at DESC);
