CREATE TABLE IF NOT EXISTS case_counters (
  year INTEGER PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
    CHECK (last_value >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS pqrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  case_number TEXT NOT NULL UNIQUE,

  type TEXT NOT NULL CHECK (
    type IN ('petition', 'complaint', 'claim', 'suggestion')
  ),

  subject TEXT NOT NULL,

  description TEXT NOT NULL,

  requester_name TEXT NOT NULL,

  requester_email TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'filed' CHECK (
    status IN ('filed', 'in_progress', 'answered', 'closed')
  ),

  created_at TEXT NOT NULL DEFAULT (
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
) STRICT;
