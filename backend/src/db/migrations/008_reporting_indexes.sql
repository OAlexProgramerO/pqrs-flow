CREATE INDEX IF NOT EXISTS idx_pqrs_audit_request_action_created
  ON pqrs_audit (pqrs_id, action, created_at, id);
