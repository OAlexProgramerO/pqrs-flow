-- v0.2.0: staff accounts, server-side sessions, audit history and the indexes of the panel.
-- Forward-only. Existing requests and case numbers are not touched.

CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Always stored in lowercase, so the login can compare it exactly
  email TEXT NOT NULL UNIQUE CHECK (
    email = lower(email) AND length(email) BETWEEN 3 AND 254
  ),

  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),

  -- Only a salted scrypt hash. Never the password.
  password_hash TEXT NOT NULL,

  -- Accounts are deactivated, never deleted, so the audit history keeps its meaning
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
) STRICT;

CREATE TABLE admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE CASCADE,

  -- SHA-256 of the opaque token that lives in the cookie. The token itself is never stored.
  token_hash TEXT NOT NULL UNIQUE,

  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,

  -- Absolute end of the session. The idle timeout is checked against last_seen_at.
  expires_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_admin_sessions_admin_id ON admin_sessions (admin_id);
CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions (expires_at);

CREATE TABLE pqrs_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- RESTRICT: a request or an administrator with history cannot be deleted by accident
  pqrs_id INTEGER NOT NULL REFERENCES pqrs (id) ON DELETE RESTRICT,
  case_number TEXT NOT NULL,
  admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE RESTRICT,

  action TEXT NOT NULL CHECK (action IN ('status_change')),
  previous_status TEXT NOT NULL CHECK (
    previous_status IN ('filed', 'in_progress', 'answered', 'closed')
  ),
  new_status TEXT NOT NULL CHECK (
    new_status IN ('filed', 'in_progress', 'answered', 'closed')
  ),

  -- The X-Request-Id of the HTTP request, to follow an action in the server logs.
  -- No passwords, tokens or personal data are ever stored here.
  request_id TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_pqrs_audit_pqrs_id ON pqrs_audit (pqrs_id, id);

-- The audit history is append-only for the application: rows can be added, never changed or removed
CREATE TRIGGER pqrs_audit_no_update
BEFORE UPDATE ON pqrs_audit
BEGIN
  SELECT RAISE(ABORT, 'pqrs_audit is append-only');
END;

CREATE TRIGGER pqrs_audit_no_delete
BEFORE DELETE ON pqrs_audit
BEGIN
  SELECT RAISE(ABORT, 'pqrs_audit is append-only');
END;

-- Indexes for the staff list: filters by status, type and date range, and sorting by date
CREATE INDEX idx_pqrs_created_at ON pqrs (created_at);
CREATE INDEX idx_pqrs_status ON pqrs (status);
CREATE INDEX idx_pqrs_type ON pqrs (type);
