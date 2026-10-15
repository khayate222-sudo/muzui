CREATE TABLE accounts (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 recovery_hash TEXT NOT NULL,
 policy_version TEXT NOT NULL,
 accepted_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE auth_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resets_at INTEGER NOT NULL);
CREATE INDEX auth_attempts_expiry ON auth_attempts(resets_at);
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE sessions SET created_at=expires_at-2592000000 WHERE created_at=0;
CREATE TABLE media_cleanup (filename TEXT PRIMARY KEY, queued_at INTEGER NOT NULL);
