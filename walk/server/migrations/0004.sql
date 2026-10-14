ALTER TABLE posts ADD COLUMN origin TEXT NOT NULL DEFAULT 'editorial';
UPDATE posts SET origin=CASE WHEN is_sample=1 THEN 'sample' WHEN external_url<>'' THEN 'external' WHEN owner_id IS NOT NULL THEN 'walk' ELSE 'editorial' END;
CREATE TABLE media_uploads (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE collection_sources (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL UNIQUE, label TEXT NOT NULL, genre TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, auto_publish INTEGER NOT NULL DEFAULT 0, last_checked INTEGER, next_check INTEGER NOT NULL DEFAULT 0, last_error TEXT);
CREATE TABLE collection_items (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES collection_sources(id) ON DELETE CASCADE, video_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, author_name TEXT NOT NULL, published_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', post_id TEXT REFERENCES posts(id) ON DELETE SET NULL);
CREATE INDEX collection_pending ON collection_items(state);
