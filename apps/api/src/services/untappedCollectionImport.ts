import type { DbHandle } from "../lib/database.js";
import { getOwnedCountView } from "../lib/cardCopies.js";

export type UntappedCatalogSource = "database" | "untapped-public";
export type CollectionImportSource = "untapped-json" | "collector-snapshot";

type RawCollectionMap = Record<string, number>;
type CollectorSnapshotPayload = {
  snapshotVersion: number;
  capturedAt?: string;
  platform?: string;
  collectorVersion?: string;
  mtgaPid?: number;
  diagnostics?: {
    source?: string;
    warnings?: string[];
  };
  collection: RawCollectionMap;
};

export type CollectorSnapshotMetadata = {
  snapshotVersion: number;
  capturedAt?: string;
  platform?: string;
  collectorVersion?: string;
  mtgaPid?: number;
  diagnostics?: {
    source?: string;
    warnings?: string[];
  };
};

export type UntappedVariantEntry = {
  grpId: number;
  quantity: number;
  setCode: string | null;
  collectorNumber: string | null;
};

export type NormalizedUntappedCardEntry = {
  name: string;
  cardId: string;
  titleCount: number;
  printCount: number;
  variants: UntappedVariantEntry[];
};

export type NormalizedUntappedPayload = {
  generatedAt: string;
  extractedPath: string;
  catalogSource: UntappedCatalogSource;
  snapshotMetadata?: CollectorSnapshotMetadata;
  catalogMetadata?: {
    build?: string | null;
    locale?: string;
  };
  rawEntryCount: number;
  matchedGrpIds: number;
  unmatchedGrpIds: number;
  unmatchedEntries: Array<{
    grpId: number;
    quantity: number;
  }>;
  cards: Record<string, NormalizedUntappedCardEntry>;
};

export type CollectionImportSummary = {
  source: CollectionImportSource;
  importedAt?: string;
  extractedPath: string;
  catalogSource: UntappedCatalogSource;
  snapshotMetadata?: CollectorSnapshotMetadata;
  catalogMetadata?: {
    build?: string | null;
    locale?: string;
  };
  rawEntryCount: number;
  matchedGrpIds: number;
  unmatchedGrpIds: number;
  unmatchedEntries: Array<{
    grpId: number;
    quantity: number;
  }>;
  cardsMatched: number;
  ownedTitles: number;
  ownedCopies: number;
  rawOwnedCopies: number;
  unresolvedCards: Array<{
    name: string;
    titleCount: number;
    printCount: number;
    reason: string;
  }>;
  diff: {
    addedTitles: number;
    removedTitles: number;
    changedTitles: number;
    unchangedTitles: number;
  };
};

export type UntappedImportSummary = CollectionImportSummary;

type CardRules = {
  typeLine: string;
  oracleText: string;
};

type CatalogEntry = {
  name: string;
  cardId: string;
  setCode: string | null;
  collectorNumber: string | null;
};

type CatalogLookup = {
  lookup: Map<number, CatalogEntry>;
  metadata?: NormalizedUntappedPayload["catalogMetadata"];
};

type UntappedPublicCard = {
  grpid: number;
  titleId: number;
  set?: string;
  collectorNumber?: string;
};

type UntappedLocaleEntry = {
  id: number;
  text: string;
};

type ResolvedCollectionEntry = {
  cardId: string;
  name: string;
  count: number;
  printCount: number;
  sourceRowsJson: string;
  unresolved: boolean;
  reason: string;
  preferredSetCode: string | null;
};

const DEFAULT_UNTAPPED_BUILD = "latest";
const DEFAULT_UNTAPPED_LOCALE = "en";
const defaultBasicNames = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
const untappedCatalogCache = new Map<string, Promise<CatalogLookup>>();

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const isNumericKeyedMap = (value: unknown): value is RawCollectionMap => {
  if (!isRecord(value)) {
    return false;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, entryValue]) => /^\d+$/.test(key) && typeof entryValue === "number");
};

const normalizeCollectorSnapshotMetadata = (value: CollectorSnapshotPayload): CollectorSnapshotMetadata => ({
  snapshotVersion: value.snapshotVersion,
  ...(typeof value.capturedAt === "string" ? { capturedAt: value.capturedAt } : {}),
  ...(typeof value.platform === "string" ? { platform: value.platform } : {}),
  ...(typeof value.collectorVersion === "string" ? { collectorVersion: value.collectorVersion } : {}),
  ...(typeof value.mtgaPid === "number" ? { mtgaPid: value.mtgaPid } : {}),
  ...(value.diagnostics
    ? {
        diagnostics: {
          ...(typeof value.diagnostics.source === "string" ? { source: value.diagnostics.source } : {}),
          ...(Array.isArray(value.diagnostics.warnings)
            ? {
                warnings: value.diagnostics.warnings.filter((warning): warning is string => typeof warning === "string")
              }
            : {})
        }
      }
    : {})
});

const isCollectorSnapshotPayload = (value: unknown): value is CollectorSnapshotPayload => {
  if (!isRecord(value)) {
    return false;
  }

  return Number.isInteger(value.snapshotVersion) && isNumericKeyedMap(value.collection);
};

export const findCollectionOwnershipMap = (
  value: unknown,
  path = "root"
): { map: RawCollectionMap; path: string; snapshotMetadata?: CollectorSnapshotMetadata } | null => {
  if (isCollectorSnapshotPayload(value)) {
    return {
      map: value.collection,
      path: `${path}.collection`,
      snapshotMetadata: normalizeCollectorSnapshotMetadata(value)
    };
  }

  if (isNumericKeyedMap(value)) {
    return { map: value, path };
  }

  if (value == null || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findCollectionOwnershipMap(value[index], `${path}[${index}]`);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const found = findCollectionOwnershipMap(nestedValue, `${path}.${key}`);
    if (found) {
      return found;
    }
  }

  return null;
};

export const findUntappedCollectionMap = findCollectionOwnershipMap;

const buildDatabaseCatalogLookup = (db: DbHandle): CatalogLookup => {
  const rows = db
    .prepare(`
      SELECT
        arena_id,
        cards.id AS card_id,
        cards.name AS name,
        card_prints.set_code AS set_code,
        card_prints.collector_number AS collector_number
      FROM card_prints
      JOIN cards ON cards.id = card_prints.card_id
      WHERE arena_id IS NOT NULL
    `)
    .all() as Array<{
      arena_id: number;
      card_id: string;
      name: string;
      set_code: string | null;
      collector_number: string | null;
    }>;

  const lookup = new Map<number, CatalogEntry>();
  for (const row of rows) {
    lookup.set(row.arena_id, {
      name: row.name,
      cardId: row.card_id,
      setCode: row.set_code,
      collectorNumber: row.collector_number
    });
  }

  return { lookup };
};

const buildCardRulesLookup = (db: DbHandle) => {
  const rows = db
    .prepare(`
      SELECT
        name,
        COALESCE(type_line, '') AS type_line,
        COALESCE(oracle_text, '') AS oracle_text
      FROM cards
    `)
    .all() as Array<{
      name: string;
      type_line: string;
      oracle_text: string;
    }>;

  const lookup = new Map<string, CardRules>();
  for (const row of rows) {
    lookup.set(row.name.toLowerCase(), {
      typeLine: row.type_line,
      oracleText: row.oracle_text
    });
  }

  return lookup;
};

const buildUntappedCardsUrl = (build: string) => `https://mtgajson.untapped.gg/v1/${build}/cards.json`;
const buildUntappedLocaleUrl = (build: string, locale: string) =>
  `https://mtgajson.untapped.gg/v1/${build}/loc_${locale}.json`;
const extractUntappedActualBuild = (url: string) => /\/v1\/([^/]+)\/.+/.exec(url)?.[1] ?? null;

const fetchUntappedPublicCatalogLookup = async (build: string, locale: string): Promise<CatalogLookup> => {
  const cacheKey = `${build}::${locale}`;
  const cached = untappedCatalogCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const [cardsResponse, localeResponse] = await Promise.all([
      fetch(buildUntappedCardsUrl(build), {
        headers: {
          "User-Agent": "mtga-collection-explorer/0.1",
          Accept: "application/json;q=0.9,*/*;q=0.8"
        }
      }),
      fetch(buildUntappedLocaleUrl(build, locale), {
        headers: {
          "User-Agent": "mtga-collection-explorer/0.1",
          Accept: "application/json;q=0.9,*/*;q=0.8"
        }
      })
    ]);

    if (!cardsResponse.ok) {
      throw new Error(
        `Failed to download Untapped cards catalog: ${cardsResponse.status} ${cardsResponse.statusText}`
      );
    }

    if (!localeResponse.ok) {
      throw new Error(
        `Failed to download Untapped locale catalog: ${localeResponse.status} ${localeResponse.statusText}`
      );
    }

    const [cards, localeEntries] = (await Promise.all([
      cardsResponse.json(),
      localeResponse.json()
    ])) as [UntappedPublicCard[], UntappedLocaleEntry[]];

    const namesByTitleId = new Map<number, string>();
    for (const entry of localeEntries) {
      if (typeof entry.id === "number" && typeof entry.text === "string" && entry.text.trim().length > 0) {
        namesByTitleId.set(entry.id, entry.text);
      }
    }

    const lookup = new Map<number, CatalogEntry>();
    for (const card of cards) {
      const name = namesByTitleId.get(card.titleId);
      if (!name) {
        continue;
      }

      lookup.set(card.grpid, {
        name,
        cardId: `title:${card.titleId}`,
        setCode: card.set ?? null,
        collectorNumber: card.collectorNumber ?? null
      });
    }

    return {
      lookup,
      metadata: {
        build: extractUntappedActualBuild(cardsResponse.url),
        locale
      }
    };
  })();

  untappedCatalogCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    untappedCatalogCache.delete(cacheKey);
    throw error;
  }
};

const loadCatalogLookup = async (
  db: DbHandle,
  options: {
    catalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
  }
): Promise<CatalogLookup> => {
  if ((options.catalogSource ?? "untapped-public") === "database") {
    return buildDatabaseCatalogLookup(db);
  }

  return fetchUntappedPublicCatalogLookup(
    options.untappedBuild ?? DEFAULT_UNTAPPED_BUILD,
    options.untappedLocale ?? DEFAULT_UNTAPPED_LOCALE
  );
};

export const normalizeUntappedCollectionPayload = async (
  db: DbHandle,
  rawPayload: unknown,
  options?: {
    catalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
  }
): Promise<NormalizedUntappedPayload> => {
  const found = findCollectionOwnershipMap(rawPayload);
  if (!found) {
    throw new Error("Could not find a numeric grpId -> quantity map in the input JSON.");
  }

  const catalogSource = options?.catalogSource ?? "untapped-public";
  const catalog = await loadCatalogLookup(db, options ?? {});
  const cardRulesLookup = buildCardRulesLookup(db);
  const cards = new Map<string, NormalizedUntappedCardEntry>();
  const unmatchedEntries: NormalizedUntappedPayload["unmatchedEntries"] = [];
  let matchedGrpIds = 0;

  for (const [grpIdText, quantity] of Object.entries(found.map)) {
    if (quantity <= 0) {
      continue;
    }

    const grpId = Number.parseInt(grpIdText, 10);
    if (!Number.isFinite(grpId)) {
      continue;
    }

    const row = catalog.lookup.get(grpId);
    if (!row) {
      unmatchedEntries.push({ grpId, quantity });
      continue;
    }

    matchedGrpIds += 1;

    const existing = cards.get(row.cardId) ?? {
      name: row.name,
      cardId: row.cardId,
      titleCount: 0,
      printCount: 0,
      variants: []
    };

    existing.printCount += quantity;
    existing.variants.push({
      grpId,
      quantity,
      setCode: row.setCode,
      collectorNumber: row.collectorNumber
    });

    cards.set(row.cardId, existing);
  }

  const normalizedEntries = [...cards.values()]
    .filter((entry) => !defaultBasicNames.has(entry.name))
    .map((entry) => {
      const rules = cardRulesLookup.get(entry.name.toLowerCase());
      const titleCount = rules
        ? getOwnedCountView(entry.printCount, rules.oracleText, rules.typeLine).playableOwnedCount
        : entry.printCount;

      return {
        ...entry,
        titleCount,
        variants: entry.variants.sort(
          (left, right) => right.quantity - left.quantity || left.grpId - right.grpId
        )
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    extractedPath: found.path,
    catalogSource,
    ...(found.snapshotMetadata ? { snapshotMetadata: found.snapshotMetadata } : {}),
    ...(catalog.metadata ? { catalogMetadata: catalog.metadata } : {}),
    rawEntryCount: Object.keys(found.map).length,
    matchedGrpIds,
    unmatchedGrpIds: unmatchedEntries.length,
    unmatchedEntries: unmatchedEntries.sort(
      (left, right) => right.quantity - left.quantity || left.grpId - right.grpId
    ),
    cards: Object.fromEntries(
      normalizedEntries
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => [entry.name, entry])
    )
  };
};

const chooseBestCandidateCardId = (
  scoredCandidates: Map<string, { quantity: number; variantMatches: number }>
) => {
  const ranked = [...scoredCandidates.entries()].sort((left, right) => {
    const quantityDiff = right[1].quantity - left[1].quantity;
    if (quantityDiff !== 0) {
      return quantityDiff;
    }
    const variantDiff = right[1].variantMatches - left[1].variantMatches;
    if (variantDiff !== 0) {
      return variantDiff;
    }
    return left[0].localeCompare(right[0]);
  });

  if (ranked.length === 0) {
    return null;
  }

  if (ranked.length === 1) {
    return ranked[0]?.[0] ?? null;
  }

  const bestEntry = ranked[0];
  const nextEntry = ranked[1];
  if (!bestEntry || !nextEntry) {
    return bestEntry?.[0] ?? null;
  }

  const [bestId, bestScore] = bestEntry;
  const [, nextScore] = nextEntry;

  const isUniqueBest =
    bestScore.quantity > nextScore.quantity ||
    (bestScore.quantity === nextScore.quantity && bestScore.variantMatches > nextScore.variantMatches);

  return isUniqueBest ? bestId : null;
};

const resolveNormalizedCardsToLocalCollection = (
  db: DbHandle,
  normalizedPayload: NormalizedUntappedPayload
) => {
  const matchByNameAndSet = db.prepare(`
    SELECT DISTINCT cards.id AS card_id
    FROM cards
    INNER JOIN card_prints ON card_prints.card_id = cards.id
    WHERE cards.normalized_name = ?
      AND card_prints.set_code = ?
  `);
  const matchByName = db.prepare(`
    SELECT id AS card_id
    FROM cards
    WHERE normalized_name = ?
  `);

  const entries = new Map<string, ResolvedCollectionEntry>();
  const unresolvedCards: UntappedImportSummary["unresolvedCards"] = [];

  for (const card of Object.values(normalizedPayload.cards)) {
    const normalizedName = normalizeName(card.name);
    const candidateScores = new Map<string, { quantity: number; variantMatches: number }>();

    for (const variant of card.variants) {
      if (!variant.setCode) {
        continue;
      }

      const rows = matchByNameAndSet.all(normalizedName, variant.setCode.toUpperCase()) as Array<{
        card_id: string;
      }>;

      for (const row of rows) {
        const score = candidateScores.get(row.card_id) ?? { quantity: 0, variantMatches: 0 };
        score.quantity += variant.quantity;
        score.variantMatches += 1;
        candidateScores.set(row.card_id, score);
      }
    }

    let resolvedCardId = chooseBestCandidateCardId(candidateScores);
    let reason = resolvedCardId ? "name+set" : "";

    if (!resolvedCardId) {
      const nameMatches = matchByName.all(normalizedName) as Array<{ card_id: string }>;
      if (nameMatches.length === 1) {
        resolvedCardId = nameMatches[0]?.card_id ?? null;
        reason = "name";
      }
    }

    if (!resolvedCardId) {
      resolvedCardId = `placeholder:untapped:${normalizedName.replace(/[^a-z0-9]+/g, "-")}`;
      reason = "placeholder";
      unresolvedCards.push({
        name: card.name,
        titleCount: card.titleCount,
        printCount: card.printCount,
        reason: "Could not match Untapped title to a local canonical card"
      });
    }

    entries.set(resolvedCardId, {
      cardId: resolvedCardId,
      name: card.name,
      count: card.titleCount,
      printCount: card.printCount,
      sourceRowsJson: JSON.stringify(card.variants),
      unresolved: reason === "placeholder",
      reason,
      preferredSetCode: card.variants[0]?.setCode ?? null
    });
  }

  return {
    entries,
    unresolvedCards
  };
};

const computeCollectionDiff = (db: DbHandle, nextEntries: Map<string, ResolvedCollectionEntry>) => {
  const currentRows = db
    .prepare(`
      SELECT card_id, count
      FROM collection_cards
    `)
    .all() as Array<{
      card_id: string;
      count: number;
    }>;

  const currentCounts = new Map(currentRows.map((row) => [row.card_id, row.count]));

  let addedTitles = 0;
  let changedTitles = 0;
  let unchangedTitles = 0;

  for (const [cardId, entry] of nextEntries.entries()) {
    const currentCount = currentCounts.get(cardId);
    if (typeof currentCount !== "number") {
      addedTitles += 1;
      continue;
    }

    if (currentCount === entry.count) {
      unchangedTitles += 1;
    } else {
      changedTitles += 1;
    }
  }

  let removedTitles = 0;
  for (const cardId of currentCounts.keys()) {
    if (!nextEntries.has(cardId)) {
      removedTitles += 1;
    }
  }

  return {
    addedTitles,
    removedTitles,
    changedTitles,
    unchangedTitles
  };
};

const replaceCollectionSnapshot = (db: DbHandle, entries: Map<string, ResolvedCollectionEntry>, importedAt: string) => {
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM collection_cards").run();
    const insertPlaceholderCardIfNeeded = db.prepare(`
      INSERT OR IGNORE INTO cards (
        id, oracle_id, name, normalized_name, oracle_text, mana_cost, mana_value,
        colors_json, color_identity_json, type_line, rarity, layout, keywords_json,
        legalities_json, image_url, preferred_set_code, preferred_collector_number, released_at
      ) VALUES (
        @id, NULL, @name, @normalized_name, '', NULL, 0,
        '[]', '[]', '', '', 'normal', '[]',
        '{}', NULL, @preferred_set_code, NULL, NULL
      )
    `);
    const insert = db.prepare(`
      INSERT INTO collection_cards (card_id, count, print_count, source_rows_json, imported_at)
      VALUES (@card_id, @count, @print_count, @source_rows_json, @imported_at)
    `);

    for (const entry of entries.values()) {
      if (entry.unresolved) {
        insertPlaceholderCardIfNeeded.run({
          id: entry.cardId,
          name: entry.name,
          normalized_name: normalizeName(entry.name),
          preferred_set_code: entry.preferredSetCode
        });
      }

      insert.run({
        card_id: entry.cardId,
        count: entry.count,
        print_count: entry.printCount,
        source_rows_json: entry.sourceRowsJson,
        imported_at: importedAt
      });
    }
  });

  transaction();
};

const buildCollectionImportSummary = (
  source: CollectionImportSource,
  normalizedPayload: NormalizedUntappedPayload,
  entries: Map<string, ResolvedCollectionEntry>,
  unresolvedCards: UntappedImportSummary["unresolvedCards"],
  diff: UntappedImportSummary["diff"],
  importedAt?: string
): CollectionImportSummary => ({
  source,
  ...(importedAt ? { importedAt } : {}),
  extractedPath: normalizedPayload.extractedPath,
  catalogSource: normalizedPayload.catalogSource,
  ...(normalizedPayload.snapshotMetadata ? { snapshotMetadata: normalizedPayload.snapshotMetadata } : {}),
  ...(normalizedPayload.catalogMetadata ? { catalogMetadata: normalizedPayload.catalogMetadata } : {}),
  rawEntryCount: normalizedPayload.rawEntryCount,
  matchedGrpIds: normalizedPayload.matchedGrpIds,
  unmatchedGrpIds: normalizedPayload.unmatchedGrpIds,
  unmatchedEntries: normalizedPayload.unmatchedEntries,
  cardsMatched: entries.size,
  ownedTitles: entries.size,
  ownedCopies: [...entries.values()].reduce((sum, entry) => sum + entry.count, 0),
  rawOwnedCopies: [...entries.values()].reduce((sum, entry) => sum + entry.printCount, 0),
  unresolvedCards,
  diff
});

const prepareCollectionImport = async (
  db: DbHandle,
  rawJson: string,
  options?: {
    catalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
  }
) => {
  const rawPayload = JSON.parse(rawJson) as unknown;
  const normalizedPayload = await normalizeUntappedCollectionPayload(db, rawPayload, options);
  const { entries, unresolvedCards } = resolveNormalizedCardsToLocalCollection(db, normalizedPayload);
  const diff = computeCollectionDiff(db, entries);

  return {
    normalizedPayload,
    entries,
    unresolvedCards,
    diff
  };
};

export const previewUntappedCollectionImport = async (
  db: DbHandle,
  rawJson: string,
  options?: {
    catalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
  }
): Promise<UntappedImportSummary> => {
  const prepared = await prepareCollectionImport(db, rawJson, options);
  return buildCollectionImportSummary(
    "untapped-json",
    prepared.normalizedPayload,
    prepared.entries,
    prepared.unresolvedCards,
    prepared.diff
  );
};

export const importUntappedCollectionJson = async (
  db: DbHandle,
  rawJson: string,
  options?: {
    catalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
  }
): Promise<UntappedImportSummary> => {
  const prepared = await prepareCollectionImport(db, rawJson, options);
  const importedAt = new Date().toISOString();
  replaceCollectionSnapshot(db, prepared.entries, importedAt);

  return buildCollectionImportSummary(
    "untapped-json",
    prepared.normalizedPayload,
    prepared.entries,
    prepared.unresolvedCards,
    prepared.diff,
    importedAt
  );
};

export const previewCollectorSnapshotImport = async (
  db: DbHandle,
  rawJson: string,
  options?: {
    catalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
  }
): Promise<CollectionImportSummary> => {
  const prepared = await prepareCollectionImport(db, rawJson, options);
  return buildCollectionImportSummary(
    "collector-snapshot",
    prepared.normalizedPayload,
    prepared.entries,
    prepared.unresolvedCards,
    prepared.diff
  );
};

export const importCollectorSnapshotJson = async (
  db: DbHandle,
  rawJson: string,
  options?: {
    catalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
  }
): Promise<CollectionImportSummary> => {
  const prepared = await prepareCollectionImport(db, rawJson, options);
  const importedAt = new Date().toISOString();
  replaceCollectionSnapshot(db, prepared.entries, importedAt);

  return buildCollectionImportSummary(
    "collector-snapshot",
    prepared.normalizedPayload,
    prepared.entries,
    prepared.unresolvedCards,
    prepared.diff,
    importedAt
  );
};
