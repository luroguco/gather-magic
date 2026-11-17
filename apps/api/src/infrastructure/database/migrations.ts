import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

type Migration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

const migrations: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: (db) => {
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

        CREATE TABLE IF NOT EXISTS card_data_syncs (
          source TEXT PRIMARY KEY,
          source_updated_at TEXT,
          download_uri TEXT,
          synced_at TEXT NOT NULL,
          card_count INTEGER NOT NULL,
          print_count INTEGER NOT NULL
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
    }
  },
  {
    version: 2,
    name: "collection-import-history",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS collection_imports (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          card_entries INTEGER NOT NULL,
          owned_copies INTEGER NOT NULL,
          raw_owned_copies INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS collection_import_cards (
          import_id TEXT NOT NULL REFERENCES collection_imports(id) ON DELETE CASCADE,
          card_id TEXT NOT NULL,
          count INTEGER NOT NULL,
          print_count INTEGER NOT NULL,
          source_rows_json TEXT NOT NULL,
          PRIMARY KEY (import_id, card_id)
        );

        CREATE INDEX IF NOT EXISTS idx_collection_imports_imported_at
          ON collection_imports(imported_at DESC);
        CREATE INDEX IF NOT EXISTS idx_collection_import_cards_import
          ON collection_import_cards(import_id);
      `);

      const existing = db
        .prepare(
          `
          SELECT
            COUNT(*) AS card_entries,
            coalesce(SUM(count), 0) AS owned_copies,
            coalesce(SUM(print_count), 0) AS raw_owned_copies,
            MAX(imported_at) AS imported_at
          FROM collection_cards
        `
        )
        .get() as {
          card_entries: number;
          owned_copies: number;
          raw_owned_copies: number;
          imported_at: string | null;
        };

      if (existing.card_entries > 0) {
        const importId = randomUUID();
        db.prepare(
          `
          INSERT INTO collection_imports (
            id, source, imported_at, metadata_json, card_entries, owned_copies, raw_owned_copies
          ) VALUES (?, 'legacy-bootstrap', ?, '{}', ?, ?, ?)
        `
        ).run(
          importId,
          existing.imported_at ?? new Date().toISOString(),
          existing.card_entries,
          existing.owned_copies,
          existing.raw_owned_copies
        );
        db.prepare(
          `
          INSERT INTO collection_import_cards (
            import_id, card_id, count, print_count, source_rows_json
          )
          SELECT ?, card_id, count, print_count, source_rows_json
          FROM collection_cards
        `
        ).run(importId);
      }
    }
  },
  {
    version: 3,
    name: "arena-deck-sync-metadata",
    up: (db) => {
      const columns = new Set(
        (
          db.pragma("table_info(decks)") as Array<{
            name: string;
          }>
        ).map((column) => column.name)
      );
      const addColumn = (name: string, definition: string) => {
        if (!columns.has(name)) {
          db.exec(`ALTER TABLE decks ADD COLUMN ${name} ${definition}`);
        }
      };

      addColumn("source", "TEXT NOT NULL DEFAULT 'local'");
      addColumn("external_id", "TEXT");
      addColumn("source_format", "TEXT");
      addColumn("source_updated_at", "TEXT");
      addColumn("last_played_at", "TEXT");
      addColumn("is_favorite", "INTEGER NOT NULL DEFAULT 0");

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_source_external_id
        ON decks(source, external_id)
        WHERE external_id IS NOT NULL
      `);
    }
  },
  {
    version: 4,
    name: "deck-coach-card-metadata",
    up: (db) => {
      const cardColumns = new Set(
        (
          db.pragma("table_info(cards)") as Array<{
            name: string;
          }>
        ).map((column) => column.name)
      );
      if (!cardColumns.has("produced_mana_json")) {
        db.exec(
          "ALTER TABLE cards ADD COLUMN produced_mana_json TEXT NOT NULL DEFAULT '[]'"
        );
      }

      const printColumns = new Set(
        (
          db.pragma("table_info(card_prints)") as Array<{
            name: string;
          }>
        ).map((column) => column.name)
      );
      if (!printColumns.has("rarity")) {
        db.exec(
          "ALTER TABLE card_prints ADD COLUMN rarity TEXT NOT NULL DEFAULT ''"
        );
      }

      db.exec(`
        UPDATE card_prints
        SET rarity = coalesce(
          (SELECT cards.rarity FROM cards WHERE cards.id = card_prints.card_id),
          ''
        )
        WHERE rarity = '';

        UPDATE cards
        SET produced_mana_json = CASE
          WHEN lower(name) IN ('wastes', 'snow-covered wastes') THEN '["C"]'
          WHEN lower(type_line) LIKE '%plains%' THEN '["W"]'
          WHEN lower(type_line) LIKE '%island%' THEN '["U"]'
          WHEN lower(type_line) LIKE '%swamp%' THEN '["B"]'
          WHEN lower(type_line) LIKE '%mountain%' THEN '["R"]'
          WHEN lower(type_line) LIKE '%forest%' THEN '["G"]'
          WHEN lower(type_line) LIKE '%wastes%' THEN '["C"]'
          ELSE produced_mana_json
        END
        WHERE produced_mana_json = '[]'
          AND lower(type_line) LIKE '%basic%'
          AND lower(type_line) LIKE '%land%';
      `);
    }
  },
  {
    version: 5,
    name: "deck-coach-card-metadata-backfill",
    up: (db) => {
      // Version 4 briefly existed without this data backfill during development.
      // Keep the repair as its own idempotent migration so databases that already
      // recorded v4 receive the same safe estimates as fresh installations.
      db.exec(`
        UPDATE card_prints
        SET rarity = coalesce(
          (SELECT cards.rarity FROM cards WHERE cards.id = card_prints.card_id),
          ''
        )
        WHERE rarity = '';

        UPDATE cards
        SET produced_mana_json = CASE
          WHEN lower(name) IN ('wastes', 'snow-covered wastes') THEN '["C"]'
          WHEN lower(type_line) LIKE '%plains%' THEN '["W"]'
          WHEN lower(type_line) LIKE '%island%' THEN '["U"]'
          WHEN lower(type_line) LIKE '%swamp%' THEN '["B"]'
          WHEN lower(type_line) LIKE '%mountain%' THEN '["R"]'
          WHEN lower(type_line) LIKE '%forest%' THEN '["G"]'
          WHEN lower(type_line) LIKE '%wastes%' THEN '["C"]'
          ELSE produced_mana_json
        END
        WHERE produced_mana_json = '[]'
          AND lower(type_line) LIKE '%basic%'
          AND lower(type_line) LIKE '%land%';
      `);
    }
  },
  {
    version: 6,
    name: "deck-coach-colorless-basic-mana-backfill",
    up: (db) => {
      db.prepare(
        `
        UPDATE cards
        SET produced_mana_json = '["C"]'
        WHERE lower(name) IN ('wastes', 'snow-covered wastes')
          AND produced_mana_json = '[]'
          AND lower(type_line) LIKE '%basic%'
          AND lower(type_line) LIKE '%land%'
        `
      ).run();
    }
  }
];

export const latestSchemaVersion = migrations.at(-1)?.version ?? 0;

export const runMigrations = (db: Database.Database) => {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;
  if (currentVersion > latestSchemaVersion) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${latestSchemaVersion}.`
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    })();
  }
};
