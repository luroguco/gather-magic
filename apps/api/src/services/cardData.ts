import { readFile } from "node:fs/promises";
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

const choosePreferredPrint = (prints: NormalizedCard["prints"]) =>
  [...prints].sort((left, right) => {
    const leftDate = left.releasedAt ?? "";
    const rightDate = right.releasedAt ?? "";
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }
    return left.setCode.localeCompare(right.setCode);
  })[0];

export const syncCardsFromBulkData = (db: DbHandle, cards: ScryfallCard[]) => {
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
  replaceAll(normalizedCards);
  return {
    cardCount: normalizedCards.length,
    printCount: normalizedCards.reduce((count, card) => count + card.prints.length, 0)
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

export const readBulkDataFromFile = async (filename: string) => {
  const content = await readFile(filename, "utf8");
  return JSON.parse(content) as ScryfallCard[];
};
