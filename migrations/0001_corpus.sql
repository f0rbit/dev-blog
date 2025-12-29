CREATE TABLE IF NOT EXISTS corpus_snapshots (
  store_id TEXT NOT NULL,
  version TEXT NOT NULL,
  parents TEXT NOT NULL,
  created_at TEXT NOT NULL,
  invoked_at TEXT,
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data_key TEXT NOT NULL,
  tags TEXT,
  PRIMARY KEY (store_id, version)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_store_created ON corpus_snapshots(store_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_content_hash ON corpus_snapshots(store_id, content_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_data_key ON corpus_snapshots(data_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS corpus_observations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source_store_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_path TEXT,
  source_span_start TEXT,
  source_span_end TEXT,
  content TEXT NOT NULL,
  confidence REAL,
  observed_at TEXT,
  created_at TEXT NOT NULL,
  derived_from TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_obs_type ON corpus_observations(type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_obs_source ON corpus_observations(source_store_id, source_version);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_obs_type_observed ON corpus_observations(type, observed_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_obs_type_source ON corpus_observations(type, source_store_id);
