import { getOwnedCountView } from "../lib/cardCopies.js";
import type { DbHandle } from "../lib/database.js";
import type { ArenaFormat } from "../lib/formats.js";
import { getMechanicDefinition } from "../lib/mechanics.js";
import type { CardSummary } from "../lib/types.js";

export type SearchFilters = {
  q?: string | undefined;
  format?: ArenaFormat | undefined;
  colors?: string[] | undefined;
  mechanics?: string[] | undefined;
  types?: string[] | undefined;
  subtypes?: string[] | undefined;
  rarity?: string[] | undefined;
  sets?: string[] | undefined;
  ownedOnly?: boolean | undefined;
  manaValueMin?: number | undefined;
  manaValueMax?: number | undefined;
  page: number;
  pageSize: number;
};

const parseJsonArray = (value: string | null) => (value ? (JSON.parse(value) as string[]) : []);
const parseJsonObject = (value: string | null) =>
  value ? (JSON.parse(value) as Record<string, string>) : {};

const mapCardRow = (row: Record<string, unknown>): CardSummary => {
  const oracleText = String(row.oracle_text ?? "");
  const typeLine = String(row.type_line ?? "");
  const rawOwnedCount = Number(row.owned_count ?? 0);
  const mechanics = (JSON.parse(String(row.mechanics_json ?? "[]")) as Array<{
    slug: string;
    label: string;
    type: "keyword" | "derived";
  }>).map((mechanic) => ({
    ...mechanic,
    definition: getMechanicDefinition(mechanic.slug, mechanic.label, mechanic.type)
  }));
  const ownedCountView = getOwnedCountView(rawOwnedCount, oracleText, typeLine);

  return {
    id: String(row.id),
    name: String(row.name),
    oracleText,
    manaCost: row.mana_cost ? String(row.mana_cost) : null,
    manaValue: Number(row.mana_value ?? 0),
    colors: parseJsonArray((row.colors_json as string | null) ?? null),
    colorIdentity: parseJsonArray((row.color_identity_json as string | null) ?? null),
    typeLine,
    rarity: String(row.rarity ?? ""),
    preferredSetCode: row.preferred_set_code ? String(row.preferred_set_code) : null,
    preferredCollectorNumber: row.preferred_collector_number ? String(row.preferred_collector_number) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    keywords: parseJsonArray((row.keywords_json as string | null) ?? null),
    legalities: parseJsonObject((row.legalities_json as string | null) ?? null),
    ownedCount: ownedCountView.playableOwnedCount,
    rawOwnedCount: ownedCountView.rawOwnedCount,
    deckBuildingLimit: ownedCountView.deckBuildingLimit,
    mechanics
  };
};

export const searchCards = (db: DbHandle, filters: SearchFilters) => {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize
  };

  if (filters.q) {
    conditions.push("(cards.normalized_name LIKE @query OR lower(cards.oracle_text) LIKE @query)");
    params.query = `%${filters.q.trim().toLowerCase()}%`;
  }

  if (filters.format) {
    conditions.push(`json_extract(cards.legalities_json, '$.${filters.format}') IN ('legal', 'restricted')`);
  }

  if (filters.colors?.length) {
    const colorClauses = filters.colors.map((color, index) => {
      params[`color${index}`] = `%\"${color}\"%`;
      return `cards.colors_json LIKE @color${index}`;
    });
    conditions.push(`(${colorClauses.join(" OR ")})`);
  }

  if (filters.types?.length) {
    const typeClauses = filters.types.map((type, index) => {
      params[`type${index}`] = `%${type.toLowerCase()}%`;
      return `lower(cards.type_line) LIKE @type${index}`;
    });
    conditions.push(`(${typeClauses.join(" OR ")})`);
  }

  if (filters.subtypes?.length) {
    const subtypeClauses = filters.subtypes.map((subtype, index) => {
      params[`subtype${index}`] = `%${subtype.toLowerCase()}%`;
      return `lower(cards.type_line) LIKE @subtype${index}`;
    });
    conditions.push(`(${subtypeClauses.join(" OR ")})`);
  }

  if (filters.rarity?.length) {
    const rarityClauses = filters.rarity.map((rarity, index) => {
      params[`rarity${index}`] = rarity.toLowerCase();
      return `lower(cards.rarity) = @rarity${index}`;
    });
    conditions.push(`(${rarityClauses.join(" OR ")})`);
  }

  if (filters.sets?.length) {
    const setClauses = filters.sets.map((set, index) => {
      params[`set${index}`] = set.toUpperCase();
      return `cards.preferred_set_code = @set${index}`;
    });
    conditions.push(`(${setClauses.join(" OR ")})`);
  }

  if (filters.ownedOnly) {
    conditions.push("coalesce(collection_cards.count, 0) > 0");
  }

  if (typeof filters.manaValueMin === "number") {
    conditions.push("cards.mana_value >= @manaValueMin");
    params.manaValueMin = filters.manaValueMin;
  }

  if (typeof filters.manaValueMax === "number") {
    conditions.push("cards.mana_value <= @manaValueMax");
    params.manaValueMax = filters.manaValueMax;
  }

  if (filters.mechanics?.length) {
    const mechanicsList = filters.mechanics.map((_, index) => `@mechanic${index}`).join(", ");
    filters.mechanics.forEach((mechanic, index) => {
      params[`mechanic${index}`] = mechanic;
    });
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM card_mechanics mechanic_filter
        WHERE mechanic_filter.card_id = cards.id
          AND mechanic_filter.tag_slug IN (${mechanicsList})
      )
    `);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = db
    .prepare(
      `
      SELECT COUNT(*) AS total
      FROM cards
      LEFT JOIN collection_cards ON collection_cards.card_id = cards.id
      ${where}
    `
    )
    .get(params) as { total: number };

  const rows = db
    .prepare(
      `
      SELECT
        cards.*,
        coalesce(collection_cards.count, 0) AS owned_count,
        (
          SELECT json_group_array(
            json_object(
              'slug', card_mechanics.tag_slug,
              'label', card_mechanics.tag_label,
              'type', card_mechanics.tag_type
            )
          )
          FROM card_mechanics
          WHERE card_mechanics.card_id = cards.id
        ) AS mechanics_json
      FROM cards
      LEFT JOIN collection_cards ON collection_cards.card_id = cards.id
      ${where}
      ORDER BY coalesce(collection_cards.count, 0) DESC, cards.name ASC
      LIMIT @limit OFFSET @offset
    `
    )
    .all(params) as Record<string, unknown>[];

  return {
    total: totalRow.total,
    page: filters.page,
    pageSize: filters.pageSize,
    items: rows.map(mapCardRow)
  };
};

export const getCardById = (db: DbHandle, cardId: string) => {
  const row = db
    .prepare(
      `
      SELECT
        cards.*,
        coalesce(collection_cards.count, 0) AS owned_count,
        (
          SELECT json_group_array(
            json_object(
              'slug', card_mechanics.tag_slug,
              'label', card_mechanics.tag_label,
              'type', card_mechanics.tag_type
            )
          )
          FROM card_mechanics
          WHERE card_mechanics.card_id = cards.id
        ) AS mechanics_json
      FROM cards
      LEFT JOIN collection_cards ON collection_cards.card_id = cards.id
      WHERE cards.id = ?
    `
    )
    .get(cardId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  const prints = db
    .prepare(
      `
      SELECT print_id, arena_id, set_code, collector_number, image_url, released_at
      FROM card_prints
      WHERE card_id = ?
      ORDER BY released_at DESC, set_code ASC
    `
    )
    .all(cardId);

  return {
    ...mapCardRow(row),
    prints
  };
};

export const listMechanics = (db: DbHandle, options?: { ownedOnly?: boolean | undefined }) =>
  (db
    .prepare(
      `
      SELECT
        card_mechanics.tag_slug AS slug,
        card_mechanics.tag_label AS label,
        card_mechanics.tag_type AS type,
        COUNT(DISTINCT card_mechanics.card_id) AS usageCount,
        COUNT(DISTINCT CASE WHEN collection_cards.count > 0 THEN card_mechanics.card_id END) AS ownedUsageCount
      FROM card_mechanics
      LEFT JOIN collection_cards ON collection_cards.card_id = card_mechanics.card_id
      ${options?.ownedOnly ? "WHERE collection_cards.count > 0" : ""}
      GROUP BY tag_slug, tag_label, tag_type
      ORDER BY tag_type ASC, tag_label ASC
    `
    )
    .all() as Array<Record<string, unknown>>)
    .map((row) => {
      const slug = String(row.slug);
      const label = String(row.label);
      const type = String(row.type) as "keyword" | "derived";
      return {
        ...row,
        slug,
        label,
        type,
        usageCount: Number(row.usageCount ?? 0),
        ownedUsageCount: Number(row.ownedUsageCount ?? 0),
        definition: getMechanicDefinition(slug, label, type)
      };
    });

export const getCollectionSummary = (db: DbHandle) => {
  const summary = db
    .prepare(
      `
      SELECT
        COUNT(*) AS ownedEntries,
        COUNT(DISTINCT cards.name) AS uniqueNames,
        COUNT(*) FILTER (WHERE collection_cards.card_id NOT LIKE 'placeholder:%') AS uniqueCanonicalCards,
        COUNT(*) FILTER (WHERE collection_cards.card_id LIKE 'placeholder:%') AS unresolvedEntries,
        COALESCE(SUM(json_array_length(collection_cards.source_rows_json)), 0) AS importRowsWithCopies,
        coalesce(SUM(count), 0) AS ownedCopies,
        MAX(imported_at) AS importedAt
      FROM collection_cards
      INNER JOIN cards ON cards.id = collection_cards.card_id
    `
    )
    .get() as {
      ownedEntries: number;
      uniqueNames: number;
      uniqueCanonicalCards: number;
      unresolvedEntries: number;
      importRowsWithCopies: number;
      ownedCopies: number;
      importedAt: string | null;
    };

  return summary;
};
