-- v0.3.2: official responses, internal notes, assignment workflow and audit history breadth.
-- Existing requests, accounts, statuses and audit rows remain intact.

DROP TRIGGER IF EXISTS pqrs_audit_no_update;
DROP TRIGGER IF EXISTS pqrs_audit_no_delete;
DROP INDEX IF EXISTS idx_pqrs_audit_pqrs_id;

ALTER TABLE pqrs_audit RENAME TO pqrs_audit_legacy;

CREATE TABLE pqrs_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pqrs_id INTEGER NOT NULL REFERENCES pqrs (id) ON DELETE RESTRICT,
  case_number TEXT NOT NULL,
  admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('status_change', 'response_created', 'response_updated', 'response_published', 'note_created', 'assignment_changed')),
  previous_status TEXT CHECK (previous_status IN ('filed', 'in_progress', 'answered', 'closed')),
  new_status TEXT CHECK (new_status IN ('filed', 'in_progress', 'answered', 'closed')),
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    action != 'status_change'
    OR (previous_status IS NOT NULL AND new_status IS NOT NULL)
  )
) STRICT;

INSERT INTO pqrs_audit (
  id,
  pqrs_id,
  case_number,
  admin_id,
  action,
  previous_status,
  new_status,
  request_id,
  created_at
)
SELECT
  id,
  pqrs_id,
  case_number,
  admin_id,
  action,
  previous_status,
  new_status,
  request_id,
  created_at
FROM pqrs_audit_legacy;

CREATE INDEX idx_pqrs_audit_pqrs_id ON pqrs_audit (pqrs_id, id);
CREATE INDEX idx_pqrs_audit_action_created ON pqrs_audit (action, created_at);

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

DROP TABLE pqrs_audit_legacy;

CREATE TABLE pqrs_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pqrs_id INTEGER NOT NULL UNIQUE REFERENCES pqrs (id) ON DELETE RESTRICT,
  author_admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE RESTRICT,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at TEXT,
  CHECK (
    (state = 'draft' AND published_at IS NULL)
    OR (state = 'published' AND published_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_pqrs_responses_state ON pqrs_responses (state, pqrs_id);

CREATE TABLE pqrs_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pqrs_id INTEGER NOT NULL REFERENCES pqrs (id) ON DELETE RESTRICT,
  author_admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE RESTRICT,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_pqrs_notes_pqrs_id ON pqrs_notes (pqrs_id, id);

CREATE TABLE pqrs_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pqrs_id INTEGER NOT NULL UNIQUE REFERENCES pqrs (id) ON DELETE RESTRICT,
  assignee_admin_id INTEGER REFERENCES admins (id) ON DELETE RESTRICT,
  assigned_by_admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  removed_at TEXT,
  CHECK (
    (assignee_admin_id IS NOT NULL AND removed_at IS NULL)
    OR (assignee_admin_id IS NULL AND removed_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_pqrs_assignments_assignee ON pqrs_assignments (assignee_admin_id, pqrs_id);
