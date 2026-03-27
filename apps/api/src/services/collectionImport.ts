import { parse } from "csv-parse/sync";
import type { DbHandle } from "../lib/database.js";

const REQUIRED_COLUMNS = ["Id", "Name", "Set", "Color", "Rarity", "Count", "PrintCount"] as const;

type CollectionRow = {
  Id: string;
  Name: string;
  Set: string;
  Color: string;
  Rarity: string;
  Count: string;
  PrintCount: string;
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

export const importCollectionCsv = (db: DbHandle, csvContent: string) => {
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

  const importedAt = new Date().toISOString();
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
  const matched = new Map<
    string,
    {
      count: number;
      printCount: number;
      rows: CollectionRow[];
    }
  >();
  const unresolvedRows: CollectionRow[] = [];

  for (const row of records) {
    const count = Number.parseInt(row.Count, 10);
    const printCount = Number.parseInt(row.PrintCount, 10);

    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }

    const byArenaId =
      Number.isFinite(Number.parseInt(row.Id, 10))
        ? (matchByArenaId.get(Number.parseInt(row.Id, 10)) as { card_id: string } | undefined)
        : undefined;
    const byNameAndSet =
      byArenaId ??
      (matchByNameAndSet.get(normalizeName(row.Name), row.Set.toUpperCase()) as
        | { card_id: string }
        | undefined);

    if (!byNameAndSet) {
      const placeholderId = getPlaceholderCardId(row);
      const colors = colorMap[row.Color.toLowerCase()] ?? [];
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
        arenaId: Number.parseInt(row.Id, 10),
        setCode: row.Set.toUpperCase()
      });
      unresolvedRows.push(row);
      const placeholderEntry = matched.get(placeholderId) ?? {
        count: 0,
        printCount: 0,
        rows: []
      };
      placeholderEntry.count = Math.max(placeholderEntry.count, count);
      placeholderEntry.printCount += Number.isFinite(printCount) ? printCount : 0;
      placeholderEntry.rows.push(row);
      matched.set(placeholderId, placeholderEntry);
      continue;
    }

    const entry = matched.get(byNameAndSet.card_id) ?? {
      count: 0,
      printCount: 0,
      rows: []
    };
    entry.count = Math.max(entry.count, count);
    entry.printCount += Number.isFinite(printCount) ? printCount : 0;
    entry.rows.push(row);
    matched.set(byNameAndSet.card_id, entry);
  }

  const replaceCollection = db.transaction(() => {
    db.prepare("DELETE FROM collection_cards").run();
    const insert = db.prepare(`
      INSERT INTO collection_cards (card_id, count, print_count, source_rows_json, imported_at)
      VALUES (@cardId, @count, @printCount, @sourceRowsJson, @importedAt)
    `);
    for (const [cardId, entry] of matched.entries()) {
      insert.run({
        cardId,
        count: entry.count,
        printCount: entry.printCount,
        sourceRowsJson: JSON.stringify(entry.rows),
        importedAt
      });
    }
  });

  replaceCollection();

  return {
    importedAt,
    rowsRead: records.length,
    cardsMatched: matched.size,
    ownedCopies: [...matched.values()].reduce((total, entry) => total + entry.count, 0),
    unresolvedRows
  };
};
