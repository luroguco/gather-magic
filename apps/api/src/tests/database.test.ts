import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "../lib/database.js";
import { latestSchemaVersion } from "../infrastructure/database/migrations.js";

const temporaryDirectories: string[] = [];

const temporaryDatabasePath = () => {
  const directory = mkdtempSync(resolve(tmpdir(), "mtga-db-migration-"));
  temporaryDirectories.push(directory);
  return resolve(directory, "mtga.sqlite");
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("database migrations", () => {
  it("creates a fresh database at the latest schema version", () => {
    const db = createDatabase(temporaryDatabasePath());
    try {
      expect(db.pragma("user_version", { simple: true })).toBe(latestSchemaVersion);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
      expect(tables.map((table) => table.name)).toContain("collection_imports");
    } finally {
      db.close();
    }
  });

  it("adopts a version-0 database and preserves its collection as history", () => {
    const databasePath = temporaryDatabasePath();
    const initial = createDatabase(databasePath);
    initial
      .prepare(
        `
        INSERT INTO cards (
          id, name, normalized_name, oracle_text, mana_value, colors_json,
          color_identity_json, type_line, rarity, layout, keywords_json, legalities_json
        ) VALUES ('legacy-card', 'Legacy Card', 'legacy card', '', 0, '[]', '[]', '', '', 'normal', '[]', '{}')
      `
      )
      .run();
    initial
      .prepare(
        `
        INSERT INTO collection_cards (
          card_id, count, print_count, source_rows_json, imported_at
        ) VALUES ('legacy-card', 2, 2, '[]', '2026-01-01T00:00:00.000Z')
      `
      )
      .run();
    initial.exec(`
      DROP TABLE collection_import_cards;
      DROP TABLE collection_imports;
      PRAGMA user_version = 0;
    `);
    initial.close();

    const migrated = createDatabase(databasePath);
    try {
      expect(migrated.pragma("user_version", { simple: true })).toBe(
        latestSchemaVersion
      );
      const history = migrated
        .prepare(
          "SELECT source, card_entries, owned_copies FROM collection_imports"
        )
        .get() as {
        source: string;
        card_entries: number;
        owned_copies: number;
      };
      expect(history).toEqual({
        source: "legacy-bootstrap",
        card_entries: 1,
        owned_copies: 2
      });
    } finally {
      migrated.close();
    }
  });

  it("upgrades populated version-3 card metadata with safe fallbacks", () => {
    const databasePath = temporaryDatabasePath();
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT '',
        type_line TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE card_prints (
        print_id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE
      );
      INSERT INTO cards (id, name, rarity, type_line)
      VALUES ('legacy-plains', 'Snow-Covered Plains', 'common', 'Basic Snow Land — Plains');
      INSERT INTO card_prints (print_id, card_id)
      VALUES ('legacy-plains-print', 'legacy-plains');
      PRAGMA user_version = 3;
    `);
    legacy.close();

    const migrated = createDatabase(databasePath);
    try {
      expect(migrated.pragma("user_version", { simple: true })).toBe(
        latestSchemaVersion
      );
      expect(
        migrated
          .prepare("SELECT produced_mana_json FROM cards WHERE id = ?")
          .get("legacy-plains")
      ).toEqual({ produced_mana_json: '["W"]' });
      expect(
        migrated
          .prepare("SELECT rarity FROM card_prints WHERE print_id = ?")
          .get("legacy-plains-print")
      ).toEqual({ rarity: "common" });
    } finally {
      migrated.close();
    }
  });

  it("repairs metadata for databases that already recorded version 4", () => {
    const databasePath = temporaryDatabasePath();
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT '',
        type_line TEXT NOT NULL DEFAULT '',
        produced_mana_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE card_prints (
        print_id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        rarity TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO cards (id, name, rarity, type_line)
      VALUES ('v4-island', 'Island', 'common', 'Basic Land — Island');
      INSERT INTO card_prints (print_id, card_id)
      VALUES ('v4-island-print', 'v4-island');
      PRAGMA user_version = 4;
    `);
    legacy.close();

    const migrated = createDatabase(databasePath);
    try {
      expect(migrated.pragma("user_version", { simple: true })).toBe(
        latestSchemaVersion
      );
      expect(
        migrated
          .prepare("SELECT produced_mana_json FROM cards WHERE id = ?")
          .get("v4-island")
      ).toEqual({ produced_mana_json: '["U"]' });
      expect(
        migrated
          .prepare("SELECT rarity FROM card_prints WHERE print_id = ?")
          .get("v4-island-print")
      ).toEqual({ rarity: "common" });
    } finally {
      migrated.close();
    }
  });

  it("backfills colorless mana for Wastes using its name", () => {
    const databasePath = temporaryDatabasePath();
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT '',
        type_line TEXT NOT NULL DEFAULT '',
        produced_mana_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE card_prints (
        print_id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        rarity TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO cards (id, name, rarity, type_line)
      VALUES ('v5-wastes', 'Wastes', 'common', 'Basic Land');
      INSERT INTO card_prints (print_id, card_id, rarity)
      VALUES ('v5-wastes-print', 'v5-wastes', 'common');
      PRAGMA user_version = 5;
    `);
    legacy.close();

    const migrated = createDatabase(databasePath);
    try {
      expect(migrated.pragma("user_version", { simple: true })).toBe(
        latestSchemaVersion
      );
      expect(
        migrated
          .prepare("SELECT produced_mana_json FROM cards WHERE id = ?")
          .get("v5-wastes")
      ).toEqual({ produced_mana_json: '["C"]' });
    } finally {
      migrated.close();
    }
  });
});
