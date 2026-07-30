import { createClient } from "@libsql/client"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const dbPath = path.resolve(process.env["DB_PATH"] ?? "./data/app.db")
await mkdir(path.dirname(dbPath), { recursive: true })

export const db = createClient({ url: `file:${dbPath}` })

await db.executeMultiple(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'pending',
    url         TEXT NOT NULL,
    createdAt   TEXT NOT NULL,
    finishedAt  TEXT,
    progress    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    jobId      TEXT NOT NULL REFERENCES jobs(id),
    path       TEXT NOT NULL,
    duration   REAL,
    type       TEXT NOT NULL DEFAULT 'match',
    extracting INTEGER NOT NULL DEFAULT 0
  );
`)

// Migrate existing DBs
for (const sql of [
  `ALTER TABLE files ADD COLUMN type TEXT NOT NULL DEFAULT 'match'`,
  `ALTER TABLE files ADD COLUMN extracting INTEGER NOT NULL DEFAULT 0`,
]) {
  try { await db.execute(sql) } catch { /* column already exists */ }
}

// Clear stale extracting flags left by a previous crash
await db.execute(`UPDATE files SET extracting = 0 WHERE extracting = 1`)
