import { randomUUID } from "node:crypto";
import type { DbHandle } from "../lib/database.js";
import {
  DECK_FORMATS,
  type DeckFormat
} from "../lib/formats.js";
import type { DeckCardInput, DeckRecord } from "../lib/types.js";
import {
  isBasicLand,
  validateDeckCandidate,
  type DeckRuleCardEntry
} from "./deckRules.js";

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
      source: String(row.source) as DeckRecord["source"],
      externalId: row.external_id ? String(row.external_id) : null,
      sourceFormat: row.source_format ? String(row.source_format) : null,
      sourceUpdatedAt: row.source_updated_at ? String(row.source_updated_at) : null,
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null,
      isFavorite: Number(row.is_favorite ?? 0) === 1,
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
      ownedCount: isBasicLand(String(row.type_line ?? ""))
        ? null
        : Number(row.owned_count ?? 0)
    }));

  return {
    id: String(deck.id),
    name: String(deck.name),
    format: String(deck.format) as DeckFormat,
    notes: String(deck.notes),
    createdAt: String(deck.created_at),
    updatedAt: String(deck.updated_at),
    source: String(deck.source) as DeckRecord["source"],
    externalId: deck.external_id ? String(deck.external_id) : null,
    sourceFormat: deck.source_format ? String(deck.source_format) : null,
    sourceUpdatedAt: deck.source_updated_at ? String(deck.source_updated_at) : null,
    lastPlayedAt: deck.last_played_at ? String(deck.last_played_at) : null,
    isFavorite: Number(deck.is_favorite ?? 0) === 1,
    cards: normalizedCards
  };
};

const assertFormat = (format: string): DeckFormat => {
  if (!DECK_FORMATS.includes(format as DeckFormat)) {
    throw new Error(`Unsupported format "${format}"`);
  }
  return format as DeckFormat;
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
    format?: DeckFormat | undefined;
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
          cards.normalized_name,
          cards.oracle_text,
          cards.type_line,
          cards.color_identity_json,
          cards.legalities_json,
          EXISTS (
            SELECT 1
            FROM card_prints
            WHERE card_prints.card_id = cards.id
              AND card_prints.games_json LIKE '%"arena"%'
          ) AS available_on_arena,
          coalesce(collection_cards.count, 0) AS owned_count
        FROM cards
        LEFT JOIN collection_cards ON collection_cards.card_id = cards.id
        WHERE cards.id = ?
      `
      )
      .get(entry.cardId) as
      | {
          name: string;
          normalized_name: string;
          oracle_text: string;
          type_line: string;
          color_identity_json: string;
          legalities_json: string;
          available_on_arena: number;
          owned_count: number;
        }
      | undefined;

    return {
      ...entry,
      card
    };
  });

  const parseStringArray = (value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  };
  const parseStringRecord = (value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      );
    } catch {
      return {};
    }
  };
  const ruleEntries: DeckRuleCardEntry[] = cards.map((entry) => ({
    cardId: entry.cardId,
    quantity: entry.quantity,
    section: entry.section,
    name: entry.card?.name ?? null,
    normalizedName: entry.card?.normalized_name,
    oracleText: entry.card?.oracle_text,
    typeLine: entry.card?.type_line,
    colorIdentity: entry.card
      ? parseStringArray(entry.card.color_identity_json)
      : [],
    legalities: entry.card ? parseStringRecord(entry.card.legalities_json) : {},
    availableOnArena: entry.card
      ? entry.card.available_on_arena === 1
      : undefined,
    ownedCount: entry.card?.owned_count ?? 0
  }));
  const validation = validateDeckCandidate(deck.format, ruleEntries);

  return {
    deckId: deck.id,
    format: deck.format,
    issues: validation.issues.map((issue) => issue.message),
    ownershipGaps: validation.ownershipGaps,
    ruleIssues: validation.issues,
    counts: validation.counts
  };
};

export const exportDeckForArena = (db: DbHandle, deckId: string) => {
  const deck = getDeck(db, deckId);
  if (!deck) {
    return null;
  }

  const lines: string[] = [];

  const sections: DeckCardInput["section"][] = ["commander", "main", "sideboard"];

  for (const section of sections) {
    const cards = deck.cards.filter((entry) => entry.section === section);
    if (!cards.length) {
      continue;
    }

    if (section === "commander") {
      lines.push("Commander");
    } else if (section === "main") {
      lines.push("Deck");
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

export const exportAllDecksForArena = (db: DbHandle) => {
  const decks = listDecks(db).flatMap((deck) => {
    const arenaExport = exportDeckForArena(db, deck.id);
    return arenaExport ? [arenaExport] : [];
  });
  const text = decks
    .map(
      (deck) =>
        `${"=".repeat(64)}\n${deck.name}\n${"=".repeat(64)}\n${deck.text}`
    )
    .join("\n\n");

  return {
    deckCount: decks.length,
    decks,
    text
  };
};
