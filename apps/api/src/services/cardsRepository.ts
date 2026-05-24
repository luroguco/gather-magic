import { getOwnedCountView } from "../lib/cardCopies.js";
import type { DbHandle } from "../lib/database.js";
import { ARENA_FORMATS, type ArenaFormat } from "../lib/formats.js";
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
  playableCountMin?: number | undefined;
  playableCountMax?: number | undefined;
  manaValueMin?: number | undefined;
  manaValueMax?: number | undefined;
  drilldownKind?: CardDrilldownKind | undefined;
  drilldownKey?: string | undefined;
  page: number;
  pageSize: number;
};

export const CARD_DRILLDOWN_KINDS = ["color", "manaValue", "type", "subtype", "tribe", "rarity", "set", "mechanic"] as const;
export type CardDrilldownKind = (typeof CARD_DRILLDOWN_KINDS)[number];

export type StatsBreakdownItem = {
  key: string;
  label: string;
  titleCount: number;
  playableOwnedCopies: number;
  rawOwnedCopies: number;
};

export type StatsBreakdownTreeNode = StatsBreakdownItem & {
  kind: "type" | "subtype" | "tribe";
  children?: StatsBreakdownTreeNode[];
};

export type CardStatsResponse = {
  scope: {
    ownedOnly: boolean;
    filtersApplied: {
      q?: string;
      format?: ArenaFormat;
      colors: string[];
      mechanics: string[];
      types: string[];
      subtypes: string[];
      rarity: string[];
      sets: string[];
      playableCountMin?: number;
      playableCountMax?: number;
      manaValueMin?: number;
      manaValueMax?: number;
    };
  };
  summary: {
    matchingTitles: number;
    playableOwnedCopies: number;
    rawOwnedCopies: number;
    averageManaValue: number;
    colorBucketsRepresented: number;
    setsRepresented: number;
    mechanicsRepresented: number;
  };
  breakdowns: {
    colors: StatsBreakdownItem[];
    manaValues: StatsBreakdownItem[];
    types: StatsBreakdownItem[];
    subtypes: StatsBreakdownItem[];
    tribes: StatsBreakdownItem[];
    typeTree: StatsBreakdownTreeNode[];
    rarities: StatsBreakdownItem[];
    sets: StatsBreakdownItem[];
    mechanics: StatsBreakdownItem[];
  };
};

const playableOwnedCountSql = `
  CASE
    WHEN lower(cards.type_line) LIKE '%basic land%' THEN coalesce(collection_cards.count, 0)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have any number of cards named%' THEN coalesce(collection_cards.count, 0)
    WHEN lower(cards.oracle_text) GLOB '*a deck can have up to [0-9]* cards named*' THEN
      MIN(
        coalesce(collection_cards.count, 0),
        CAST(substr(lower(cards.oracle_text), instr(lower(cards.oracle_text), 'a deck can have up to ') + 23) AS INTEGER)
      )
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to one cards named%' THEN MIN(coalesce(collection_cards.count, 0), 1)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to two cards named%' THEN MIN(coalesce(collection_cards.count, 0), 2)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to three cards named%' THEN MIN(coalesce(collection_cards.count, 0), 3)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to four cards named%' THEN MIN(coalesce(collection_cards.count, 0), 4)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to five cards named%' THEN MIN(coalesce(collection_cards.count, 0), 5)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to six cards named%' THEN MIN(coalesce(collection_cards.count, 0), 6)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to seven cards named%' THEN MIN(coalesce(collection_cards.count, 0), 7)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to eight cards named%' THEN MIN(coalesce(collection_cards.count, 0), 8)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to nine cards named%' THEN MIN(coalesce(collection_cards.count, 0), 9)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to ten cards named%' THEN MIN(coalesce(collection_cards.count, 0), 10)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to eleven cards named%' THEN MIN(coalesce(collection_cards.count, 0), 11)
    WHEN lower(cards.oracle_text) LIKE '%a deck can have up to twelve cards named%' THEN MIN(coalesce(collection_cards.count, 0), 12)
    ELSE MIN(coalesce(collection_cards.count, 0), 4)
  END
`;

const colorBucketSql = `
  CASE
    WHEN cards.color_identity_json = '[]' THEN 'colorless'
    WHEN cards.color_identity_json = '["W"]' THEN 'mono-white'
    WHEN cards.color_identity_json = '["U"]' THEN 'mono-blue'
    WHEN cards.color_identity_json = '["B"]' THEN 'mono-black'
    WHEN cards.color_identity_json = '["R"]' THEN 'mono-red'
    WHEN cards.color_identity_json = '["G"]' THEN 'mono-green'
    ELSE 'multicolor'
  END
`;

const manaValueBucketSql = `
  CASE
    WHEN cards.mana_value >= 6 THEN '6+'
    WHEN cards.mana_value >= 5 THEN '5'
    WHEN cards.mana_value >= 4 THEN '4'
    WHEN cards.mana_value >= 3 THEN '3'
    WHEN cards.mana_value >= 2 THEN '2'
    WHEN cards.mana_value >= 1 THEN '1'
    ELSE '0'
  END
`;

const typeBucketSql = `
  CASE
    WHEN lower(cards.type_line) LIKE '%creature%' THEN 'creature'
    WHEN lower(cards.type_line) LIKE '%instant%' THEN 'instant'
    WHEN lower(cards.type_line) LIKE '%sorcery%' THEN 'sorcery'
    WHEN lower(cards.type_line) LIKE '%artifact%' THEN 'artifact'
    WHEN lower(cards.type_line) LIKE '%enchantment%' THEN 'enchantment'
    WHEN lower(cards.type_line) LIKE '%planeswalker%' THEN 'planeswalker'
    WHEN lower(cards.type_line) LIKE '%land%' THEN 'land'
    ELSE 'other'
  END
`;

const setBucketSql = `
  CASE
    WHEN cards.preferred_set_code IS NULL OR trim(cards.preferred_set_code) = '' THEN 'Unknown'
    ELSE upper(cards.preferred_set_code)
  END
`;

const primaryTypeOrder = [
  "creature",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "planeswalker",
  "battle",
  "land",
  "other"
] as const;
type PrimaryTypeKey = (typeof primaryTypeOrder)[number];
const primaryTypeSet = new Set<PrimaryTypeKey>(primaryTypeOrder);
const primaryTypeLabels: Record<PrimaryTypeKey, string> = {
  creature: "Creature",
  instant: "Instant",
  sorcery: "Sorcery",
  artifact: "Artifact",
  enchantment: "Enchantment",
  planeswalker: "Planeswalker",
  battle: "Battle",
  land: "Land",
  other: "Other"
};

const normalizeFilterList = (values?: string[]) => values?.filter(Boolean) ?? [];
const sanitizeSubtypeToken = (token: string) => token.toLowerCase().replace(/[^a-z0-9'-]/g, "");
const formatSubtypeLabel = (value: string) => value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("-");

const parseTypeLineBreakdown = (typeLine: string): { types: PrimaryTypeKey[]; subtypes: string[]; tribes: string[] } => {
  const [rawTypePart = "", rawSubtypePart = ""] = typeLine
    .split(/\s+[—-]\s+/u, 2)
    .map((part) => part.trim());
  const typeTokens = rawTypePart
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const subtypeTokens = rawSubtypePart
    .split(/\s+/)
    .map((token) => sanitizeSubtypeToken(token.trim()))
    .filter(Boolean);
  const matchedTypes = primaryTypeOrder.filter((typeKey) => typeTokens.includes(typeKey));
  const types: PrimaryTypeKey[] = matchedTypes.length > 0 ? [...matchedTypes] : ["other"];
  const uniqueSubtypes = [...new Set(subtypeTokens)];
  const tribes = types.includes("creature") ? uniqueSubtypes : [];
  return {
    types,
    subtypes: uniqueSubtypes,
    tribes
  };
};

const toBreakdownItems = (entries: Iterable<StatsBreakdownItem>, sortByLabel = false): StatsBreakdownItem[] => {
  const items = [...entries];
  items.sort((left, right) => {
    if (sortByLabel) {
      return left.label.localeCompare(right.label);
    }
    if (right.titleCount !== left.titleCount) {
      return right.titleCount - left.titleCount;
    }
    if (right.playableOwnedCopies !== left.playableOwnedCopies) {
      return right.playableOwnedCopies - left.playableOwnedCopies;
    }
    return left.label.localeCompare(right.label);
  });
  return items;
};

const buildTypeSubtypeTribeBreakdowns = (
  rows: Array<{ typeLine: string; playableOwnedCopies: number; rawOwnedCopies: number }>
): { subtypes: StatsBreakdownItem[]; tribes: StatsBreakdownItem[]; typeTree: StatsBreakdownTreeNode[] } => {
  const subtypeTotals = new Map<string, StatsBreakdownItem>();
  const tribeTotals = new Map<string, StatsBreakdownItem>();
  const typeTree = new Map<PrimaryTypeKey, StatsBreakdownTreeNode>();

  const addBreakdown = (
    target: Map<string, StatsBreakdownItem>,
    key: string,
    label: string,
    playableOwnedCopies: number,
    rawOwnedCopies: number
  ) => {
    const existing = target.get(key);
    if (!existing) {
      target.set(key, {
        key,
        label,
        titleCount: 1,
        playableOwnedCopies,
        rawOwnedCopies
      });
      return;
    }
    existing.titleCount += 1;
    existing.playableOwnedCopies += playableOwnedCopies;
    existing.rawOwnedCopies += rawOwnedCopies;
  };

  for (const row of rows) {
    const playableOwnedCopies = Number(row.playableOwnedCopies ?? 0);
    const rawOwnedCopies = Number(row.rawOwnedCopies ?? 0);
    const parsed = parseTypeLineBreakdown(String(row.typeLine ?? ""));

    for (const subtype of parsed.subtypes) {
      addBreakdown(subtypeTotals, subtype, formatSubtypeLabel(subtype), playableOwnedCopies, rawOwnedCopies);
    }

    for (const tribe of parsed.tribes) {
      addBreakdown(tribeTotals, tribe, formatSubtypeLabel(tribe), playableOwnedCopies, rawOwnedCopies);
    }

    for (const typeKey of parsed.types) {
      const node = typeTree.get(typeKey) ?? {
        key: typeKey,
        label: primaryTypeLabels[typeKey],
        kind: "type" as const,
        titleCount: 0,
        playableOwnedCopies: 0,
        rawOwnedCopies: 0,
        children: []
      };
      node.titleCount += 1;
      node.playableOwnedCopies += playableOwnedCopies;
      node.rawOwnedCopies += rawOwnedCopies;

      const childKind: "subtype" | "tribe" = typeKey === "creature" ? "tribe" : "subtype";
      const childrenMap = new Map((node.children ?? []).map((child) => [child.key, child] as const));
      for (const subtype of parsed.subtypes) {
        const child = childrenMap.get(subtype) ?? {
          key: subtype,
          label: formatSubtypeLabel(subtype),
          kind: childKind,
          titleCount: 0,
          playableOwnedCopies: 0,
          rawOwnedCopies: 0
        };
        child.titleCount += 1;
        child.playableOwnedCopies += playableOwnedCopies;
        child.rawOwnedCopies += rawOwnedCopies;
        childrenMap.set(subtype, child);
      }
      node.children = toBreakdownItems(childrenMap.values(), true).map((child) => ({
        ...child,
        kind: childKind
      }));
      typeTree.set(typeKey, node);
    }
  }

  const orderedTypes = primaryTypeOrder
    .map((typeKey) => typeTree.get(typeKey))
    .filter((item): item is StatsBreakdownTreeNode => Boolean(item));
  const extraTypes = [...typeTree.values()].filter((item) => !primaryTypeSet.has(item.key as PrimaryTypeKey));
  extraTypes.sort((left, right) => left.label.localeCompare(right.label));

  return {
    subtypes: toBreakdownItems(subtypeTotals.values()),
    tribes: toBreakdownItems(tribeTotals.values()),
    typeTree: [...orderedTypes, ...extraTypes]
  };
};

const normalizeFiltersForStats = (filters: SearchFilters) => ({
  ...(filters.q?.trim() ? { q: filters.q.trim() } : {}),
  ...(filters.format ? { format: filters.format } : {}),
  colors: normalizeFilterList(filters.colors),
  mechanics: normalizeFilterList(filters.mechanics),
  types: normalizeFilterList(filters.types),
  subtypes: normalizeFilterList(filters.subtypes),
  rarity: normalizeFilterList(filters.rarity),
  sets: normalizeFilterList(filters.sets),
  ...(typeof filters.playableCountMin === "number" ? { playableCountMin: filters.playableCountMin } : {}),
  ...(typeof filters.playableCountMax === "number" ? { playableCountMax: filters.playableCountMax } : {}),
  ...(typeof filters.manaValueMin === "number" ? { manaValueMin: filters.manaValueMin } : {}),
  ...(typeof filters.manaValueMax === "number" ? { manaValueMax: filters.manaValueMax } : {})
});

const buildCardFilterQuery = (filters: SearchFilters) => {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

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

  if (filters.drilldownKind && filters.drilldownKey) {
    params.drilldownKey = filters.drilldownKey;

    switch (filters.drilldownKind) {
      case "color":
        conditions.push(`${colorBucketSql} = @drilldownKey`);
        break;
      case "manaValue":
        conditions.push(`${manaValueBucketSql} = @drilldownKey`);
        break;
      case "type":
        conditions.push(`${typeBucketSql} = @drilldownKey`);
        break;
      case "subtype":
      case "tribe":
        conditions.push("lower(cards.type_line) LIKE '%' || lower(@drilldownKey) || '%'");
        break;
      case "rarity":
        conditions.push("lower(cards.rarity) = @drilldownKey");
        break;
      case "set":
        conditions.push(`${setBucketSql} = @drilldownKey`);
        break;
      case "mechanic":
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM card_mechanics mechanic_drilldown
            WHERE mechanic_drilldown.card_id = cards.id
              AND mechanic_drilldown.tag_slug = @drilldownKey
          )
        `);
        break;
    }
  }

  if (typeof filters.playableCountMin === "number") {
    conditions.push(`${playableOwnedCountSql} >= @playableCountMin`);
    params.playableCountMin = filters.playableCountMin;
  }

  if (typeof filters.playableCountMax === "number") {
    conditions.push(`${playableOwnedCountSql} <= @playableCountMax`);
    params.playableCountMax = filters.playableCountMax;
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

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params
  };
};

const filteredCardsCteSql = (where: string) => `
  WITH filtered_cards AS (
    SELECT
      cards.id,
      cards.name,
      cards.oracle_text,
      cards.type_line,
      cards.mana_value,
      cards.colors_json,
      cards.color_identity_json,
      cards.rarity,
      cards.preferred_set_code,
      coalesce(collection_cards.count, 0) AS raw_owned_count,
      ${playableOwnedCountSql} AS playable_owned_count,
      ${colorBucketSql} AS color_bucket,
      ${manaValueBucketSql} AS mana_value_bucket,
      ${typeBucketSql} AS type_bucket,
      ${setBucketSql} AS set_bucket
    FROM cards
    LEFT JOIN collection_cards ON collection_cards.card_id = cards.id
    ${where}
  )
`;

const buildBreakdown = (
  rows: Array<Record<string, unknown>>,
  keyField: string,
  labelField = "label"
): StatsBreakdownItem[] =>
  rows.map((row) => ({
    key: String(row[keyField]),
    label: String(row[labelField]),
    titleCount: Number(row.titleCount ?? 0),
    playableOwnedCopies: Number(row.playableOwnedCopies ?? 0),
    rawOwnedCopies: Number(row.rawOwnedCopies ?? 0)
  }));

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
  const params: Record<string, unknown> = {
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize
  };
  const built = buildCardFilterQuery(filters);
  Object.assign(params, built.params);
  const where = built.where;

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
        ${playableOwnedCountSql} AS playable_owned_count,
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
      ORDER BY ${playableOwnedCountSql} DESC, cards.name ASC
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

export const getCardStats = (db: DbHandle, filters: SearchFilters): CardStatsResponse => {
  const built = buildCardFilterQuery(filters);
  const { where, params } = built;
  const cte = filteredCardsCteSql(where);

  const summaryRow = db
    .prepare(
      `
      ${cte}
      SELECT
        COUNT(*) AS matchingTitles,
        COALESCE(SUM(filtered_cards.playable_owned_count), 0) AS playableOwnedCopies,
        COALESCE(SUM(filtered_cards.raw_owned_count), 0) AS rawOwnedCopies,
        COALESCE(AVG(filtered_cards.mana_value), 0) AS averageManaValue,
        COUNT(DISTINCT filtered_cards.color_bucket) AS colorBucketsRepresented,
        COUNT(DISTINCT filtered_cards.set_bucket) AS setsRepresented
      FROM filtered_cards
    `
    )
    .get(params) as Record<string, unknown>;

  const colorRows = db
    .prepare(
      `
      ${cte}
      SELECT
        filtered_cards.color_bucket AS key,
        CASE filtered_cards.color_bucket
          WHEN 'colorless' THEN 'Colorless'
          WHEN 'mono-white' THEN 'Mono-White'
          WHEN 'mono-blue' THEN 'Mono-Blue'
          WHEN 'mono-black' THEN 'Mono-Black'
          WHEN 'mono-red' THEN 'Mono-Red'
          WHEN 'mono-green' THEN 'Mono-Green'
          ELSE 'Multicolor'
        END AS label,
        COUNT(*) AS titleCount,
        COALESCE(SUM(filtered_cards.playable_owned_count), 0) AS playableOwnedCopies,
        COALESCE(SUM(filtered_cards.raw_owned_count), 0) AS rawOwnedCopies
      FROM filtered_cards
      GROUP BY filtered_cards.color_bucket
      ORDER BY CASE filtered_cards.color_bucket
        WHEN 'colorless' THEN 0
        WHEN 'mono-white' THEN 1
        WHEN 'mono-blue' THEN 2
        WHEN 'mono-black' THEN 3
        WHEN 'mono-red' THEN 4
        WHEN 'mono-green' THEN 5
        ELSE 6
      END
    `
    )
    .all(params) as Array<Record<string, unknown>>;

  const manaValueRows = db
    .prepare(
      `
      ${cte}
      SELECT
        filtered_cards.mana_value_bucket AS key,
        filtered_cards.mana_value_bucket AS label,
        COUNT(*) AS titleCount,
        COALESCE(SUM(filtered_cards.playable_owned_count), 0) AS playableOwnedCopies,
        COALESCE(SUM(filtered_cards.raw_owned_count), 0) AS rawOwnedCopies
      FROM filtered_cards
      GROUP BY filtered_cards.mana_value_bucket
      ORDER BY CASE filtered_cards.mana_value_bucket
        WHEN '0' THEN 0
        WHEN '1' THEN 1
        WHEN '2' THEN 2
        WHEN '3' THEN 3
        WHEN '4' THEN 4
        WHEN '5' THEN 5
        ELSE 6
      END
    `
    )
    .all(params) as Array<Record<string, unknown>>;

  const typeRows = db
    .prepare(
      `
      ${cte}
      SELECT
        filtered_cards.type_bucket AS key,
        CASE filtered_cards.type_bucket
          WHEN 'creature' THEN 'Creature'
          WHEN 'instant' THEN 'Instant'
          WHEN 'sorcery' THEN 'Sorcery'
          WHEN 'artifact' THEN 'Artifact'
          WHEN 'enchantment' THEN 'Enchantment'
          WHEN 'planeswalker' THEN 'Planeswalker'
          WHEN 'land' THEN 'Land'
          ELSE 'Other'
        END AS label,
        COUNT(*) AS titleCount,
        COALESCE(SUM(filtered_cards.playable_owned_count), 0) AS playableOwnedCopies,
        COALESCE(SUM(filtered_cards.raw_owned_count), 0) AS rawOwnedCopies
      FROM filtered_cards
      GROUP BY filtered_cards.type_bucket
      ORDER BY CASE filtered_cards.type_bucket
        WHEN 'creature' THEN 0
        WHEN 'instant' THEN 1
        WHEN 'sorcery' THEN 2
        WHEN 'artifact' THEN 3
        WHEN 'enchantment' THEN 4
        WHEN 'planeswalker' THEN 5
        WHEN 'land' THEN 6
        ELSE 7
      END
    `
    )
    .all(params) as Array<Record<string, unknown>>;

  const rarityRows = db
    .prepare(
      `
      ${cte}
      SELECT
        lower(filtered_cards.rarity) AS key,
        CASE lower(filtered_cards.rarity)
          WHEN 'common' THEN 'Common'
          WHEN 'uncommon' THEN 'Uncommon'
          WHEN 'rare' THEN 'Rare'
          WHEN 'mythic' THEN 'Mythic'
          ELSE CASE
            WHEN trim(filtered_cards.rarity) = '' THEN 'Unknown'
            ELSE filtered_cards.rarity
          END
        END AS label,
        COUNT(*) AS titleCount,
        COALESCE(SUM(filtered_cards.playable_owned_count), 0) AS playableOwnedCopies,
        COALESCE(SUM(filtered_cards.raw_owned_count), 0) AS rawOwnedCopies
      FROM filtered_cards
      GROUP BY lower(filtered_cards.rarity), label
      ORDER BY CASE lower(filtered_cards.rarity)
        WHEN 'common' THEN 0
        WHEN 'uncommon' THEN 1
        WHEN 'rare' THEN 2
        WHEN 'mythic' THEN 3
        ELSE 4
      END, label
    `
    )
    .all(params) as Array<Record<string, unknown>>;

  const setRows = db
    .prepare(
      `
      ${cte}
      SELECT
        filtered_cards.set_bucket AS key,
        filtered_cards.set_bucket AS label,
        COUNT(*) AS titleCount,
        COALESCE(SUM(filtered_cards.playable_owned_count), 0) AS playableOwnedCopies,
        COALESCE(SUM(filtered_cards.raw_owned_count), 0) AS rawOwnedCopies
      FROM filtered_cards
      GROUP BY filtered_cards.set_bucket
      ORDER BY playableOwnedCopies DESC, titleCount DESC, label ASC
    `
    )
    .all(params) as Array<Record<string, unknown>>;

  const mechanicRows = db
    .prepare(
      `
      ${cte}
      SELECT
        card_mechanics.tag_slug AS key,
        card_mechanics.tag_label AS label,
        COUNT(DISTINCT filtered_cards.id) AS titleCount,
        COALESCE(SUM(filtered_cards.playable_owned_count), 0) AS playableOwnedCopies,
        COALESCE(SUM(filtered_cards.raw_owned_count), 0) AS rawOwnedCopies
      FROM filtered_cards
      INNER JOIN card_mechanics ON card_mechanics.card_id = filtered_cards.id
      GROUP BY card_mechanics.tag_slug, card_mechanics.tag_label
      ORDER BY playableOwnedCopies DESC, titleCount DESC, label ASC
      LIMIT 30
    `
    )
    .all(params) as Array<Record<string, unknown>>;

  const typeLineRows = db
    .prepare(
      `
      ${cte}
      SELECT
        filtered_cards.type_line AS typeLine,
        filtered_cards.playable_owned_count AS playableOwnedCopies,
        filtered_cards.raw_owned_count AS rawOwnedCopies
      FROM filtered_cards
    `
    )
    .all(params) as Array<{ typeLine: string; playableOwnedCopies: number; rawOwnedCopies: number }>;
  const typeSubtypeBreakdowns = buildTypeSubtypeTribeBreakdowns(typeLineRows);

  const mechanicsRepresentedRow = db
    .prepare(
      `
      ${cte}
      SELECT COUNT(DISTINCT card_mechanics.tag_slug) AS mechanicsRepresented
      FROM filtered_cards
      INNER JOIN card_mechanics ON card_mechanics.card_id = filtered_cards.id
    `
    )
    .get(params) as Record<string, unknown>;

  return {
    scope: {
      ownedOnly: Boolean(filters.ownedOnly),
      filtersApplied: normalizeFiltersForStats(filters)
    },
    summary: {
      matchingTitles: Number(summaryRow.matchingTitles ?? 0),
      playableOwnedCopies: Number(summaryRow.playableOwnedCopies ?? 0),
      rawOwnedCopies: Number(summaryRow.rawOwnedCopies ?? 0),
      averageManaValue: Number(Number(summaryRow.averageManaValue ?? 0).toFixed(2)),
      colorBucketsRepresented: Number(summaryRow.colorBucketsRepresented ?? 0),
      setsRepresented: Number(summaryRow.setsRepresented ?? 0),
      mechanicsRepresented: Number(mechanicsRepresentedRow.mechanicsRepresented ?? 0)
    },
    breakdowns: {
      colors: buildBreakdown(colorRows, "key"),
      manaValues: buildBreakdown(manaValueRows, "key"),
      types: buildBreakdown(typeRows, "key"),
      subtypes: typeSubtypeBreakdowns.subtypes,
      tribes: typeSubtypeBreakdowns.tribes,
      typeTree: typeSubtypeBreakdowns.typeTree,
      rarities: buildBreakdown(rarityRows, "key"),
      sets: buildBreakdown(setRows, "key"),
      mechanics: buildBreakdown(mechanicRows, "key")
    }
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

export const getCardDataSyncSummary = (db: DbHandle) => {
  const row = db
    .prepare(
      `
      SELECT
        source,
        source_updated_at AS sourceUpdatedAt,
        download_uri AS downloadUri,
        synced_at AS syncedAt,
        card_count AS cardCount,
        print_count AS printCount
      FROM card_data_syncs
      WHERE source = 'scryfall-default-cards'
    `
    )
    .get() as
    | {
        source: string;
        sourceUpdatedAt: string | null;
        downloadUri: string | null;
        syncedAt: string;
        cardCount: number;
        printCount: number;
      }
    | undefined;

  return {
    source: row?.source ?? "scryfall-default-cards",
    sourceUpdatedAt: row?.sourceUpdatedAt ?? null,
    downloadUri: row?.downloadUri ?? null,
    syncedAt: row?.syncedAt ?? null,
    cardCount: row?.cardCount ?? 0,
    printCount: row?.printCount ?? 0,
    formats: [...ARENA_FORMATS]
  };
};
