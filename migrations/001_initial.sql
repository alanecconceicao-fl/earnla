-- Schema only. Fresh installations contain no user records or preset tax rules.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hourly_rate REAL NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  tracks_worked_hours INTEGER NOT NULL DEFAULT 0 CHECK (tracks_worked_hours IN (0, 1))
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0 CHECK (hours >= 0),
  hourly_rate REAL NOT NULL CHECK (hourly_rate >= 0),
  task_date TEXT NOT NULL,
  hours_worked REAL CHECK (hours_worked >= 0),
  bonus_amount REAL NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  others_amount REAL NOT NULL DEFAULT 0 CHECK (others_amount >= 0)
);

CREATE INDEX tasks_by_date ON tasks(task_date);

CREATE TABLE weekly_bonuses (
  week_start TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0)
);

CREATE TABLE weekly_actual_paid (
  week_start TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0)
);

CREATE TABLE weekly_tax_free (week_start TEXT PRIMARY KEY);

CREATE TABLE taxes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percentage REAL NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  monthly_roof REAL CHECK (monthly_roof >= 0)
);
