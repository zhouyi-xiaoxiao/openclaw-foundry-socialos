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

CREATE TABLE IF NOT EXISTS StudioTask (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'socialos',
  repo_targets TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  constraints TEXT NOT NULL DEFAULT '[]',
  preferred_tests TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 3,
  source TEXT NOT NULL DEFAULT 'studio.manual',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS StudioRun (
  id TEXT PRIMARY KEY,
  task_id TEXT DEFAULT '',
  pipeline TEXT NOT NULL DEFAULT 'studio-multi-agent',
  status TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  why TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL DEFAULT 'low',
  verify TEXT NOT NULL DEFAULT '',
  next TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS StudioRunStep (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  lane TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  output TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS StudioAgentState (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  responsibility TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  workspace TEXT NOT NULL DEFAULT '',
  tool_profile TEXT NOT NULL DEFAULT '',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TEXT DEFAULT '',
  capabilities TEXT NOT NULL DEFAULT '[]',
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS StudioSetting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS StudioArtifact (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT '',
  task_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);
