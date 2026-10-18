ALTER TABLE pqrs ADD COLUMN deadline_due_date TEXT CHECK (
  deadline_due_date IS NULL OR (
    deadline_due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(deadline_due_date, '+0 days') = deadline_due_date
  )
);
ALTER TABLE pqrs ADD COLUMN deadline_business_days INTEGER
  CHECK (deadline_business_days IS NULL OR deadline_business_days BETWEEN 1 AND 366);
ALTER TABLE pqrs ADD COLUMN deadline_rule_version INTEGER
  CHECK (deadline_rule_version IS NULL OR deadline_rule_version >= 1);
ALTER TABLE pqrs ADD COLUMN deadline_policy_version TEXT;
ALTER TABLE pqrs ADD COLUMN deadline_holidays_snapshot TEXT NOT NULL DEFAULT '[]'
  CHECK (
    json_valid(deadline_holidays_snapshot)
    AND json_type(deadline_holidays_snapshot) = 'array'
  );

CREATE TABLE deadline_rules (
  type TEXT PRIMARY KEY CHECK (type IN ('petition', 'complaint', 'claim', 'suggestion')),
  business_days INTEGER NOT NULL CHECK (business_days BETWEEN 1 AND 366),
  version INTEGER NOT NULL CHECK (version >= 1),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE deadline_holidays (
  date TEXT PRIMARY KEY CHECK (
    date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(date, '+0 days') = date
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100)
) STRICT;

CREATE INDEX idx_pqrs_deadline_due_status ON pqrs (deadline_due_date, status);
