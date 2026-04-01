import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { getOwnedCountView } from "../lib/cardCopies.js";
import { createDatabase } from "../lib/database.js";
import { workspaceRoot } from "../lib/paths.js";

type CliOptions = {
  inputPath?: string;
  outPath?: string;
  catalogSource: "database" | "untapped-public";
  untappedBuild: string;
  untappedLocale: string;
};

type RawCollectionMap = Record<string, number>;

type VariantEntry = {
  grpId: number;
  quantity: number;
  setCode: string | null;
  collectorNumber: string | null;
};

type NormalizedCardEntry = {
  name: string;
  cardId: string;
  titleCount: number;
  printCount: number;
  variants: VariantEntry[];
};

type NormalizedPayload = {
  generatedAt: string;
  sourcePath: string;
  extractedPath: string;
  catalogSource: "database" | "untapped-public";
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
  cards: Record<string, NormalizedCardEntry>;
};

type CatalogEntry = {
  name: string;
  cardId: string;
  setCode: string | null;
  collectorNumber: string | null;
};

type CatalogLookup = {
  lookup: Map<number, CatalogEntry>;
  metadata?: NormalizedPayload["catalogMetadata"];
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

type CardRules = {
  typeLine: string;
  oracleText: string;
};

const defaultBasicNames = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest"]);

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    catalogSource: "database",
    untappedBuild: "latest",
    untappedLocale: "en",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (typeof arg !== "string") {
      continue;
    }

    if (arg === "--input" && nextArg) {
      options.inputPath = resolve(process.cwd(), nextArg);
      index += 1;
      continue;
    }

    if (arg === "--out" && nextArg) {
      options.outPath = resolve(process.cwd(), nextArg);
      index += 1;
      continue;
    }

    if (arg === "--catalog-source" && nextArg) {
      if (nextArg !== "database" && nextArg !== "untapped-public") {
        throw new Error(`Unsupported --catalog-source value: ${nextArg}`);
      }
      options.catalogSource = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--untapped-build" && nextArg) {
      options.untappedBuild = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--untapped-locale" && nextArg) {
      options.untappedLocale = nextArg;
      index += 1;
    }
  }

  return options;
};

const isNumericKeyedMap = (value: unknown): value is RawCollectionMap => {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([key, entryValue]) => /^\d+$/.test(key) && typeof entryValue === "number");
};

const findCollectionMap = (value: unknown, path = "root"): { map: RawCollectionMap; path: string } | null => {
  if (isNumericKeyedMap(value)) {
    return { map: value, path };
  }

  if (value == null || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findCollectionMap(value[index], `${path}[${index}]`);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const found = findCollectionMap(nestedValue, `${path}.${key}`);
    if (found) {
      return found;
    }
  }

  return null;
};

const formatNumber = (value: number) => value.toLocaleString();

const buildDatabaseCatalogLookup = (): CatalogLookup => {
  const db = createDatabase();
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
      collectorNumber: row.collector_number,
    });
  }

  db.close();
  return { lookup };
};

const buildCardRulesLookup = () => {
  const db = createDatabase();
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
      oracleText: row.oracle_text,
    });
  }

  db.close();
  return lookup;
};

const buildUntappedCardsUrl = (build: string) => `https://mtgajson.untapped.gg/v1/${build}/cards.json`;

const buildUntappedLocaleUrl = (build: string, locale: string) =>
  `https://mtgajson.untapped.gg/v1/${build}/loc_${locale}.json`;

const extractUntappedActualBuild = (url: string) => /\/v1\/([^/]+)\/.+/.exec(url)?.[1] ?? null;

const fetchUntappedPublicCatalogLookup = async (build: string, locale: string): Promise<CatalogLookup> => {
  const [cardsResponse, localeResponse] = await Promise.all([
    fetch(buildUntappedCardsUrl(build), {
      headers: {
        "User-Agent": "mtga-collection-explorer/0.1",
        Accept: "application/json;q=0.9,*/*;q=0.8",
      },
    }),
    fetch(buildUntappedLocaleUrl(build, locale), {
      headers: {
        "User-Agent": "mtga-collection-explorer/0.1",
        Accept: "application/json;q=0.9,*/*;q=0.8",
      },
    }),
  ]);

  if (!cardsResponse.ok) {
    throw new Error(
      `Failed to download Untapped cards catalog: ${cardsResponse.status} ${cardsResponse.statusText}`,
    );
  }

  if (!localeResponse.ok) {
    throw new Error(
      `Failed to download Untapped locale catalog: ${localeResponse.status} ${localeResponse.statusText}`,
    );
  }

  const [cards, localeEntries] = (await Promise.all([
    cardsResponse.json(),
    localeResponse.json(),
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
      collectorNumber: card.collectorNumber ?? null,
    });
  }

  return {
    lookup,
    metadata: {
      build: extractUntappedActualBuild(cardsResponse.url),
      locale,
    },
  };
};

const loadCatalogLookup = async (options: CliOptions): Promise<CatalogLookup> => {
  if (options.catalogSource === "untapped-public") {
    return fetchUntappedPublicCatalogLookup(options.untappedBuild, options.untappedLocale);
  }

  return buildDatabaseCatalogLookup();
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = options.inputPath;

  if (!inputPath) {
    throw new Error("Pass --input <path-to-untapped-collection.json>.");
  }

  const outPath = options.outPath ?? resolve(workspaceRoot, "data/untapped-collection-normalized.json");
  const rawPayload = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
  const found = findCollectionMap(rawPayload);

  if (!found) {
    throw new Error("Could not find a numeric grpId -> quantity map in the input JSON.");
  }

  const catalog = await loadCatalogLookup(options);
  const cardRulesLookup = buildCardRulesLookup();
  const cards = new Map<string, NormalizedCardEntry>();
  const unmatchedEntries: NormalizedPayload["unmatchedEntries"] = [];
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
      variants: [],
    };

    existing.printCount += quantity;
    existing.variants.push({
      grpId,
      quantity,
      setCode: row.setCode,
      collectorNumber: row.collectorNumber,
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
        variants: entry.variants.sort((left, right) => right.quantity - left.quantity || left.grpId - right.grpId),
      };
    });

  const payload: NormalizedPayload = {
    generatedAt: new Date().toISOString(),
    sourcePath: inputPath,
    extractedPath: found.path,
    catalogSource: options.catalogSource,
    ...(catalog.metadata ? { catalogMetadata: catalog.metadata } : {}),
    rawEntryCount: Object.keys(found.map).length,
    matchedGrpIds,
    unmatchedGrpIds: unmatchedEntries.length,
    unmatchedEntries: unmatchedEntries.sort((left, right) => right.quantity - left.quantity || left.grpId - right.grpId),
    cards: Object.fromEntries(
      normalizedEntries
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => [entry.name, entry]),
    ),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2));

  const uniqueCards = Object.keys(payload.cards).length;
  const titleLevelOwnedTotal = Object.values(payload.cards).reduce((sum, entry) => sum + entry.titleCount, 0);
  const printLevelOwnedTotal = Object.values(payload.cards).reduce((sum, entry) => sum + entry.printCount, 0);

  console.log("Untapped collection dump normalized");
  console.log(`  input: ${basename(inputPath)}`);
  console.log(`  extracted path: ${payload.extractedPath}`);
  console.log(`  catalog source: ${payload.catalogSource}`);
  if (payload.catalogMetadata?.build) {
    console.log(`  catalog build: ${payload.catalogMetadata.build}`);
  }
  if (payload.catalogMetadata?.locale) {
    console.log(`  catalog locale: ${payload.catalogMetadata.locale}`);
  }
  console.log(`  raw grpId entries: ${formatNumber(payload.rawEntryCount)}`);
  console.log(`  matched grpIds: ${formatNumber(payload.matchedGrpIds)}`);
  console.log(`  unmatched grpIds: ${formatNumber(payload.unmatchedGrpIds)}`);
  console.log(`  unique matched cards: ${formatNumber(uniqueCards)}`);
  console.log(`  title-level owned total: ${formatNumber(titleLevelOwnedTotal)}`);
  console.log(`  print-level owned total: ${formatNumber(printLevelOwnedTotal)}`);
  console.log(`  output: ${outPath}`);

  if (payload.unmatchedEntries.length) {
    console.log("  unmatched sample:");
    for (const entry of payload.unmatchedEntries.slice(0, 10)) {
      console.log(`    grpId ${entry.grpId}: qty ${entry.quantity}`);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
