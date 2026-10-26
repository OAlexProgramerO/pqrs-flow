-- One-time MFA recovery codes are stored only as SHA-256 hashes. The generated codes
-- contain sufficient random entropy and are shown to the administrator only once.
CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE (admin_id, code_hash)
) STRICT;

CREATE INDEX IF NOT EXISTS admin_mfa_recovery_codes_admin_idx
  ON admin_mfa_recovery_codes (admin_id);

-- Security events are append-only. Existing deployments create this table through the
-- compatibility path in migrate.js; IF NOT EXISTS supports both old and new databases.
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  admin_id INTEGER,
  actor_admin_id INTEGER,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_admin_id) REFERENCES admins(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS security_events_admin_id_idx
  ON security_events (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_idx
  ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_created_idx
  ON security_events (created_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS security_events_no_update
BEFORE UPDATE ON security_events
BEGIN
  SELECT RAISE(ABORT, 'security_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS security_events_no_delete
BEFORE DELETE ON security_events
BEGIN
  SELECT RAISE(ABORT, 'security_events is append-only');
END;
