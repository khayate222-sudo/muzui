CREATE TABLE room_builds (
 room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL,
 pieces TEXT NOT NULL,
 last_request_id TEXT NOT NULL,
 last_hash TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE room_build_history (
 id TEXT PRIMARY KEY,
 room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL,
 pieces TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX room_build_history_room ON room_build_history(room_id,revision);
