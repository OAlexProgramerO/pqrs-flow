CREATE TABLE email_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('request_received', 'response_published')),
  pqrs_id INTEGER NOT NULL REFERENCES pqrs (id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL CHECK (length(trim(recipient_email)) BETWEEN 3 AND 254),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  next_attempt_at TEXT,
  last_attempt_at TEXT,
  sent_at TEXT,
  last_error TEXT,
  notification_key TEXT NOT NULL UNIQUE,
  CHECK (
    (status = 'pending' AND next_attempt_at IS NOT NULL)
    OR (status = 'processing' AND last_attempt_at IS NOT NULL)
    OR (status = 'sent' AND sent_at IS NOT NULL)
    OR (status = 'failed' AND last_error IS NOT NULL)
    OR (status = 'pending' AND next_attempt_at IS NULL)
  )
) STRICT;

CREATE INDEX idx_email_notifications_status_next ON email_notifications (status, next_attempt_at, id);
CREATE INDEX idx_email_notifications_pqrs_type ON email_notifications (pqrs_id, notification_type, id);
