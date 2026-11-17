import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { resolve } from "node:path";

import type { DbHandle } from "../lib/database.js";
import type { DeckFormat } from "../lib/formats.js";
import type { DeckCardInput } from "../lib/types.js";
import {
  loadArenaCardCatalogLookup,
  type UntappedCatalogSource
} from "./untappedCollectionImport.js";

type ArenaDeckAttribute = {
  name?: unknown;
  value?: unknown;
};

type ArenaDeckSummary = {
  DeckId?: unknown;
  Name?: unknown;
  Attributes?: unknown;
  Description?: unknown;
};

type ArenaDeckCard = {
  cardId?: unknown;
  CardId?: unknown;
  quantity?: unknown;
  Quantity?: unknown;
};

type ArenaDeckBody = {
  MainDeck?: unknown;
  Sideboard?: unknown;
  CommandZone?: unknown;
  Companions?: unknown;
};

type StartHookPayload = {
  Decks: Record<string, ArenaDeckBody>;
  DeckSummaries: ArenaDeckSummary[];
};

type ResolvedArenaCard = {
  arenaCardId: number;
  cardId: string;
  name: string;
  setCode: string | null;
  placeholder: boolean;
};

type PreparedArenaDeck = {
  externalId: string;
  name: string;
  format: DeckFormat;
  sourceFormat: string | null;
  sourceUpdatedAt: string | null;
  lastPlayedAt: string | null;
  isFavorite: boolean;
  starterDeck: boolean;
  cards: DeckCardInput[];
};

type PreparedArenaDeckSync = {
  logPath: string;
  logModifiedAt: string;
  totalDecksFound: number;
  userDecksFound: number;
  starterDecksFound: number;
  includeStarterDecks: boolean;
  decks: PreparedArenaDeck[];
  placeholderCards: ResolvedArenaCard[];
  unresolvedArenaCardIds: number[];
  newDecks: number;
  changedDecks: number;
  unchangedDecks: number;
  retainedMissingDecks: number;
};

export type ArenaDeckSyncSummary = Omit<PreparedArenaDeckSync, "decks" | "placeholderCards"> & {
  source: "arena-player-log";
  decksIncluded: number;
  placeholderCardCount: number;
  specialFormatDecks: number;
  importedAt?: string;
  decksCreated?: number;
  decksUpdated?: number;
  importedDeckIds?: string[];
};

export type ArenaDeckSyncOptions = {
  playerLogPath?: string;
  includeStarterDecks?: boolean;
  catalogSource?: UntappedCatalogSource;
  untappedBuild?: string;
  untappedLocale?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const defaultPlayerLogPaths = () => {
  const configuredPath = process.env.MTGA_PLAYER_LOG_PATH;
  if (configuredPath) {
    return [resolve(configuredPath)];
  }

  if (platform() === "darwin") {
    const logs = resolve(homedir(), "Library/Logs/Wizards Of The Coast/MTGA");
    return [resolve(logs, "Player.log"), resolve(logs, "Player-prev.log")];
  }

  if (platform() === "win32") {
    const logs = resolve(homedir(), "AppData/LocalLow/Wizards Of The Coast/MTGA");
    return [resolve(logs, "Player.log"), resolve(logs, "Player-prev.log")];
  }

  const logs = resolve(homedir(), ".config/unity3d/Wizards Of The Coast/MTGA");
  return [resolve(logs, "Player.log"), resolve(logs, "Player-prev.log")];
};

const findJsonObject = (source: string, startAt: number) => {
  const objectStart = source.indexOf("{", startAt);
  if (objectStart < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          value: source.slice(objectStart, index + 1),
          end: index + 1
        };
      }
    }
  }

  return null;
};

const normalizeStartHookPayload = (value: unknown): StartHookPayload | null => {
  if (!isRecord(value) || !isRecord(value.Decks)) {
    return null;
  }

  const summaries = Array.isArray(value.DeckSummaries)
    ? value.DeckSummaries
    : Array.isArray(value.DeckSummariesV2)
      ? value.DeckSummariesV2
      : null;
  if (!summaries) {
    return null;
  }

  return {
    Decks: value.Decks as Record<string, ArenaDeckBody>,
    DeckSummaries: summaries.filter(isRecord) as ArenaDeckSummary[]
  };
};

export const extractLatestArenaDeckSnapshot = (logContent: string): StartHookPayload | null => {
  const marker = "<== StartHook(";
  let searchAt = 0;
  let latest: StartHookPayload | null = null;

  while (searchAt < logContent.length) {
    const markerIndex = logContent.indexOf(marker, searchAt);
    if (markerIndex < 0) {
      break;
    }

    const candidate = findJsonObject(logContent, markerIndex + marker.length);
    if (!candidate) {
      break;
    }

    try {
      latest = normalizeStartHookPayload(JSON.parse(candidate.value)) ?? latest;
    } catch {
      // A partially written StartHook is expected while Arena is running.
    }
    searchAt = Math.max(candidate.end, markerIndex + marker.length);
  }

  return latest;
};

class ArenaDeckLogError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "ArenaDeckLogError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const loadLatestArenaDeckSnapshot = (preferredPath?: string) => {
  const paths = preferredPath ? [resolve(preferredPath)] : defaultPlayerLogPaths();
  const availablePaths = paths
    .filter((path) => existsSync(path))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  if (availablePaths.length === 0) {
    throw new ArenaDeckLogError(
      `MTG Arena's Player.log was not found. Start Arena, sign in, then try again.`,
      "ARENA_PLAYER_LOG_NOT_FOUND",
      404
    );
  }

  for (const path of availablePaths) {
    const snapshot = extractLatestArenaDeckSnapshot(readFileSync(path, "utf8"));
    if (snapshot) {
      return {
        path,
        modifiedAt: statSync(path).mtime.toISOString(),
        snapshot
      };
    }
  }

  throw new ArenaDeckLogError(
    "No complete saved-deck snapshot was found. Restart Arena, wait for the home screen, then try again.",
    "ARENA_DECK_SNAPSHOT_NOT_FOUND",
    422
  );
};

const attributesToMap = (summary: ArenaDeckSummary) => {
  const attributes = Array.isArray(summary.Attributes)
    ? (summary.Attributes as ArenaDeckAttribute[])
    : [];
  const result = new Map<string, string>();
  for (const attribute of attributes) {
    if (typeof attribute.name === "string" && typeof attribute.value === "string") {
      result.set(attribute.name, attribute.value);
    }
  }
  return result;
};

const parseAttributeString = (value: string | undefined) => {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
};

const parseAttributeDate = (value: string | undefined) => {
  const parsed = parseAttributeString(value);
  if (!parsed || !Number.isFinite(Date.parse(parsed))) {
    return null;
  }
  return new Date(parsed).toISOString();
};

export const mapArenaFormat = (sourceFormat: string | null): DeckFormat => {
  const normalized = sourceFormat?.replace(/[^a-z]/gi, "").toLowerCase() ?? "";
  if (normalized.includes("historicbrawl")) {
    return "brawl";
  }
  if (normalized.includes("standardbrawl")) {
    return "standardbrawl";
  }
  if (normalized === "brawl") {
    return "brawl";
  }
  if (normalized.includes("standard")) {
    return "standard";
  }
  if (normalized.includes("alchemy")) {
    return "alchemy";
  }
  if (normalized.includes("explorer")) {
    return "explorer";
  }
  if (normalized.includes("historic")) {
    return "historic";
  }
  if (normalized.includes("timeless")) {
    return "timeless";
  }
  if (
    normalized.includes("limited") ||
    normalized.includes("draft") ||
    normalized.includes("sealed")
  ) {
    return "limited";
  }
  return "other";
};

const normalizeDeckName = (value: unknown, externalId: string) => {
  if (typeof value !== "string" || !value.trim()) {
    return `Arena deck ${externalId.slice(0, 8)}`;
  }
  if (!value.startsWith("?=?Loc/")) {
    return value.trim();
  }
  const localizationKey = value.split("/").at(-1) ?? externalId.slice(0, 8);
  return `Starter deck · ${localizationKey.replaceAll("_", " ")}`;
};

const readArenaDeckCards = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): Array<{ arenaCardId: number; quantity: number }> => {
    if (!isRecord(entry)) {
      return [];
    }
    const card = entry as ArenaDeckCard;
    const arenaCardId = Number(card.cardId ?? card.CardId);
    const quantity = Number(card.quantity ?? card.Quantity);
    if (!Number.isInteger(arenaCardId) || arenaCardId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return [];
    }
    return [{ arenaCardId, quantity }];
  });
};

const collectRequiredArenaCardIds = (
  summaries: ArenaDeckSummary[],
  bodies: Record<string, ArenaDeckBody>,
  includeStarterDecks: boolean
) => {
  const ids = new Set<number>();
  for (const summary of summaries) {
    const externalId = typeof summary.DeckId === "string" ? summary.DeckId : null;
    if (!externalId) {
      continue;
    }
    const attributes = attributesToMap(summary);
    const starterDeck =
      !attributes.has("Version") &&
      !attributes.has("LastUpdated") &&
      !attributes.has("LastPlayed");
    if (starterDeck && !includeStarterDecks) {
      continue;
    }
    const body = bodies[externalId];
    if (!body) {
      continue;
    }
    for (const zone of [body.MainDeck, body.Sideboard, body.CommandZone, body.Companions]) {
      for (const card of readArenaDeckCards(zone)) {
        ids.add(card.arenaCardId);
      }
    }
  }
  return [...ids];
};

const resolveArenaCards = async (
  db: DbHandle,
  arenaCardIds: number[],
  options: ArenaDeckSyncOptions
) => {
  const catalog = await loadArenaCardCatalogLookup(
    db,
    {
      catalogSource: options.catalogSource ?? "hybrid",
      ...(options.untappedBuild ? { untappedBuild: options.untappedBuild } : {}),
      ...(options.untappedLocale ? { untappedLocale: options.untappedLocale } : {})
    },
    arenaCardIds
  );
  const cardExists = db.prepare("SELECT id FROM cards WHERE id = ?");
  const matchByNameAndSet = db.prepare(`
    SELECT DISTINCT cards.id AS card_id
    FROM cards
    JOIN card_prints ON card_prints.card_id = cards.id
    WHERE cards.normalized_name = ? AND card_prints.set_code = ?
  `);
  const matchByName = db.prepare("SELECT id AS card_id FROM cards WHERE normalized_name = ?");
  const resolved = new Map<number, ResolvedArenaCard>();

  for (const arenaCardId of arenaCardIds) {
    const catalogEntry = catalog.lookup.get(arenaCardId);
    let cardId =
      catalogEntry && cardExists.get(catalogEntry.cardId)
        ? catalogEntry.cardId
        : null;

    if (!cardId && catalogEntry) {
      const normalized = normalizeName(catalogEntry.name);
      const setMatches = catalogEntry.setCode
        ? (matchByNameAndSet.all(normalized, catalogEntry.setCode.toUpperCase()) as Array<{
            card_id: string;
          }>)
        : [];
      if (setMatches.length === 1) {
        cardId = setMatches[0]?.card_id ?? null;
      }
      if (!cardId) {
        const nameMatches = matchByName.all(normalized) as Array<{ card_id: string }>;
        if (nameMatches.length === 1) {
          cardId = nameMatches[0]?.card_id ?? null;
        }
      }
    }

    const placeholderId = catalogEntry?.cardId.startsWith("title:")
      ? `placeholder:arena-${catalogEntry.cardId.replace(":", "-")}`
      : `placeholder:arena-grpid-${arenaCardId}`;
    resolved.set(arenaCardId, {
      arenaCardId,
      cardId: cardId ?? placeholderId,
      name: catalogEntry?.name ?? `Arena card #${arenaCardId}`,
      setCode: catalogEntry?.setCode ?? null,
      placeholder: !cardId || cardId.startsWith("placeholder:")
    });
  }

  return resolved;
};

const normalizeCards = (
  body: ArenaDeckBody,
  resolvedCards: Map<number, ResolvedArenaCard>
) => {
  const entries = new Map<string, DeckCardInput>();
  const addZone = (value: unknown, section: DeckCardInput["section"]) => {
    for (const arenaCard of readArenaDeckCards(value)) {
      const resolved = resolvedCards.get(arenaCard.arenaCardId);
      if (!resolved) {
        continue;
      }
      const key = `${section}:${resolved.cardId}`;
      const existing = entries.get(key);
      if (existing) {
        existing.quantity += arenaCard.quantity;
      } else {
        entries.set(key, {
          cardId: resolved.cardId,
          quantity: arenaCard.quantity,
          section
        });
      }
    }
  };

  addZone(body.MainDeck, "main");
  addZone(body.Sideboard, "sideboard");
  addZone(body.CommandZone, "commander");
  addZone(body.Companions, "sideboard");
  return [...entries.values()];
};

const comparableCards = (cards: DeckCardInput[]) =>
  cards
    .map(({ cardId, quantity, section }) => ({ cardId, quantity, section }))
    .sort(
      (left, right) =>
        left.section.localeCompare(right.section) ||
        left.cardId.localeCompare(right.cardId) ||
        left.quantity - right.quantity
    );

const deckHasChanged = (db: DbHandle, deck: PreparedArenaDeck, existingId: string) => {
  const existing = db.prepare("SELECT * FROM decks WHERE id = ?").get(existingId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    return true;
  }
  const existingCards = db
    .prepare("SELECT card_id, quantity, section FROM deck_cards WHERE deck_id = ?")
    .all(existingId)
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        cardId: String(row.card_id),
        quantity: Number(row.quantity),
        section: String(row.section) as DeckCardInput["section"]
      };
    });

  return (
    String(existing.name) !== deck.name ||
    String(existing.format) !== deck.format ||
    (existing.source_format ? String(existing.source_format) : null) !== deck.sourceFormat ||
    (existing.source_updated_at ? String(existing.source_updated_at) : null) !==
      deck.sourceUpdatedAt ||
    (existing.last_played_at ? String(existing.last_played_at) : null) !== deck.lastPlayedAt ||
    (Number(existing.is_favorite ?? 0) === 1) !== deck.isFavorite ||
    JSON.stringify(comparableCards(existingCards)) !== JSON.stringify(comparableCards(deck.cards))
  );
};

const prepareArenaDeckSync = async (
  db: DbHandle,
  options: ArenaDeckSyncOptions
): Promise<PreparedArenaDeckSync> => {
  const loaded = loadLatestArenaDeckSnapshot(options.playerLogPath);
  const { DeckSummaries: summaries, Decks: bodies } = loaded.snapshot;
  const includeStarterDecks = options.includeStarterDecks ?? false;
  const requiredArenaCardIds = collectRequiredArenaCardIds(
    summaries,
    bodies,
    includeStarterDecks
  );
  const resolvedCards = await resolveArenaCards(db, requiredArenaCardIds, options);
  const decks: PreparedArenaDeck[] = [];
  let userDecksFound = 0;
  let starterDecksFound = 0;

  for (const summary of summaries) {
    const externalId = typeof summary.DeckId === "string" ? summary.DeckId : null;
    if (!externalId || !bodies[externalId]) {
      continue;
    }
    const attributes = attributesToMap(summary);
    const starterDeck =
      !attributes.has("Version") &&
      !attributes.has("LastUpdated") &&
      !attributes.has("LastPlayed");
    if (starterDeck) {
      starterDecksFound += 1;
    } else {
      userDecksFound += 1;
    }
    if (starterDeck && !includeStarterDecks) {
      continue;
    }

    const sourceFormat = parseAttributeString(attributes.get("Format"));
    decks.push({
      externalId,
      name: normalizeDeckName(summary.Name, externalId),
      format: mapArenaFormat(sourceFormat),
      sourceFormat,
      sourceUpdatedAt: parseAttributeDate(attributes.get("LastUpdated")),
      lastPlayedAt: parseAttributeDate(attributes.get("LastPlayed")),
      isFavorite: attributes.get("IsFavorite") === "true",
      starterDeck,
      cards: normalizeCards(bodies[externalId]!, resolvedCards)
    });
  }

  const existingRows = db
    .prepare("SELECT id, external_id FROM decks WHERE source = 'arena' AND external_id IS NOT NULL")
    .all() as Array<{ id: string; external_id: string }>;
  const existingByExternalId = new Map(
    existingRows.map((entry) => [entry.external_id, entry.id])
  );
  let newDecks = 0;
  let changedDecks = 0;
  let unchangedDecks = 0;
  for (const deck of decks) {
    const existingId = existingByExternalId.get(deck.externalId);
    if (!existingId) {
      newDecks += 1;
    } else if (deckHasChanged(db, deck, existingId)) {
      changedDecks += 1;
    } else {
      unchangedDecks += 1;
    }
  }
  const includedExternalIds = new Set(decks.map((deck) => deck.externalId));

  return {
    logPath: loaded.path,
    logModifiedAt: loaded.modifiedAt,
    totalDecksFound: summaries.length,
    userDecksFound,
    starterDecksFound,
    includeStarterDecks,
    decks,
    placeholderCards: [...resolvedCards.values()].filter((card) => card.placeholder),
    unresolvedArenaCardIds: [...resolvedCards.values()]
      .filter((card) => card.placeholder)
      .map((card) => card.arenaCardId),
    newDecks,
    changedDecks,
    unchangedDecks,
    retainedMissingDecks: existingRows.filter(
      (entry) => !includedExternalIds.has(entry.external_id)
    ).length
  };
};

const summarizePreparedSync = (
  prepared: PreparedArenaDeckSync,
  imported?: {
    importedAt: string;
    decksCreated: number;
    decksUpdated: number;
    importedDeckIds: string[];
  }
): ArenaDeckSyncSummary => ({
  source: "arena-player-log",
  logPath: prepared.logPath,
  logModifiedAt: prepared.logModifiedAt,
  totalDecksFound: prepared.totalDecksFound,
  userDecksFound: prepared.userDecksFound,
  starterDecksFound: prepared.starterDecksFound,
  includeStarterDecks: prepared.includeStarterDecks,
  decksIncluded: prepared.decks.length,
  placeholderCardCount: prepared.placeholderCards.length,
  unresolvedArenaCardIds: prepared.unresolvedArenaCardIds,
  newDecks: prepared.newDecks,
  changedDecks: prepared.changedDecks,
  unchangedDecks: prepared.unchangedDecks,
  retainedMissingDecks: prepared.retainedMissingDecks,
  specialFormatDecks: prepared.decks.filter((deck) =>
    ["limited", "other"].includes(deck.format)
  ).length,
  ...(imported ?? {})
});

export const previewArenaDeckSync = async (
  db: DbHandle,
  options: ArenaDeckSyncOptions = {}
) => summarizePreparedSync(await prepareArenaDeckSync(db, options));

export const importArenaDecks = async (
  db: DbHandle,
  options: ArenaDeckSyncOptions = {}
) => {
  const prepared = await prepareArenaDeckSync(db, options);
  const importedAt = new Date().toISOString();
  const importedDeckIds: string[] = [];
  let decksCreated = 0;
  let decksUpdated = 0;

  db.transaction(() => {
    const insertPlaceholderCard = db.prepare(`
      INSERT OR IGNORE INTO cards (
        id, oracle_id, name, normalized_name, oracle_text, mana_cost, mana_value,
        colors_json, color_identity_json, type_line, rarity, layout, keywords_json,
        legalities_json, image_url, preferred_set_code, preferred_collector_number, released_at
      ) VALUES (
        @id, NULL, @name, @normalizedName, '', NULL, 0,
        '[]', '[]', '', '', 'normal', '[]',
        '{}', NULL, @setCode, NULL, NULL
      )
    `);
    const insertPlaceholderPrint = db.prepare(`
      INSERT OR IGNORE INTO card_prints (
        print_id, card_id, arena_id, set_code, collector_number, games_json, image_url, released_at
      ) VALUES (
        @printId, @cardId, @arenaCardId, @setCode, NULL, '["arena"]', NULL, NULL
      )
    `);
    for (const card of prepared.placeholderCards) {
      insertPlaceholderCard.run({
        id: card.cardId,
        name: card.name,
        normalizedName: normalizeName(card.name),
        setCode: card.setCode
      });
      insertPlaceholderPrint.run({
        printId: `placeholder-arena-print:${card.arenaCardId}`,
        cardId: card.cardId,
        arenaCardId: card.arenaCardId,
        setCode: card.setCode ?? "ARENA"
      });
    }

    const findExisting = db.prepare(
      "SELECT id FROM decks WHERE source = 'arena' AND external_id = ?"
    );
    const insertDeck = db.prepare(`
      INSERT INTO decks (
        id, name, format, notes, created_at, updated_at, source, external_id,
        source_format, source_updated_at, last_played_at, is_favorite
      ) VALUES (
        @id, @name, @format, '', @createdAt, @updatedAt, 'arena', @externalId,
        @sourceFormat, @sourceUpdatedAt, @lastPlayedAt, @isFavorite
      )
    `);
    const updateDeck = db.prepare(`
      UPDATE decks
      SET name = @name,
          format = @format,
          updated_at = @updatedAt,
          source_format = @sourceFormat,
          source_updated_at = @sourceUpdatedAt,
          last_played_at = @lastPlayedAt,
          is_favorite = @isFavorite
      WHERE id = @id
    `);
    const deleteCards = db.prepare("DELETE FROM deck_cards WHERE deck_id = ?");
    const insertCard = db.prepare(`
      INSERT INTO deck_cards (deck_id, card_id, quantity, section)
      VALUES (@deckId, @cardId, @quantity, @section)
    `);

    for (const deck of prepared.decks) {
      const existing = findExisting.get(deck.externalId) as { id: string } | undefined;
      const deckId = existing?.id ?? randomUUID();
      const changed = !existing || deckHasChanged(db, deck, deckId);
      if (!changed) {
        continue;
      }
      const row = {
        id: deckId,
        name: deck.name,
        format: deck.format,
        createdAt: importedAt,
        updatedAt: deck.sourceUpdatedAt ?? importedAt,
        externalId: deck.externalId,
        sourceFormat: deck.sourceFormat,
        sourceUpdatedAt: deck.sourceUpdatedAt,
        lastPlayedAt: deck.lastPlayedAt,
        isFavorite: deck.isFavorite ? 1 : 0
      };
      if (existing) {
        updateDeck.run(row);
        decksUpdated += 1;
      } else {
        insertDeck.run(row);
        decksCreated += 1;
      }
      deleteCards.run(deckId);
      for (const card of deck.cards) {
        insertCard.run({ deckId, ...card });
      }
      importedDeckIds.push(deckId);
    }
  })();

  return summarizePreparedSync(prepared, {
    importedAt,
    decksCreated,
    decksUpdated,
    importedDeckIds
  });
};
