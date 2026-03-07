CREATE TABLE IF NOT EXISTS Person (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  next_follow_up_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Identity (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT,
  url TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Interaction (
  id TEXT PRIMARY KEY,
  person_id TEXT,
  summary TEXT NOT NULL,
  happened_at TEXT NOT NULL,
  evidence TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS Event (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS EventPersonLink (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  role TEXT DEFAULT 'participant',
  source_type TEXT DEFAULT 'manual',
  source_id TEXT DEFAULT '',
  weight REAL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PostDraft (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  platform TEXT NOT NULL,
  language TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS PublishTask (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  result TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS CaptureAsset (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  local_path TEXT DEFAULT '',
  extracted_text TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS DevDigest (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  what TEXT NOT NULL,
  why TEXT NOT NULL,
  risk TEXT NOT NULL,
  verify TEXT NOT NULL,
  next TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS SelfCheckin (
  id TEXT PRIMARY KEY,
  energy INTEGER NOT NULL,
  emotions TEXT NOT NULL,
  trigger_text TEXT,
  reflection TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Mirror (
  id TEXT PRIMARY KEY,
  range_label TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'weekly',
  period_key TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS MirrorEvidence (
  id TEXT PRIMARY KEY,
  mirror_id TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  snippet TEXT NOT NULL,
  created_at TEXT NOT NULL
);
