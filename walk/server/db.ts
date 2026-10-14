import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema.js';
export function openDatabase(filename = process.env.DATABASE_PATH || './data/walk.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const directory=new URL('./migrations/',import.meta.url);
  for(const name of readdirSync(directory).filter(n=>/^\d+\.sql$/.test(n)).sort()){
    const version=Number(name.split('.')[0]);
    if(sqlite.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version))continue;
    sqlite.transaction(()=>{sqlite.exec(readFileSync(new URL(name,directory),'utf8'));sqlite.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (?,?)').run(version,Date.now());})();
  }
  return { db: drizzle(sqlite, { schema }), sqlite };
}
export type Store = ReturnType<typeof openDatabase>;
