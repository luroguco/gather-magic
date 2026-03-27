import { randomUUID } from "node:crypto";
import type { DbHandle } from "../lib/database.js";
import { ARENA_FORMATS, BRAWL_FORMATS, type ArenaFormat, FORMAT_LABELS } from "../lib/formats.js";
import type { DeckCardInput, DeckRecord } from "../lib/types.js";

const validSections = new Set<DeckCardInput["section"]>(["main", "sideboard", "commander"]);

export const listDecks = (db: DbHandle) =>
  (db
    .prepare(
      `
      SELECT
        decks.*,
        COUNT(deck_cards.card_id) AS cardRows,
        coalesce(SUM(deck_cards.quantity), 0) AS totalCards
      FROM decks
      LEFT JOIN deck_cards ON deck_cards.deck_id = decks.id
      GROUP BY decks.id
      ORDER BY decks.updated_at DESC
    `
    )
    .all() as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      format: String(row.format),
      notes: String(row.notes),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      cardRows: Number(row.cardRows ?? 0),
      totalCards: Number(row.totalCards ?? 0)
    }));

export const getDeck = (db: DbHandle, deckId: string): DeckRecord | null => {
  const deck = db.prepare("SELECT * FROM decks WHERE id = ?").get(deckId) as
    | Record<string, unknown>
    | undefined;

  if (!deck) {
    return null;
  }

  const cards = db
    .prepare(`
      SELECT
        deck_cards.card_id,
        deck_cards.quantity,
        deck_cards.section,
        cards.name AS card_name,
        cards.type_line,
        cards.mana_cost,
        cards.mana_value,
        coalesce(collection_cards.count, 0) AS owned_count
      FROM deck_cards
      LEFT JOIN cards ON cards.id = deck_cards.card_id
      LEFT JOIN collection_cards ON collection_cards.card_id = deck_cards.card_id
      WHERE deck_cards.deck_id = ?
      ORDER BY deck_cards.section, deck_cards.rowid
    `)
    .all(deckId) as Array<Record<string, unknown>>;
  const normalizedCards = cards
    .map((row) => ({
      cardId: String(row.card_id),
      quantity: Number(row.quantity),
      section: String(row.section) as DeckCardInput["section"],
      cardName: row.card_name ? String(row.card_name) : undefined,
      typeLine: row.type_line ? String(row.type_line) : undefined,
      manaCost: row.mana_cost ? String(row.mana_cost) : undefined,
      manaValue: Number(row.mana_value ?? 0),
      ownedCount: Number(row.owned_count ?? 0)
    }));

  return {
    id: String(deck.id),
    name: String(deck.name),
    format: String(deck.format) as ArenaFormat,
    notes: String(deck.notes),
    createdAt: String(deck.created_at),
    updatedAt: String(deck.updated_at),
    cards: normalizedCards
  };
};

const assertFormat = (format: string): ArenaFormat => {
  if (!ARENA_FORMATS.includes(format as ArenaFormat)) {
    throw new Error(`Unsupported format "${format}"`);
  }
  return format as ArenaFormat;
};

const sanitizeCards = (cards: DeckCardInput[]) =>
  cards.map((card) => {
    if (!validSections.has(card.section)) {
      throw new Error(`Invalid deck section "${card.section}"`);
    }
    if (!Number.isInteger(card.quantity) || card.quantity <= 0) {
      throw new Error(`Invalid quantity for card "${card.cardId}"`);
    }
    return card;
  });

const writeCards = (db: DbHandle, deckId: string, cards: DeckCardInput[]) => {
  db.prepare("DELETE FROM deck_cards WHERE deck_id = ?").run(deckId);
  const insertCard = db.prepare(`
    INSERT INTO deck_cards (deck_id, card_id, quantity, section)
    VALUES (@deckId, @cardId, @quantity, @section)
  `);
  for (const card of cards) {
    insertCard.run({
      deckId,
      ...card
    });
  }
};

export const createDeck = (
  db: DbHandle,
  input: Pick<DeckRecord, "name" | "format" | "notes"> & { cards?: DeckCardInput[] | undefined }
) => {
  const now = new Date().toISOString();
  const deckId = randomUUID();
  const cards = sanitizeCards(input.cards ?? []);
  const format = assertFormat(input.format);

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO decks (id, name, format, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(deckId, input.name.trim(), format, input.notes.trim(), now, now);
    writeCards(db, deckId, cards);
  });

  transaction();
  return getDeck(db, deckId);
};

export const updateDeck = (
  db: DbHandle,
  deckId: string,
  input: {
    name?: string | undefined;
    format?: ArenaFormat | undefined;
    notes?: string | undefined;
    cards?: DeckCardInput[] | undefined;
  }
) => {
  const existing = getDeck(db, deckId);
  if (!existing) {
    return null;
  }

  const nextName = input.name?.trim() ?? existing.name;
  const nextFormat = input.format ? assertFormat(input.format) : existing.format;
  const nextNotes = input.notes?.trim() ?? existing.notes;
  const nextCards = sanitizeCards(input.cards ?? existing.cards);
  const updatedAt = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE decks
      SET name = ?, format = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(nextName, nextFormat, nextNotes, updatedAt, deckId);
    writeCards(db, deckId, nextCards);
  });

  transaction();
  return getDeck(db, deckId);
};

export const validateDeck = (db: DbHandle, deckId: string) => {
  const deck = getDeck(db, deckId);
  if (!deck) {
    return null;
  }

  const cards = deck.cards.map((entry) => {
    const card = db
      .prepare(
        `
        SELECT
          cards.name,
          cards.type_line,
          cards.preferred_set_code,
          cards.preferred_collector_number,
          cards.legalities_json,
          coalesce(collection_cards.count, 0) AS owned_count
        FROM cards
        LEFT JOIN collection_cards ON collection_cards.card_id = cards.id
        WHERE cards.id = ?
      `
      )
      .get(entry.cardId) as
      | {
          name: string;
          type_line: string;
          preferred_set_code: string | null;
          preferred_collector_number: string | null;
          legalities_json: string;
          owned_count: number;
        }
      | undefined;

    return {
      ...entry,
      card
    };
  });

  const issues: string[] = [];
  const ownershipGaps = cards
    .filter((entry) => entry.card)
    .map((entry) => ({
      cardId: entry.cardId,
      name: entry.card!.name,
      needed: entry.quantity,
      owned: entry.card!.owned_count,
      missing: Math.max(entry.quantity - entry.card!.owned_count, 0)
    }))
    .filter((entry) => entry.missing > 0);

  const formatLabel = FORMAT_LABELS[deck.format];

  for (const entry of cards) {
    if (!entry.card) {
      issues.push(`Card "${entry.cardId}" no longer exists in the local catalog.`);
      continue;
    }
    const legalities = JSON.parse(entry.card.legalities_json) as Record<string, string>;
    if (!["legal", "restricted"].includes(legalities[deck.format] ?? "not_legal")) {
      issues.push(`${entry.card.name} is not ${formatLabel}-legal.`);
    }
  }

  const mainCount = cards
    .filter((entry) => entry.section === "main")
    .reduce((total, entry) => total + entry.quantity, 0);
  const commanderCount = cards
    .filter((entry) => entry.section === "commander")
    .reduce((total, entry) => total + entry.quantity, 0);

  if (BRAWL_FORMATS.has(deck.format)) {
    if (mainCount !== 59) {
      issues.push(`${formatLabel} decks should contain 59 cards in the main deck.`);
    }
    if (commanderCount !== 1) {
      issues.push(`${formatLabel} decks should contain exactly 1 commander.`);
    }

    const singletonViolations = cards
      .filter((entry) => entry.section !== "sideboard")
      .filter((entry) => {
        const typeLine = entry.card?.type_line ?? "";
        const isBasicLand = typeLine.includes("Basic Land");
        return !isBasicLand && entry.quantity > 1;
      });
    for (const violation of singletonViolations) {
      issues.push(`${violation.card?.name ?? violation.cardId} violates the singleton rule.`);
    }
  } else if (mainCount < 60) {
    issues.push(`${formatLabel} decks should contain at least 60 main-deck cards.`);
  }

  return {
    deckId: deck.id,
    format: deck.format,
    issues,
    ownershipGaps
  };
};

export const exportDeckForArena = (db: DbHandle, deckId: string) => {
  const deck = getDeck(db, deckId);
  if (!deck) {
    return null;
  }

  const lines: string[] = [deck.name, ""];

  const sections: DeckCardInput["section"][] = ["commander", "main", "sideboard"];

  for (const section of sections) {
    const cards = deck.cards.filter((entry) => entry.section === section);
    if (!cards.length) {
      continue;
    }

    if (section === "commander") {
      lines.push("Commander");
    } else if (section === "sideboard") {
      lines.push("Sideboard");
    }

    for (const entry of cards) {
      const card = db
        .prepare(
          `
          SELECT name, preferred_set_code, preferred_collector_number
          FROM cards
          WHERE id = ?
        `
        )
        .get(entry.cardId) as
        | { name: string; preferred_set_code: string | null; preferred_collector_number: string | null }
        | undefined;

      if (!card) {
        continue;
      }

      const suffix =
        card.preferred_set_code && card.preferred_collector_number
          ? ` (${card.preferred_set_code}) ${card.preferred_collector_number}`
          : "";
      lines.push(`${entry.quantity} ${card.name}${suffix}`);
    }

    lines.push("");
  }

  return {
    deckId,
    name: deck.name,
    format: deck.format,
    text: lines.join("\n").trim()
  };
};
