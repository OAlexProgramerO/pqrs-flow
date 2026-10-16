-- Existing accounts already had full access to the staff panel, so preserve that access.
-- New rows default to the least-privileged role.
ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'staff'
  CHECK (role IN ('administrator', 'staff'));

ALTER TABLE admins ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0
  CHECK (must_change_password IN (0, 1));

UPDATE admins SET role = 'administrator';

CREATE INDEX idx_admins_role_active ON admins (role, is_active);

CREATE TABLE account_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_admin_id INTEGER REFERENCES admins (id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'cli')),
  target_admin_id INTEGER REFERENCES admins (id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN (
    'account_created',
    'account_updated',
    'role_changed',
    'account_activated',
    'account_deactivated',
    'password_reset',
    'password_changed',
    'session_revoked',
    'other_sessions_revoked'
  )),
  metadata TEXT NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_account_audit_target ON account_audit (target_admin_id, id);
CREATE INDEX idx_account_audit_created ON account_audit (created_at);

CREATE TRIGGER account_audit_no_update
BEFORE UPDATE ON account_audit
BEGIN
  SELECT RAISE(ABORT, 'account_audit is append-only');
END;

CREATE TRIGGER account_audit_no_delete
BEFORE DELETE ON account_audit
BEGIN
  SELECT RAISE(ABORT, 'account_audit is append-only');
END;
