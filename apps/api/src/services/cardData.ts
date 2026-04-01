import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { buildMechanicTags } from "../lib/mechanics.js";
import type { DbHandle } from "../lib/database.js";
import { ARENA_FORMATS } from "../lib/formats.js";

type ScryfallBulkIndex = {
  data: Array<{
    type: string;
    download_uri: string;
  }>;
};

type ScryfallCard = {
  id: string;
  oracle_id?: string | null;
  arena_id?: number | null;
  name: string;
  oracle_text?: string | null;
  mana_cost?: string | null;
  cmc?: number | null;
  colors?: readonly string[] | null;
  color_identity?: readonly string[] | null;
  type_line?: string | null;
  rarity?: string | null;
  layout?: string | null;
  keywords?: readonly string[] | null;
  legalities?: Record<string, string> | null;
  image_uris?: Record<string, string> | null;
  card_faces?: ReadonlyArray<{
    image_uris?: Record<string, string> | null;
    oracle_text?: string | null;
  }> | null;
  set?: string | null;
  collector_number?: string | null;
  released_at?: string | null;
  games?: readonly string[] | null;
};

type NormalizedCard = {
  id: string;
  name: string;
  normalizedName: string;
  oracleText: string;
  manaCost: string | null;
  manaValue: number;
  colors: string[];
  colorIdentity: string[];
  typeLine: string;
  rarity: string;
  layout: string;
  keywords: string[];
  legalities: Record<string, string>;
  prints: Array<{
    printId: string;
    arenaId: number | null;
    setCode: string;
    collectorNumber: string | null;
    games: string[];
    imageUrl: string | null;
    releasedAt: string | null;
  }>;
  imageUrl: string | null;
  preferredSetCode: string | null;
  preferredCollectorNumber: string | null;
  releasedAt: string | null;
};

const SCRYFALL_BULK_INDEX_URL = "https://api.scryfall.com/bulk-data";
const MTGJSON_ALL_IDENTIFIERS_URL = "https://mtgjson.com/api/v5/AllIdentifiers.json.gz";
const MTGJSON_SET_BASE_URL = "https://mtgjson.com/api/v5";

type MtgJsonIdentifiers = {
  mtgArenaId?: string;
  scryfallId?: string;
};

type MtgJsonCardSet = {
  setCode?: string;
  number?: string;
  identifiers?: MtgJsonIdentifiers;
};

type MtgJsonSet = {
  code?: string;
  cards?: MtgJsonCardSet[];
};

type MtgJsonSetDownload = {
  data?: MtgJsonSet;
};

export type MtgJsonAllIdentifiers = {
  data?: Record<string, MtgJsonSet>;
};

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const getImageUrl = (card: ScryfallCard) =>
  card.image_uris?.normal ??
  card.image_uris?.large ??
  card.card_faces?.[0]?.image_uris?.normal ??
  card.card_faces?.[0]?.image_uris?.large ??
  null;

const isArenaPlayableCard = (card: ScryfallCard) => {
  const hasArenaGame = card.games?.includes("arena") ?? false;
  const hasArenaId = typeof card.arena_id === "number";
  const legalities = card.legalities ?? {};
  const hasArenaFormatLegality = ARENA_FORMATS.some((format) => legalities[format] !== "not_legal");
  return hasArenaGame || hasArenaId || hasArenaFormatLegality;
};

export const collectArenaRelevantSetCodes = (cards: ScryfallCard[]) => {
  const setCodes = new Set<string>();

  for (const card of cards) {
    if (!isArenaPlayableCard(card)) {
      continue;
    }

    const setCode = card.set?.trim().toUpperCase();
    if (setCode) {
      setCodes.add(setCode);
    }
  }

  return [...setCodes].sort();
};

const choosePreferredPrint = (prints: NormalizedCard["prints"]) =>
  [...prints].sort((left, right) => {
    const leftDate = left.releasedAt ?? "";
    const rightDate = right.releasedAt ?? "";
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }
    return left.setCode.localeCompare(right.setCode);
  })[0];

const toSupplementLookupKey = (setCode: string, collectorNumber: string | null) =>
  collectorNumber ? `${setCode.toUpperCase()}::${collectorNumber.trim()}` : null;

const parseArenaId = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildMtgJsonArenaIdLookup = (payload: MtgJsonAllIdentifiers) => {
  const byScryfallPrintId = new Map<string, number>();
  const bySetAndCollectorNumber = new Map<string, number>();

  for (const set of Object.values(payload.data ?? {})) {
    for (const card of set.cards ?? []) {
      const arenaId = parseArenaId(card.identifiers?.mtgArenaId);
      if (arenaId === null) {
        continue;
      }

      const scryfallId = card.identifiers?.scryfallId?.toLowerCase();
      if (scryfallId && !byScryfallPrintId.has(scryfallId)) {
        byScryfallPrintId.set(scryfallId, arenaId);
      }

      const lookupKey = toSupplementLookupKey(card.setCode ?? set.code ?? "", card.number ?? null);
      if (lookupKey && !bySetAndCollectorNumber.has(lookupKey)) {
        bySetAndCollectorNumber.set(lookupKey, arenaId);
      }
    }
  }

  return {
    byScryfallPrintId,
    bySetAndCollectorNumber
  };
};

export const supplementArenaIdsFromMtgJson = (
  normalizedCards: NormalizedCard[],
  payload: MtgJsonAllIdentifiers
) => {
  const lookup = buildMtgJsonArenaIdLookup(payload);
  const seenArenaIds = new Set<number>();

  for (const card of normalizedCards) {
    for (const print of card.prints) {
      if (print.arenaId !== null) {
        seenArenaIds.add(print.arenaId);
      }
    }
  }

  let supplementedPrints = 0;
  let matchedByScryfallId = 0;
  let matchedBySetAndCollectorNumber = 0;
  let skippedConflictingArenaIds = 0;

  for (const card of normalizedCards) {
    for (const print of card.prints) {
      if (print.arenaId !== null) {
        continue;
      }

      const byPrintId = lookup.byScryfallPrintId.get(print.printId.toLowerCase()) ?? null;
      const bySetAndCollector =
        lookup.bySetAndCollectorNumber.get(toSupplementLookupKey(print.setCode, print.collectorNumber) ?? "") ?? null;

      const candidateArenaId = byPrintId ?? bySetAndCollector;
      if (candidateArenaId === null) {
        continue;
      }

      if (seenArenaIds.has(candidateArenaId)) {
        skippedConflictingArenaIds += 1;
        continue;
      }

      print.arenaId = candidateArenaId;
      seenArenaIds.add(candidateArenaId);
      supplementedPrints += 1;

      if (byPrintId !== null) {
        matchedByScryfallId += 1;
      } else {
        matchedBySetAndCollectorNumber += 1;
      }
    }
  }

  return {
    supplementedPrints,
    matchedByScryfallId,
    matchedBySetAndCollectorNumber,
    skippedConflictingArenaIds
  };
};

export const syncCardsFromBulkData = (
  db: DbHandle,
  cards: ScryfallCard[],
  mtgJsonIdentifiers?: MtgJsonAllIdentifiers
) => {
  const grouped = new Map<string, NormalizedCard>();
  const seenArenaIds = new Set<number>();

  for (const card of cards) {
    if (!isArenaPlayableCard(card)) {
      continue;
    }

    const cardId = card.oracle_id ?? card.id;
    const existing = grouped.get(cardId);
    const nextArenaId = typeof card.arena_id === "number" ? card.arena_id : null;
    const uniqueArenaId =
      nextArenaId !== null && !seenArenaIds.has(nextArenaId) ? nextArenaId : null;
    if (uniqueArenaId !== null) {
      seenArenaIds.add(uniqueArenaId);
    }

    const print = {
      printId: card.id,
      arenaId: uniqueArenaId,
      setCode: (card.set ?? "").toUpperCase(),
      collectorNumber: card.collector_number ?? null,
      games: Array.from(card.games ?? []),
      imageUrl: getImageUrl(card),
      releasedAt: card.released_at ?? null
    };

    if (!existing) {
      grouped.set(cardId, {
        id: cardId,
        name: card.name,
        normalizedName: normalizeName(card.name),
        oracleText: card.oracle_text ?? card.card_faces?.map((face) => face.oracle_text ?? "").join("\n") ?? "",
        manaCost: card.mana_cost ?? null,
        manaValue: card.cmc ?? 0,
        colors: Array.from(card.colors ?? []),
        colorIdentity: Array.from(card.color_identity ?? []),
        typeLine: card.type_line ?? "",
        rarity: card.rarity ?? "",
        layout: card.layout ?? "",
        keywords: Array.from(card.keywords ?? []),
        legalities: card.legalities ?? {},
        prints: [print],
        imageUrl: print.imageUrl,
        preferredSetCode: print.setCode,
        preferredCollectorNumber: print.collectorNumber,
        releasedAt: print.releasedAt
      });
      continue;
    }

    existing.prints.push(print);
    const preferredPrint = choosePreferredPrint(existing.prints) ?? print;
    existing.imageUrl = preferredPrint.imageUrl;
    existing.preferredSetCode = preferredPrint.setCode;
    existing.preferredCollectorNumber = preferredPrint.collectorNumber;
    existing.releasedAt = preferredPrint.releasedAt;
  }

  const replaceAll = db.transaction((normalizedCards: NormalizedCard[]) => {
    const upsertCard = db.prepare(`
      INSERT INTO cards (
        id, oracle_id, name, normalized_name, oracle_text, mana_cost, mana_value,
        colors_json, color_identity_json, type_line, rarity, layout, keywords_json,
        legalities_json, image_url, preferred_set_code, preferred_collector_number, released_at
      ) VALUES (
        @id, @oracleId, @name, @normalizedName, @oracleText, @manaCost, @manaValue,
        @colorsJson, @colorIdentityJson, @typeLine, @rarity, @layout, @keywordsJson,
        @legalitiesJson, @imageUrl, @preferredSetCode, @preferredCollectorNumber, @releasedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        oracle_id = excluded.oracle_id,
        name = excluded.name,
        normalized_name = excluded.normalized_name,
        oracle_text = excluded.oracle_text,
        mana_cost = excluded.mana_cost,
        mana_value = excluded.mana_value,
        colors_json = excluded.colors_json,
        color_identity_json = excluded.color_identity_json,
        type_line = excluded.type_line,
        rarity = excluded.rarity,
        layout = excluded.layout,
        keywords_json = excluded.keywords_json,
        legalities_json = excluded.legalities_json,
        image_url = excluded.image_url,
        preferred_set_code = excluded.preferred_set_code,
        preferred_collector_number = excluded.preferred_collector_number,
        released_at = excluded.released_at
    `);

    const deletePrintsForCard = db.prepare(`
      DELETE FROM card_prints
      WHERE card_id = ?
    `);
    const deleteCompetingArenaPrints = db.prepare(`
      DELETE FROM card_prints
      WHERE arena_id = ?
        AND card_id != ?
    `);
    const deleteCompetingPrints = db.prepare(`
      DELETE FROM card_prints
      WHERE print_id = ?
        AND card_id != ?
    `);
    const deleteMechanicsForCard = db.prepare(`
      DELETE FROM card_mechanics
      WHERE card_id = ?
    `);
    const insertPrint = db.prepare(`
      INSERT INTO card_prints (
        print_id, card_id, arena_id, set_code, collector_number, games_json, image_url, released_at
      ) VALUES (
        @printId, @cardId, @arenaId, @setCode, @collectorNumber, @gamesJson, @imageUrl, @releasedAt
      )
    `);

    const insertMechanic = db.prepare(`
      INSERT INTO card_mechanics (card_id, tag_slug, tag_label, tag_type, source_rule)
      VALUES (@cardId, @slug, @label, @type, @sourceRule)
    `);

    for (const card of normalizedCards) {
      upsertCard.run({
        id: card.id,
        oracleId: card.id,
        name: card.name,
        normalizedName: card.normalizedName,
        oracleText: card.oracleText,
        manaCost: card.manaCost,
        manaValue: card.manaValue,
        colorsJson: JSON.stringify(card.colors),
        colorIdentityJson: JSON.stringify(card.colorIdentity),
        typeLine: card.typeLine,
        rarity: card.rarity,
        layout: card.layout,
        keywordsJson: JSON.stringify(card.keywords),
        legalitiesJson: JSON.stringify(card.legalities),
        imageUrl: card.imageUrl,
        preferredSetCode: card.preferredSetCode,
        preferredCollectorNumber: card.preferredCollectorNumber,
        releasedAt: card.releasedAt
      });
      deletePrintsForCard.run(card.id);
      deleteMechanicsForCard.run(card.id);

      for (const print of card.prints) {
        deleteCompetingPrints.run(print.printId, card.id);
        if (print.arenaId !== null) {
          deleteCompetingArenaPrints.run(print.arenaId, card.id);
        }
        insertPrint.run({
          ...print,
          cardId: card.id,
          gamesJson: JSON.stringify(print.games)
        });
      }

      const mechanics = buildMechanicTags(card.keywords, card.oracleText, card.typeLine);
      for (const mechanic of mechanics) {
        insertMechanic.run({
          cardId: card.id,
          ...mechanic
        });
      }
    }
  });

  const normalizedCards = [...grouped.values()];
  const mtgJsonSupplement = mtgJsonIdentifiers
    ? supplementArenaIdsFromMtgJson(normalizedCards, mtgJsonIdentifiers)
    : null;
  replaceAll(normalizedCards);
  return {
    cardCount: normalizedCards.length,
    printCount: normalizedCards.reduce((count, card) => count + card.prints.length, 0),
    supplementedArenaIdCount: mtgJsonSupplement?.supplementedPrints ?? 0,
    supplementedArenaIdByScryfallIdCount: mtgJsonSupplement?.matchedByScryfallId ?? 0,
    supplementedArenaIdBySetCollectorCount: mtgJsonSupplement?.matchedBySetAndCollectorNumber ?? 0,
    skippedConflictingArenaIdCount: mtgJsonSupplement?.skippedConflictingArenaIds ?? 0
  };
};

export const fetchBulkData = async (customDownloadUri?: string): Promise<ScryfallCard[]> => {
  const downloadUri = customDownloadUri ?? (await fetchBulkDownloadUri());
  const response = await fetch(downloadUri, {
    headers: {
      "User-Agent": "mtga-collection-explorer/0.1",
      Accept: "application/json;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download Scryfall bulk cards: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ScryfallCard[];
};

const fetchBulkDownloadUri = async () => {
  const response = await fetch(SCRYFALL_BULK_INDEX_URL, {
    headers: {
      "User-Agent": "mtga-collection-explorer/0.1",
      Accept: "application/json;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Scryfall bulk data index: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as ScryfallBulkIndex;
  const defaultCards = payload.data.find((entry) => entry.type === "default_cards");
  if (!defaultCards) {
    throw new Error("Scryfall bulk index did not include default_cards");
  }
  return defaultCards.download_uri;
};

export const fetchMtgJsonAllIdentifiers = async (
  customDownloadUri = MTGJSON_ALL_IDENTIFIERS_URL
): Promise<MtgJsonAllIdentifiers> => {
  const response = await fetch(customDownloadUri, {
    headers: {
      "User-Agent": "mtga-collection-explorer/0.1",
      Accept: "application/json;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download MTGJSON identifiers: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const content = customDownloadUri.endsWith(".gz") ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  return JSON.parse(content) as MtgJsonAllIdentifiers;
};

const fetchMtgJsonSet = async (setCode: string, customBaseUri = MTGJSON_SET_BASE_URL) => {
  const normalizedSetCode = setCode.trim().toUpperCase();
  const response = await fetch(`${customBaseUri}/${normalizedSetCode}.json.gz`, {
    headers: {
      "User-Agent": "mtga-collection-explorer/0.1",
      Accept: "application/json;q=0.9,*/*;q=0.8"
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Failed to download MTGJSON set ${normalizedSetCode}: ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const content = gunzipSync(buffer).toString("utf8");
  const payload = JSON.parse(content) as MtgJsonSetDownload;
  return payload.data ?? null;
};

export const fetchMtgJsonSetIdentifiersForCards = async (
  cards: ScryfallCard[],
  customBaseUri = MTGJSON_SET_BASE_URL
): Promise<MtgJsonAllIdentifiers> => {
  const setCodes = collectArenaRelevantSetCodes(cards);
  const data: Record<string, MtgJsonSet> = {};

  for (const setCode of setCodes) {
    const setPayload = await fetchMtgJsonSet(setCode, customBaseUri);
    if (setPayload) {
      data[setCode] = setPayload;
    }
  }

  return { data };
};

export const readBulkDataFromFile = async (filename: string) => {
  const content = await readFile(filename, "utf8");
  return JSON.parse(content) as ScryfallCard[];
};

export const readMtgJsonAllIdentifiersFromFile = async (filename: string) => {
  const content = await readFile(filename);
  const parsed = filename.endsWith(".gz") ? gunzipSync(content).toString("utf8") : content.toString("utf8");
  return JSON.parse(parsed) as MtgJsonAllIdentifiers;
};
