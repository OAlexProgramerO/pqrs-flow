CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pqrs_id INTEGER NOT NULL,
  storage_id TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL CHECK (length(trim(original_name)) BETWEEN 1 AND 255),
  safe_name TEXT NOT NULL CHECK (length(trim(safe_name)) BETWEEN 1 AND 255),
  mime_type TEXT NOT NULL CHECK (length(trim(mime_type)) BETWEEN 1 AND 255),
  extension TEXT NOT NULL CHECK (length(trim(extension)) BETWEEN 1 AND 20),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'internal')),
  uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('citizen', 'staff')),
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (pqrs_id) REFERENCES pqrs (id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_attachments_pqrs ON attachments (pqrs_id, uploaded_at DESC);
CREATE INDEX idx_attachments_visibility ON attachments (visibility, pqrs_id);
