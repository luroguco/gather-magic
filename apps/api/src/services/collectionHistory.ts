import { randomUUID } from "node:crypto";

import type { DbHandle } from "../lib/database.js";

export type CollectionImportHistoryItem = {
  id: string;
  source: string;
  importedAt: string;
  metadata: Record<string, unknown>;
  cardEntries: number;
  ownedCopies: number;
  rawOwnedCopies: number;
};

const parseMetadata = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const recordCurrentCollectionSnapshot = (
  db: DbHandle,
  input: {
    source: string;
    importedAt: string;
    metadata?: Record<string, unknown>;
  }
) => {
  const totals = db
    .prepare(
      `
      SELECT
        COUNT(*) AS card_entries,
        coalesce(SUM(count), 0) AS owned_copies,
        coalesce(SUM(print_count), 0) AS raw_owned_copies
      FROM collection_cards
    `
    )
    .get() as {
      card_entries: number;
      owned_copies: number;
      raw_owned_copies: number;
    };
  const importId = randomUUID();

  db.prepare(
    `
    INSERT INTO collection_imports (
      id, source, imported_at, metadata_json, card_entries, owned_copies, raw_owned_copies
    ) VALUES (@id, @source, @importedAt, @metadataJson, @cardEntries, @ownedCopies, @rawOwnedCopies)
  `
  ).run({
    id: importId,
    source: input.source,
    importedAt: input.importedAt,
    metadataJson: JSON.stringify(input.metadata ?? {}),
    cardEntries: totals.card_entries,
    ownedCopies: totals.owned_copies,
    rawOwnedCopies: totals.raw_owned_copies
  });

  db.prepare(
    `
    INSERT INTO collection_import_cards (
      import_id, card_id, count, print_count, source_rows_json
    )
    SELECT ?, card_id, count, print_count, source_rows_json
    FROM collection_cards
  `
  ).run(importId);

  return importId;
};

export const listCollectionImportHistory = (db: DbHandle): CollectionImportHistoryItem[] =>
  (
    db
      .prepare(
        `
        SELECT
          id,
          source,
          imported_at,
          metadata_json,
          card_entries,
          owned_copies,
          raw_owned_copies
        FROM collection_imports
        ORDER BY imported_at DESC, rowid DESC
      `
      )
      .all() as Array<{
      id: string;
      source: string;
      imported_at: string;
      metadata_json: string;
      card_entries: number;
      owned_copies: number;
      raw_owned_copies: number;
    }>
  ).map((row) => ({
    id: row.id,
    source: row.source,
    importedAt: row.imported_at,
    metadata: parseMetadata(row.metadata_json),
    cardEntries: row.card_entries,
    ownedCopies: row.owned_copies,
    rawOwnedCopies: row.raw_owned_copies
  }));

export const restoreCollectionImport = (db: DbHandle, importId: string) => {
  const history = db
    .prepare("SELECT id, source FROM collection_imports WHERE id = ?")
    .get(importId) as { id: string; source: string } | undefined;
  if (!history) {
    return null;
  }

  const importedAt = new Date().toISOString();
  let restoredImportId = "";
  db.transaction(() => {
    db.prepare("DELETE FROM collection_cards").run();
    db.prepare(
      `
      INSERT INTO collection_cards (card_id, count, print_count, source_rows_json, imported_at)
      SELECT history.card_id, history.count, history.print_count, history.source_rows_json, @importedAt
      FROM collection_import_cards AS history
      INNER JOIN cards ON cards.id = history.card_id
      WHERE history.import_id = @importId
    `
    ).run({ importId, importedAt });

    restoredImportId = recordCurrentCollectionSnapshot(db, {
      source: "history-restore",
      importedAt,
      metadata: {
        restoredFrom: importId,
        restoredSource: history.source
      }
    });
  })();

  return {
    id: restoredImportId,
    restoredFrom: importId,
    importedAt
  };
};
