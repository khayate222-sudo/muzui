-- Retain a tombstone when a post is deleted so a delayed retry cannot recreate it.
CREATE TABLE post_requests (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, request_id)
);
CREATE INDEX post_requests_post_id ON post_requests(post_id);
