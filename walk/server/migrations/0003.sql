ALTER TABLE posts ADD COLUMN owner_id TEXT REFERENCES users(id);
CREATE TABLE rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL, is_public INTEGER NOT NULL DEFAULT 0, theme TEXT NOT NULL, layout TEXT NOT NULL, updated_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
CREATE INDEX rooms_owner ON rooms(owner_id);
CREATE TABLE parties (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id));
CREATE TABLE party_members (user_id TEXT PRIMARY KEY REFERENCES users(id), party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE);
CREATE TABLE party_invites (id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), UNIQUE(party_id,target_id));
