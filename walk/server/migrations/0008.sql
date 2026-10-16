CREATE TABLE user_worlds (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  landscape TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX user_worlds_parent ON user_worlds(parent_id);
CREATE INDEX user_worlds_owner ON user_worlds(owner_id);
