import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function migrate(db: DatabaseSync, directory = resolve(process.cwd(), "migrations")): void {
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const applied = db.prepare("SELECT name FROM schema_migrations WHERE name = ?");
  const record = db.prepare("INSERT INTO schema_migrations(name) VALUES (?)");
  for (const name of readdirSync(directory).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort()) {
    if (applied.get(name)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(resolve(directory, name), "utf8"));
      record.run(name);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function databasePath(): string {
  return resolve(process.env.EARNLA_DB_PATH || "data/earnla.sqlite");
}

export function openDatabase(path = databasePath()): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try { migrate(db); return db; }
  catch (error) { db.close(); throw error; }
}
