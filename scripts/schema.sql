-- Blog Devpad Database Schema
-- Generated from drizzle-orm schema definitions

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL UNIQUE,
  username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  slug TEXT NOT NULL,
  corpus_version TEXT,
  category TEXT NOT NULL DEFAULT 'root',
  archived INTEGER NOT NULL DEFAULT 0,
  publish_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  project_id TEXT,
  UNIQUE(author_id, slug)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  parent TEXT DEFAULT 'root',
  UNIQUE(owner_id, name)
);

CREATE TABLE IF NOT EXISTS tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(post_id, tag)
);

CREATE TABLE IF NOT EXISTS access_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  location TEXT NOT NULL,
  data TEXT,
  last_fetch INTEGER,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fetch_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  UNIQUE(integration_id, identifier)
);

CREATE TABLE IF NOT EXISTS devpad_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  token_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS projects_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  data TEXT,
  fetched_at INTEGER
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_publish_at ON posts(publish_at);
CREATE INDEX IF NOT EXISTS idx_categories_owner_id ON categories(owner_id);
CREATE INDEX IF NOT EXISTS idx_tags_post_id ON tags(post_id);
CREATE INDEX IF NOT EXISTS idx_access_keys_user_id ON access_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_fetch_links_post_id ON fetch_links(post_id);
CREATE INDEX IF NOT EXISTS idx_projects_cache_user_id ON projects_cache(user_id);
