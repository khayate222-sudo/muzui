CREATE TABLE game_coin_entries (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 delta INTEGER NOT NULL,reference TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,reference)
);
CREATE TABLE play_chip_entries (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 delta INTEGER NOT NULL,reference TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(user_id,reference)
);
CREATE TABLE game_cosmetics (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,item_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,item_id));
CREATE TABLE game_jobs (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 worker_id TEXT REFERENCES users(id) ON DELETE SET NULL,title TEXT NOT NULL,description TEXT NOT NULL,
 reward INTEGER NOT NULL,state TEXT NOT NULL,delivery TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 request_id TEXT NOT NULL,UNIQUE(owner_id,request_id)
);
CREATE INDEX game_jobs_worker ON game_jobs(worker_id);
CREATE TABLE arcade_rounds (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT NOT NULL,
 choice TEXT NOT NULL,outcome TEXT NOT NULL,bet INTEGER NOT NULL,net INTEGER NOT NULL,created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,request_id)
);
