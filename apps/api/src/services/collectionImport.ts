import { parse } from "csv-parse/sync";

import type { DbHandle } from "../lib/database.js";
import {
  CollectionImportConfirmationRequiredError,
  isSuspiciousCollectionDiff,
  type CollectionDiff
} from "./collectionDiff.js";
import { recordCurrentCollectionSnapshot } from "./collectionHistory.js";

const REQUIRED_COLUMNS = ["Id", "Name", "Set", "Color", "Rarity", "Count", "PrintCount"] as const;

export type CollectionRow = {
  Id: string;
  Name: string;
  Set: string;
  Color: string;
  Rarity: string;
  Count: string;
  PrintCount: string;
};

type PreparedCollectionEntry = {
  count: number;
  printCount: number;
  rows: CollectionRow[];
};

type PreparedCollectionCsv = {
  records: CollectionRow[];
  matched: Map<string, PreparedCollectionEntry>;
  unresolvedRows: CollectionRow[];
};

export type CollectionCsvPreview = {
  source: "collection-csv";
  importedAt?: string;
  rowsRead: number;
  cardsMatched: number;
  ownedTitles: number;
  ownedCopies: number;
  rawOwnedCopies: number;
  unresolvedRows: CollectionRow[];
  diff: CollectionDiff;
};

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const colorMap: Record<string, string[]> = {
  white: ["W"],
  blue: ["U"],
  black: ["B"],
  red: ["R"],
  green: ["G"],
  gold: ["W", "U", "B", "R", "G"],
  colorless: []
};

const getPlaceholderCardId = (row: CollectionRow) =>
  `placeholder:${row.Set.toUpperCase()}:${normalizeName(row.Name).replace(/[^a-z0-9]+/g, "-")}`;

const prepareCollectionCsv = (db: DbHandle, csvContent: string): PreparedCollectionCsv => {
  const records = parse(csvContent, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as CollectionRow[];

  const firstRecord = records[0] as Record<string, unknown> | undefined;
  const headers = firstRecord ? Object.keys(firstRecord) : [];
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      throw new Error(`Collection CSV is missing required column "${column}"`);
    }
  }

  const matchByArenaId = db.prepare(`
    SELECT card_id
    FROM card_prints
    WHERE arena_id = ?
  `);
  const matchByNameAndSet = db.prepare(`
    SELECT DISTINCT cards.id AS card_id
    FROM cards
    INNER JOIN card_prints ON card_prints.card_id = cards.id
    WHERE cards.normalized_name = ?
      AND card_prints.set_code = ?
  `);
  const matched = new Map<string, PreparedCollectionEntry>();
  const unresolvedRows: CollectionRow[] = [];

  for (const row of records) {
    const count = Number.parseInt(row.Count, 10);
    const printCount = Number.parseInt(row.PrintCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }

    const arenaId = Number.parseInt(row.Id, 10);
    const byArenaId = Number.isFinite(arenaId)
      ? (matchByArenaId.get(arenaId) as { card_id: string } | undefined)
      : undefined;
    const byNameAndSet =
      byArenaId ??
      (matchByNameAndSet.get(normalizeName(row.Name), row.Set.toUpperCase()) as
        | { card_id: string }
        | undefined);
    const cardId = byNameAndSet?.card_id ?? getPlaceholderCardId(row);

    if (!byNameAndSet) {
      unresolvedRows.push(row);
    }

    const entry = matched.get(cardId) ?? {
      count: 0,
      printCount: 0,
      rows: []
    };
    entry.count = Math.max(entry.count, count);
    entry.printCount += Number.isFinite(printCount) ? printCount : 0;
    entry.rows.push(row);
    matched.set(cardId, entry);
  }

  return {
    records,
    matched,
    unresolvedRows
  };
};

const buildCollectionDiff = (
  db: DbHandle,
  matched: Map<string, PreparedCollectionEntry>
): CollectionDiff => {
  const currentEntries = new Map(
    (
      db
        .prepare("SELECT card_id, count, print_count FROM collection_cards")
        .all() as Array<{ card_id: string; count: number; print_count: number }>
    ).map((entry) => [
      entry.card_id,
      {
        count: entry.count,
        printCount: entry.print_count
      }
    ])
  );
  let addedTitles = 0;
  let changedTitles = 0;
  let unchangedTitles = 0;

  for (const [cardId, entry] of matched.entries()) {
    const current = currentEntries.get(cardId);
    if (!current) {
      addedTitles += 1;
    } else if (current.count === entry.count && current.printCount === entry.printCount) {
      unchangedTitles += 1;
    } else {
      changedTitles += 1;
    }
    currentEntries.delete(cardId);
  }

  return {
    addedTitles,
    removedTitles: currentEntries.size,
    changedTitles,
    unchangedTitles
  };
};

const buildCollectionCsvPreview = (
  db: DbHandle,
  prepared: PreparedCollectionCsv
): CollectionCsvPreview => ({
  source: "collection-csv",
  rowsRead: prepared.records.length,
  cardsMatched: prepared.matched.size,
  ownedTitles: prepared.matched.size,
  ownedCopies: [...prepared.matched.values()].reduce((total, entry) => total + entry.count, 0),
  rawOwnedCopies: [...prepared.matched.values()].reduce(
    (total, entry) => total + entry.printCount,
    0
  ),
  unresolvedRows: prepared.unresolvedRows,
  diff: buildCollectionDiff(db, prepared.matched)
});

const insertUnresolvedPlaceholders = (
  db: DbHandle,
  unresolvedRows: CollectionRow[]
) => {
  const insertPlaceholderCard = db.prepare(`
    INSERT OR IGNORE INTO cards (
      id, oracle_id, name, normalized_name, oracle_text, mana_cost, mana_value,
      colors_json, color_identity_json, type_line, rarity, layout, keywords_json,
      legalities_json, image_url, preferred_set_code, preferred_collector_number, released_at
    ) VALUES (
      @id, NULL, @name, @normalizedName, '', NULL, 0,
      @colorsJson, @colorIdentityJson, '', @rarity, 'normal', '[]',
      '{}', NULL, @setCode, NULL, NULL
    )
  `);
  const insertPlaceholderPrint = db.prepare(`
    INSERT OR IGNORE INTO card_prints (
      print_id, card_id, arena_id, set_code, collector_number, games_json, image_url, released_at
    ) VALUES (
      @printId, @cardId, @arenaId, @setCode, NULL, '["arena"]', NULL, NULL
    )
  `);

  for (const row of unresolvedRows) {
    const placeholderId = getPlaceholderCardId(row);
    const colors = colorMap[row.Color.toLowerCase()] ?? [];
    const arenaId = Number.parseInt(row.Id, 10);
    insertPlaceholderCard.run({
      id: placeholderId,
      name: row.Name,
      normalizedName: normalizeName(row.Name),
      colorsJson: JSON.stringify(colors),
      colorIdentityJson: JSON.stringify(colors),
      rarity: row.Rarity.toLowerCase(),
      setCode: row.Set.toUpperCase()
    });
    insertPlaceholderPrint.run({
      printId: `placeholder-print:${row.Id}`,
      cardId: placeholderId,
      arenaId: Number.isFinite(arenaId) ? arenaId : null,
      setCode: row.Set.toUpperCase()
    });
  }
};

export const previewCollectionCsv = (db: DbHandle, csvContent: string) =>
  buildCollectionCsvPreview(db, prepareCollectionCsv(db, csvContent));

export const importCollectionCsv = (
  db: DbHandle,
  csvContent: string,
  options?: {
    confirmSuspiciousDiff?: boolean;
  }
): CollectionCsvPreview & { importedAt: string } => {
  const prepared = prepareCollectionCsv(db, csvContent);
  const preview = buildCollectionCsvPreview(db, prepared);
  if (isSuspiciousCollectionDiff(preview.diff) && !options?.confirmSuspiciousDiff) {
    throw new CollectionImportConfirmationRequiredError(preview.diff);
  }

  const importedAt = new Date().toISOString();
  db.transaction(() => {
    insertUnresolvedPlaceholders(db, prepared.unresolvedRows);
    db.prepare("DELETE FROM collection_cards").run();
    const insert = db.prepare(`
      INSERT INTO collection_cards (card_id, count, print_count, source_rows_json, imported_at)
      VALUES (@cardId, @count, @printCount, @sourceRowsJson, @importedAt)
    `);
    for (const [cardId, entry] of prepared.matched.entries()) {
      insert.run({
        cardId,
        count: entry.count,
        printCount: entry.printCount,
        sourceRowsJson: JSON.stringify(entry.rows),
        importedAt
      });
    }

    recordCurrentCollectionSnapshot(db, {
      source: "collection-csv",
      importedAt,
      metadata: {
        rowsRead: prepared.records.length,
        unresolvedRows: prepared.unresolvedRows.length
      }
    });
  })();

  return {
    ...preview,
    importedAt
  };
};
