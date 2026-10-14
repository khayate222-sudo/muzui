ALTER TABLE posts ADD COLUMN world_id TEXT;
CREATE TABLE activities (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('gym','study','social')),
 title TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, finished_at INTEGER,
 shared INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', photo BLOB, photo_mime TEXT,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX activity_owner_time ON activities(user_id, starts_at);
CREATE INDEX activity_expiry ON activities(ends_at) WHERE finished_at IS NULL;
