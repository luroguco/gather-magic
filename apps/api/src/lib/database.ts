import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { runMigrations } from "../infrastructure/database/migrations.js";
import { dataDirectory, databasePath } from "./paths.js";

export const createDatabase = (filename = databasePath) => {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  } else {
    mkdirSync(dataDirectory, { recursive: true });
  }
  const db = new Database(filename);
  if (filename !== ":memory:") {
    chmodSync(filename, 0o600);
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
  return db;
};

export type DbHandle = ReturnType<typeof createDatabase>;
