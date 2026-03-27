import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dataDirectory, databasePath } from "./paths.js";

export const createDatabase = (filename = databasePath) => {
  mkdirSync(dataDirectory, { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeSchema(db);
  return db;
};

export type DbHandle = ReturnType<typeof createDatabase>;

const initializeSchema = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      oracle_id TEXT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      oracle_text TEXT NOT NULL DEFAULT '',
      mana_cost TEXT,
      mana_value REAL NOT NULL DEFAULT 0,
      colors_json TEXT NOT NULL DEFAULT '[]',
      color_identity_json TEXT NOT NULL DEFAULT '[]',
      type_line TEXT NOT NULL DEFAULT '',
      rarity TEXT NOT NULL DEFAULT '',
      layout TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      legalities_json TEXT NOT NULL DEFAULT '{}',
      image_url TEXT,
      preferred_set_code TEXT,
      preferred_collector_number TEXT,
      released_at TEXT
    );

    CREATE TABLE IF NOT EXISTS card_prints (
      print_id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      arena_id INTEGER UNIQUE,
      set_code TEXT NOT NULL,
      collector_number TEXT,
      games_json TEXT NOT NULL DEFAULT '[]',
      image_url TEXT,
      released_at TEXT,
      UNIQUE(card_id, set_code, collector_number)
    );

    CREATE TABLE IF NOT EXISTS card_mechanics (
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      tag_slug TEXT NOT NULL,
      tag_label TEXT NOT NULL,
      tag_type TEXT NOT NULL CHECK(tag_type IN ('keyword', 'derived')),
      source_rule TEXT NOT NULL,
      PRIMARY KEY (card_id, tag_slug)
    );

    CREATE TABLE IF NOT EXISTS collection_cards (
      card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      count INTEGER NOT NULL,
      print_count INTEGER NOT NULL,
      source_rows_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      format TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deck_cards (
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('main', 'sideboard', 'commander')),
      PRIMARY KEY (deck_id, card_id, section)
    );

    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_cards_set ON cards(preferred_set_code);
    CREATE INDEX IF NOT EXISTS idx_collection_count ON collection_cards(count);
    CREATE INDEX IF NOT EXISTS idx_card_prints_arena_id ON card_prints(arena_id);
    CREATE INDEX IF NOT EXISTS idx_mechanics_slug ON card_mechanics(tag_slug);
    CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON deck_cards(deck_id);
  `);
};
