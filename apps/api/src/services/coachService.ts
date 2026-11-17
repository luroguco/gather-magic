import { createHash } from "node:crypto";

import {
  COACH_FEATURE_VERSION,
  type CoachCardGroup,
  type CoachCardRarity,
  type CoachCardRef,
  type CoachColor,
  type CoachCraftBudget,
  type CoachCraftCost,
  type CoachFeatureEvidence,
  type CoachFormat,
  type CoachIdea,
  type CoachIdeasRequest,
  type CoachIdeasResponse,
  type CoachProfile,
  type CoachPrototype,
  type CoachPrototypeCard,
  type CoachPrototypeRequest,
  type CoachRarity,
  type CoachRoleCoverage,
  type CoachSynergyClaim,
  type CoachThemeSlug,
  type PrototypeConcern,
  type ReplacementCandidate,
  type SourceFingerprint
} from "@mtga/contracts";

import type { DbHandle } from "../lib/database.js";
import {
  getMaxCopiesForCard,
  isBasicLand as isBasicLandRule,
  isBrawlCommanderEligible,
  isColorIdentitySubset,
  validateDeckCandidate,
  type DeckRuleCardEntry
} from "./deckRules.js";
import {
  COACH_ROLE_LABELS,
  COACH_THEMES,
  basicLandColor,
  classifyCoachCard,
  describeColors,
  getCoachTheme
} from "./coachFeatures.js";

const COLOR_ORDER: CoachColor[] = ["W", "U", "B", "R", "G"];
const RARITY_ORDER: CoachRarity[] = ["common", "uncommon", "rare", "mythic"];
const SECTION_LABELS: Record<CoachCardGroup, string> = {
  core: "Core plan",
  support: "Support",
  interaction: "Interaction",
  mana: "Mana"
};

type LoadedCard = {
  id: string;
  normalizedName: string;
  name: string;
  oracleText: string;
  manaCost: string | null;
  manaValue: number;
  colorIdentity: CoachColor[];
  producedMana: string[];
  typeLine: string;
  rarity: CoachCardRarity;
  imageUrl: string | null;
  keywords: string[];
  mechanics: string[];
  legalities: Record<string, string>;
  ownedCount: number;
  features: ReturnType<typeof classifyCoachCard>;
  isBasicLand: boolean;
  isLand: boolean;
  subtype: string | null;
};

type IdeaSeed = {
  format: CoachFormat;
  themeSlug: CoachThemeSlug;
  themeLabel: string;
  profile: CoachProfile;
  colors: CoachColor[];
  commander: LoadedCard | null;
  anchorCardId: string | null;
  typalSubtype: string | null;
  anchors: LoadedCard[];
  ownedThemeCards: number;
  enablers: number;
  payoffs: number;
  seedScore: number;
  ideaFingerprint: string;
  ideaId: string;
};

type SelectedCard = {
  card: LoadedCard;
  quantity: number;
  section: "main" | "commander";
  allocation: AllocationSlot;
};

type AllocationSlot =
  | "commander"
  | "enabler"
  | "payoff-threat"
  | "theme"
  | "interaction"
  | "draw"
  | "ramp"
  | "protection"
  | "land";

type BuiltPrototype = {
  seed: IdeaSeed;
  selected: SelectedCard[];
  cards: CoachPrototypeCard[];
  craftCost: CoachCraftCost;
  craftGaps: CoachPrototype["craftGaps"];
  roleCoverage: CoachRoleCoverage[];
  concerns: PrototypeConcern[];
  replacements: ReplacementCandidate[];
  synergyClaims: CoachSynergyClaim[];
  validation: CoachPrototype["validation"];
  warnings: string[];
  themeDensityCount: number;
};

type LoadedCardsResult = {
  cards: LoadedCard[];
  excludedPlaceholders: number;
};

type IdeaLocator = {
  format: CoachFormat;
  themeSlug: CoachThemeSlug;
  colors: CoachColor[];
  commanderCardId: string | null;
  anchorCardId: string | null;
  typalSubtype: string | null;
};

export class CoachServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "CoachServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const ideaCaches = new WeakMap<DbHandle, Map<string, IdeaSeed>>();
const cardPoolCaches = new WeakMap<
  DbHandle,
  Map<CoachFormat, { dataFingerprint: string; value: LoadedCardsResult }>
>();

const cacheSeed = (db: DbHandle, sourceFingerprint: string, seed: IdeaSeed) => {
  const cache = ideaCaches.get(db) ?? new Map<string, IdeaSeed>();
  cache.set(`${sourceFingerprint}:${seed.ideaId}`, seed);
  while (cache.size > 100) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  ideaCaches.set(db, cache);
};

const stableHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const makeIdeaId = (locator: IdeaLocator, dataFingerprint: string) => {
  const encoded = Buffer.from(JSON.stringify([
    locator.format,
    locator.themeSlug,
    locator.colors.join(""),
    locator.commanderCardId ?? "",
    locator.anchorCardId ?? "",
    locator.typalSubtype ?? ""
  ])).toString("base64url");
  return `coach1.${encoded}.${dataFingerprint.slice(0, 8)}`;
};

const parseIdeaId = (ideaId: string): IdeaLocator | null => {
  const match = /^coach1\.([A-Za-z0-9_-]+)\.[a-f0-9]{8}$/.exec(ideaId);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 6 || !parsed.every((value) => typeof value === "string")) {
      return null;
    }
    const [
      format = "",
      themeSlug = "",
      colorString = "",
      commanderCardId = "",
      anchorCardId = "",
      typalSubtype = ""
    ] = parsed as string[];
    if (
      !["standard", "brawl"].includes(format) ||
      !COACH_THEMES.some((theme) => theme.slug === themeSlug) ||
      [...colorString].some((color) => !COLOR_ORDER.includes(color as CoachColor))
    ) return null;
    return {
      format: format as CoachFormat,
      themeSlug: themeSlug as CoachThemeSlug,
      colors: [...colorString] as CoachColor[],
      commanderCardId: commanderCardId || null,
      anchorCardId: anchorCardId || null,
      typalSubtype: typalSubtype || null
    };
  } catch {
    return null;
  }
};

const parseStringArray = (value: unknown): string[] => {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const parseStringRecord = (value: unknown): Record<string, string> => {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
};

const normalizeRarity = (value: unknown): CoachRarity | null => {
  const normalized = String(value ?? "").toLowerCase();
  return RARITY_ORDER.includes(normalized as CoachRarity) ? (normalized as CoachRarity) : null;
};

const normalizeColors = (value: unknown): CoachColor[] =>
  parseStringArray(value)
    .map((color) => color.toUpperCase())
    .filter((color): color is CoachColor => COLOR_ORDER.includes(color as CoachColor))
    .sort((left, right) => COLOR_ORDER.indexOf(left) - COLOR_ORDER.indexOf(right));

const getSubtype = (typeLine: string) => {
  const subtypePart = typeLine.split(/\s+[—-]\s+/u)[1];
  if (!subtypePart) return null;
  return subtypePart.split(/\s+/).find(Boolean)?.toLowerCase() ?? null;
};

const hasArenaPrint = (row: Record<string, unknown>) => Number(row.arena_prints ?? 0) > 0;

const loadEligibleCards = (db: DbHandle, format: CoachFormat): LoadedCardsResult => {
  const rows = db.prepare(`
    SELECT
      cards.*,
      coalesce(collection_cards.count, 0) AS owned_count,
      (SELECT COUNT(*) FROM card_prints arena_print
       WHERE arena_print.card_id = cards.id
         AND EXISTS (SELECT 1 FROM json_each(arena_print.games_json) WHERE value = 'arena')) AS arena_prints,
      (SELECT json_group_array(card_mechanics.tag_slug)
       FROM card_mechanics WHERE card_mechanics.card_id = cards.id) AS mechanics_json,
      (SELECT json_group_array(card_prints.rarity)
       FROM card_prints
       WHERE card_prints.card_id = cards.id
         AND EXISTS (SELECT 1 FROM json_each(card_prints.games_json) WHERE value = 'arena')) AS print_rarities_json
    FROM cards
    LEFT JOIN collection_cards ON collection_cards.card_id = cards.id
    WHERE json_extract(cards.legalities_json, ?) IN ('legal', 'restricted')
      AND cards.id NOT LIKE 'placeholder:%'
  `).all(`$.${format}`) as Array<Record<string, unknown>>;

  let excludedPlaceholders = 0;
  const cards: LoadedCard[] = [];
  for (const row of rows) {
    if (!hasArenaPrint(row)) {
      excludedPlaceholders += 1;
      continue;
    }
    const printRarities = parseStringArray(row.print_rarities_json)
      .map(normalizeRarity)
      .filter((rarity): rarity is CoachRarity => rarity !== null);
    const canonicalRarity = normalizeRarity(row.rarity);
    const rarity: CoachCardRarity =
      [...printRarities].sort((left, right) => RARITY_ORDER.indexOf(left) - RARITY_ORDER.indexOf(right))[0] ??
      canonicalRarity ??
      "unknown";
    const ownedCount = Math.max(0, Number(row.owned_count ?? 0));
    if (rarity === "unknown" && ownedCount === 0) {
      excludedPlaceholders += 1;
      continue;
    }
    const oracleText = String(row.oracle_text ?? "");
    const typeLine = String(row.type_line ?? "");
    const mechanics = parseStringArray(row.mechanics_json);
    const keywords = parseStringArray(row.keywords_json);
    const card: LoadedCard = {
      id: String(row.id),
      normalizedName: String(row.normalized_name ?? row.name ?? "").trim().toLowerCase(),
      name: String(row.name),
      oracleText,
      manaCost: row.mana_cost ? String(row.mana_cost) : null,
      manaValue: Number(row.mana_value ?? 0),
      colorIdentity: normalizeColors(row.color_identity_json),
      producedMana: parseStringArray(row.produced_mana_json),
      typeLine,
      rarity,
      imageUrl: row.image_url ? String(row.image_url) : null,
      keywords,
      mechanics,
      legalities: parseStringRecord(row.legalities_json),
      ownedCount,
      features: classifyCoachCard({ oracleText, typeLine, manaValue: Number(row.mana_value ?? 0), keywords, mechanics }),
      isBasicLand: isBasicLandRule(typeLine),
      isLand: typeLine.toLowerCase().includes("land"),
      subtype: getSubtype(typeLine)
    };
    cards.push(card);
  }
  return { cards, excludedPlaceholders };
};

const loadEligibleCardsCached = (
  db: DbHandle,
  format: CoachFormat,
  dataFingerprint: string
): LoadedCardsResult => {
  const cache = cardPoolCaches.get(db) ?? new Map();
  const existing = cache.get(format);
  if (existing?.dataFingerprint === dataFingerprint) return existing.value;
  const value = loadEligibleCards(db, format);
  cache.set(format, { dataFingerprint, value });
  cardPoolCaches.set(db, cache);
  return value;
};

const getSourceBase = (db: DbHandle) => {
  const collection = db.prepare(`
    SELECT id, imported_at FROM collection_imports ORDER BY imported_at DESC, rowid DESC LIMIT 1
  `).get() as { id: string; imported_at: string } | undefined;
  const catalog = db.prepare(`
    SELECT synced_at FROM card_data_syncs ORDER BY synced_at DESC LIMIT 1
  `).get() as { synced_at: string } | undefined;
  const aggregate = db.prepare(`
    SELECT COUNT(*) AS titles, coalesce(SUM(count), 0) AS copies,
           coalesce(MAX(imported_at), '') AS imported_at
    FROM collection_cards
  `).get() as Record<string, unknown>;
  const base = {
    collectionImportId: collection?.id ?? null,
    collectionImportedAt: collection?.imported_at ?? null,
    catalogSyncedAt: catalog?.synced_at ?? null,
    featureVersion: COACH_FEATURE_VERSION,
    aggregate
  };
  return {
    ...base,
    dataFingerprint: stableHash(base)
  };
};

const sourceFor = (
  sourceBase: ReturnType<typeof getSourceBase>,
  constraints: unknown
): SourceFingerprint => ({
  collectionImportId: sourceBase.collectionImportId,
  collectionImportedAt: sourceBase.collectionImportedAt,
  catalogSyncedAt: sourceBase.catalogSyncedAt,
  featureVersion: sourceBase.featureVersion,
  dataFingerprint: sourceBase.dataFingerprint,
  constraintFingerprint: stableHash(constraints)
});

const cardRef = (card: LoadedCard, evidenceOverride?: CoachFeatureEvidence[]): CoachCardRef => ({
  cardId: card.id,
  name: card.name,
  manaCost: card.manaCost,
  manaValue: card.manaValue,
  typeLine: card.typeLine,
  rarity: card.rarity,
  imageUrl: card.imageUrl,
  ownedCount: card.ownedCount,
  evidence: evidenceOverride ?? card.features.all.slice(0, 50)
});

const shellIncludes = (card: LoadedCard, colors: CoachColor[]) =>
  isColorIdentitySubset(card.colorIdentity, colors);

const standardShells = (): CoachColor[][] => {
  const shells: CoachColor[][] = COLOR_ORDER.map((color) => [color]);
  for (let first = 0; first < COLOR_ORDER.length; first += 1) {
    for (let second = first + 1; second < COLOR_ORDER.length; second += 1) {
      const left = COLOR_ORDER[first];
      const right = COLOR_ORDER[second];
      if (left && right) shells.push([left, right]);
    }
  }
  return shells;
};

const themeEvidenceFor = (card: LoadedCard, slug: CoachThemeSlug, typalSubtype: string | null) => {
  if (slug !== "typal") return card.features.themes.get(slug) ?? [];
  if (!typalSubtype) return [];
  const evidence = [...(card.features.themes.get("typal") ?? [])];
  const isSubtype = card.subtype === typalSubtype;
  const oracle = card.oracleText.toLowerCase();
  const mentionsSubtype = oracle.includes(typalSubtype);
  return evidence.filter((item) =>
    item.relation === "enabler" ? isSubtype : item.relation !== "payoff" || mentionsSubtype
  );
};

const synergyCard = (card: LoadedCard) => ({ cardId: card.id, name: card.name });

const explainThemePair = (
  seed: IdeaSeed,
  enabler: LoadedCard,
  payoff: LoadedCard,
  commanderLinked: boolean
) => {
  const subtype = seed.typalSubtype
    ? `${seed.typalSubtype[0]?.toUpperCase() ?? ""}${seed.typalSubtype.slice(1)}`
    : "chosen creature type";
  const core = (() => {
    switch (seed.themeSlug) {
      case "tokens":
        return `${enabler.name} creates the tokens that ${payoff.name} rewards, turning token production into meaningful pressure.`;
      case "counters":
        return `${enabler.name} supplies +1/+1 counters that ${payoff.name} rewards, so placing counters also advances your payoff.`;
      case "sacrifice":
        return `${enabler.name} provides sacrifice events that ${payoff.name} rewards, converting expendable permanents into additional value.`;
      case "graveyard":
        return `${enabler.name} stocks the graveyard with cards for ${payoff.name} to reuse, turning graveyard setup into card access.`;
      case "blink-etb":
        return `${enabler.name} can exile and return your permanents, letting ${payoff.name} repeat its enter-the-battlefield ability.`;
      case "lifegain":
        return `${enabler.name} supplies life gain that ${payoff.name} rewards, so stabilizing also grows the deck's engine.`;
      case "landfall":
        return `${enabler.name} supplies a land drop that turns on the land-entry payoff on ${payoff.name}.`;
      case "typal":
        return `${enabler.name} adds another ${subtype} to the plan that ${payoff.name} explicitly rewards.`;
    }
  })();
  if (!commanderLinked || !seed.commander) return core;
  return `${core} This ties ${seed.commander.name} directly to the deck's main engine.`;
};

const buildSynergyClaims = (seed: IdeaSeed, selected: SelectedCard[]): CoachSynergyClaim[] => {
  const anchorOrder = new Map(seed.anchors.map((card, index) => [card.id, index] as const));
  const candidates = selected
    .map((entry) => {
      const evidence = themeEvidenceFor(entry.card, seed.themeSlug, seed.typalSubtype);
      return {
        entry,
        enablerEvidence: evidence.filter((item) => item.relation === "enabler"),
        payoffEvidence: evidence.filter((item) => item.relation === "payoff")
      };
    })
    .filter((candidate) =>
      candidate.enablerEvidence.length > 0 || candidate.payoffEvidence.length > 0
    );
  const candidateOrder = (left: typeof candidates[number], right: typeof candidates[number]) =>
    Number(right.entry.section === "commander") - Number(left.entry.section === "commander") ||
    (anchorOrder.get(left.entry.card.id) ?? Number.POSITIVE_INFINITY) -
      (anchorOrder.get(right.entry.card.id) ?? Number.POSITIVE_INFINITY) ||
    Number(left.entry.card.isBasicLand) - Number(right.entry.card.isBasicLand) ||
    Number(left.entry.card.isLand) - Number(right.entry.card.isLand) ||
    left.entry.card.name.localeCompare(right.entry.card.name) ||
    left.entry.card.id.localeCompare(right.entry.card.id);
  const enablers = candidates.filter((candidate) => candidate.enablerEvidence.length > 0).sort(candidateOrder);
  const payoffs = candidates.filter((candidate) => candidate.payoffEvidence.length > 0).sort(candidateOrder);
  const pairings = payoffs.flatMap((payoff) =>
    enablers
      .filter((enabler) => enabler.entry.card.id !== payoff.entry.card.id)
      .map((enabler) => ({ enabler, payoff }))
  );

  const claims: CoachSynergyClaim[] = [];
  const usedEnablers = new Set<string>();
  const usedPayoffs = new Set<string>();
  const usedCardPairs = new Set<string>();
  const usedCardIds = new Set<string>();
  const remaining = [...pairings];
  while (claims.length < 3 && remaining.length > 0) {
    const eligible = claims.length === 0
      ? remaining
      : remaining.filter((pair) =>
          !usedCardIds.has(pair.enabler.entry.card.id) &&
          !usedCardIds.has(pair.payoff.entry.card.id)
        );
    if (eligible.length === 0) break;
    eligible.sort((left, right) => {
      const score = (pair: typeof left) => {
        const enablerId = pair.enabler.entry.card.id;
        const payoffId = pair.payoff.entry.card.id;
        const commanderLinked = pair.enabler.entry.section === "commander" || pair.payoff.entry.section === "commander";
        const anchorCount = Number(anchorOrder.has(enablerId)) + Number(anchorOrder.has(payoffId));
        return (
          (commanderLinked && claims.length === 0 ? 32 : 0) +
          (claims.length === 0 ? anchorCount * 8 : anchorCount * 2) +
          (!usedPayoffs.has(payoffId) ? 8 : 0) +
          (!usedEnablers.has(enablerId) ? 4 : 0) +
          (!pair.enabler.entry.card.isLand ? 2 : 0) +
          (!pair.enabler.entry.card.isBasicLand ? 1 : 0)
        );
      };
      return score(right) - score(left) ||
        left.payoff.entry.card.name.localeCompare(right.payoff.entry.card.name) ||
        left.enabler.entry.card.name.localeCompare(right.enabler.entry.card.name) ||
        left.payoff.entry.card.id.localeCompare(right.payoff.entry.card.id) ||
        left.enabler.entry.card.id.localeCompare(right.enabler.entry.card.id);
    });
    const next = eligible[0];
    if (!next) break;
    remaining.splice(remaining.indexOf(next), 1);
    const enabler = next.enabler.entry.card;
    const payoff = next.payoff.entry.card;
    const pairKey = [enabler.id, payoff.id].sort().join(":");
    if (usedCardPairs.has(pairKey)) continue;
    const commanderLinked = next.enabler.entry.section === "commander" || next.payoff.entry.section === "commander";
    const evidenceRuleIds = [...new Set([
      ...next.enabler.enablerEvidence.map((item) => item.ruleId),
      ...next.payoff.payoffEvidence.map((item) => item.ruleId)
    ])];
    if (evidenceRuleIds.length < 2) continue;
    claims.push({
      kind: commanderLinked ? "commander-engine" : "theme-engine",
      enablers: [synergyCard(enabler)],
      payoff: synergyCard(payoff),
      explanation: explainThemePair(seed, enabler, payoff, commanderLinked),
      evidenceRuleIds: evidenceRuleIds.slice(0, 10)
    });
    usedEnablers.add(enabler.id);
    usedPayoffs.add(payoff.id);
    usedCardPairs.add(pairKey);
    usedCardIds.add(enabler.id);
    usedCardIds.add(payoff.id);
  }
  return claims;
};

const getBrawlThemeMinimums = (
  commander: LoadedCard,
  slug: CoachThemeSlug,
  typalSubtype: string | null
) => {
  const commanderEvidence = themeEvidenceFor(commander, slug, typalSubtype);
  return {
    enabler: commanderEvidence.some((item) => item.relation === "enabler") ? 4 : 8,
    payoff: commanderEvidence.some((item) => item.relation === "payoff") ? 1 : 4
  };
};

const getDominantSubtype = (cards: LoadedCard[]) => {
  const counts = new Map<string, { creatures: number; payoffs: number }>();
  for (const card of cards) {
    if (!card.subtype || !card.typeLine.toLowerCase().includes("creature")) continue;
    const existing = counts.get(card.subtype) ?? { creatures: 0, payoffs: 0 };
    existing.creatures += 1;
    if (
      card.oracleText.toLowerCase().includes(card.subtype) &&
      (card.features.themes.get("typal") ?? []).some((item) => item.relation === "payoff")
    ) {
      existing.payoffs += 1;
    }
    counts.set(card.subtype, existing);
  }
  return [...counts.entries()]
    .filter(([, count]) => count.payoffs > 0)
    .sort((left, right) =>
      right[1].creatures - left[1].creatures ||
      right[1].payoffs - left[1].payoffs ||
      left[0].localeCompare(right[0])
    )[0]?.[0] ?? null;
};

const seedFromPool = (
  format: CoachFormat,
  slug: CoachThemeSlug,
  colors: CoachColor[],
  commander: LoadedCard | null,
  pool: LoadedCard[],
  request: CoachIdeasRequest,
  sourceBase: ReturnType<typeof getSourceBase>
): IdeaSeed | null => {
  const ownedPool = pool.filter((card) =>
    card.ownedCount > 0 && !card.isLand && card.id !== commander?.id
  );
  const typalSubtype = slug === "typal"
    ? commander?.subtype ?? getDominantSubtype(ownedPool)
    : null;
  const relevant = ownedPool
    .map((card) => ({ card, evidence: themeEvidenceFor(card, slug, typalSubtype) }))
    .filter((item) => item.evidence.length > 0);
  const enablers = relevant.filter((item) => item.evidence.some((entry) => entry.relation === "enabler")).length;
  const payoffs = relevant.filter((item) => item.evidence.some((entry) => entry.relation === "payoff")).length;
  const minimum = format === "brawl" ? 8 : 3;
  if (relevant.length < minimum) return null;
  if (format === "brawl" && commander) {
    const required = getBrawlThemeMinimums(commander, slug, typalSubtype);
    if (enablers < required.enabler || payoffs < required.payoff) return null;
  } else if (enablers < 1 || payoffs < 1) {
    return null;
  }

  const anchor = request.anchorCardId ? relevant.find((item) => item.card.id === request.anchorCardId) : undefined;
  if (request.anchorCardId && !anchor) return null;
  const anchors = relevant
    .sort((left, right) => {
      const relationScore = (entry: typeof left) =>
        entry.evidence.reduce((score, evidence) => score + (evidence.relation === "payoff" ? 4 : evidence.relation === "enabler" ? 3 : 1), 0);
      return relationScore(right) - relationScore(left) || right.card.ownedCount - left.card.ownedCount || left.card.name.localeCompare(right.card.name);
    })
    .map((item) => item.card);
  const payoffAnchor = relevant.find((item) =>
    item.evidence.some((entry) => entry.relation === "payoff")
  )?.card;
  const enablerAnchor = relevant.find((item) =>
    item.evidence.some((entry) => entry.relation === "enabler") && item.card.id !== payoffAnchor?.id
  )?.card ?? relevant.find((item) => item.evidence.some((entry) => entry.relation === "enabler"))?.card;
  const orderedAnchors = [
    ...(anchor ? [anchor.card] : []),
    ...(payoffAnchor ? [payoffAnchor] : []),
    ...(enablerAnchor ? [enablerAnchor] : []),
    ...anchors
  ].filter((card, index, all) => all.findIndex((candidate) => candidate.id === card.id) === index);
  const theme = getCoachTheme(slug);
  const identity: IdeaLocator = {
    format,
    themeSlug: slug,
    colors,
    commanderCardId: commander?.id ?? null,
    anchorCardId: request.anchorCardId ?? null,
    typalSubtype
  };
  const ideaFingerprint = stableHash(identity);
  return {
    format,
    themeSlug: slug,
    themeLabel: typalSubtype ? `${typalSubtype[0]?.toUpperCase() ?? ""}${typalSubtype.slice(1)} Typal` : theme.label,
    profile: theme.profile,
    colors,
    commander,
    anchorCardId: request.anchorCardId ?? null,
    typalSubtype,
    anchors: orderedAnchors.slice(0, 3),
    ownedThemeCards: relevant.length,
    enablers,
    payoffs,
    seedScore: relevant.length * 3 + payoffs * 4 + enablers * 2 + (commander?.ownedCount ? 5 : 0),
    ideaFingerprint,
    ideaId: makeIdeaId(identity, sourceBase.dataFingerprint)
  };
};

const makeSeeds = (
  cards: LoadedCard[],
  request: CoachIdeasRequest,
  sourceBase: ReturnType<typeof getSourceBase>
) => {
  const seeds: IdeaSeed[] = [];
  if (request.format === "standard") {
    const anchor = request.anchorCardId ? cards.find((card) => card.id === request.anchorCardId && card.ownedCount > 0) : null;
    if (request.anchorCardId && !anchor) return seeds;
    for (const colors of standardShells()) {
      if (anchor && !shellIncludes(anchor, colors)) continue;
      const pool = cards.filter((card) => card.ownedCount > 0 && shellIncludes(card, colors));
      for (const theme of COACH_THEMES) {
        const seed = seedFromPool("standard", theme.slug, colors, null, pool, request, sourceBase);
        if (seed) seeds.push(seed);
      }
    }
  } else {
    const commanders = cards.filter((card) =>
      isBrawlCommanderEligible({ oracleText: card.oracleText, typeLine: card.typeLine }) &&
      (request.commanderCardId
        ? card.id === request.commanderCardId
        : card.ownedCount > 0 ||
          (card.rarity !== "unknown" && request.craftBudget[card.rarity] > 0))
    );
    for (const commander of commanders) {
      const pool = cards.filter((card) => card.ownedCount > 0 && shellIncludes(card, commander.colorIdentity));
      for (const theme of COACH_THEMES) {
        const commanderEvidence = themeEvidenceFor(commander, theme.slug, commander.subtype);
        if (commanderEvidence.length === 0) continue;
        const seed = seedFromPool("brawl", theme.slug, commander.colorIdentity, commander, pool, request, sourceBase);
        if (seed) seeds.push(seed);
      }
    }
  }
  return seeds.sort((left, right) =>
    right.payoffs - left.payoffs ||
    right.enablers - left.enablers ||
    right.ownedThemeCards - left.ownedThemeCards ||
    Number(Boolean(right.commander?.ownedCount)) - Number(Boolean(left.commander?.ownedCount)) ||
    left.colors.length - right.colors.length ||
    left.ideaFingerprint.localeCompare(right.ideaFingerprint)
  );
};

const emptyCost = (): CoachCraftCost => ({ common: 0, uncommon: 0, rare: 0, mythic: 0 });

const cardRuleEntry = (card: LoadedCard, quantity: number, section: "main" | "commander"): DeckRuleCardEntry => ({
  cardId: card.id,
  quantity,
  section,
  name: card.name,
  normalizedName: card.normalizedName,
  oracleText: card.oracleText,
  typeLine: card.typeLine,
  colorIdentity: card.colorIdentity,
  legalities: card.legalities,
  availableOnArena: true,
  ownedCount: card.ownedCount
});

const passesCurveGuardrail = (seed: IdeaSeed, selected: SelectedCard[]) => {
  const spells = selected.filter((entry) => entry.section === "main" && !entry.card.isLand);
  const spellCount = spells.reduce((sum, entry) => sum + entry.quantity, 0);
  if (spellCount === 0) return false;
  const averageManaValue = spells.reduce(
    (sum, entry) => sum + entry.card.manaValue * entry.quantity,
    0
  ) / spellCount;

  if (seed.format === "brawl") {
    const earlyPlays = spells
      .filter((entry) => entry.card.manaValue <= 3)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const expensive = spells
      .filter((entry) => entry.card.manaValue >= 6)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    return earlyPlays >= 12 && expensive <= 18 && averageManaValue <= 4.75;
  }

  const earlyPlays = spells
    .filter((entry) => entry.card.manaValue <= 2)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const expensive = spells
    .filter((entry) => entry.card.manaValue >= 5)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  return seed.profile === "proactive"
    ? earlyPlays >= 8 && expensive <= 8 && averageManaValue <= 3.75
    : earlyPlays >= 6 && expensive <= 10 && averageManaValue <= 4.25;
};

const hasManaSourceCoverage = (seed: IdeaSeed, selected: SelectedCard[]) => {
  if (seed.colors.length === 0) {
    return selected.some((entry) =>
      entry.section === "main" &&
      entry.card.isLand &&
      (entry.card.producedMana.includes("C") ||
        entry.card.normalizedName === "wastes" ||
        entry.card.normalizedName === "snow-covered wastes")
    );
  }
  const produced = new Set<string>();
  for (const entry of selected) {
    if (entry.section !== "main" || !entry.card.isLand) continue;
    for (const color of entry.card.producedMana) produced.add(color);
    const basicColor = basicLandColor(entry.card.typeLine);
    if (basicColor) produced.add(basicColor);
  }
  return seed.colors.every((color) => produced.has(color));
};

const buildPrototype = (
  seed: IdeaSeed,
  cards: LoadedCard[],
  budget: CoachCraftBudget,
  constraints: { lockedCards: Array<{ cardId: string; quantity?: number | undefined }>; excludedCardIds: string[] }
): BuiltPrototype | null => {
  const allowed = cards.filter((card) =>
    !constraints.excludedCardIds.includes(card.id) &&
    shellIncludes(card, seed.colors) &&
    (card.isBasicLand ||
      card.ownedCount > 0 ||
      (card.rarity !== "unknown" && budget[card.rarity] > 0)) &&
    (!seed.commander || card.id !== seed.commander.id)
  );
  const byId = new Map(cards.map((card) => [card.id, card] as const));
  const selected = new Map<string, SelectedCard>();
  const craftCost = emptyCost();

  const addCopies = (
    card: LoadedCard,
    desired: number,
    allocation: AllocationSlot,
    section: "main" | "commander" = "main"
  ) => {
    const existing = selected.get(card.id);
    if (existing && existing.allocation !== allocation) return 0;
    const current = existing?.quantity ?? 0;
    const maxCopies = getMaxCopiesForCard(seed.format, cardRuleEntry(card, 1, section));
    const limit = maxCopies ?? desired;
    let added = 0;
    while (added < desired && current + added < limit) {
      const nextTotal = current + added + 1;
      const nextMissing = Math.max(nextTotal - card.ownedCount, 0);
      const currentMissing = Math.max(nextTotal - 1 - card.ownedCount, 0);
      if (nextMissing > currentMissing && !card.isBasicLand) {
        if (card.rarity === "unknown") break;
        if (craftCost[card.rarity] >= budget[card.rarity]) break;
        craftCost[card.rarity] += 1;
      }
      added += 1;
    }
    if (added > 0) {
      selected.set(card.id, { card, quantity: current + added, section, allocation });
    }
    return added;
  };

  if (seed.commander) {
    if (
      constraints.excludedCardIds.includes(seed.commander.id) ||
      addCopies(seed.commander, 1, "commander", "commander") !== 1
    ) return null;
  }

  const themeEvidence = (card: LoadedCard) =>
    themeEvidenceFor(card, seed.themeSlug, seed.typalSubtype);
  const chooseAllocation = (card: LoadedCard): AllocationSlot | null => {
    if (card.isLand) return "land";
    const evidence = themeEvidence(card);
    if (seed.format === "brawl") {
      if (card.features.roles.has("ramp")) return "ramp";
      if (card.features.roles.has("interaction")) return "interaction";
      if (card.features.roles.has("advantage")) return "draw";
      if (card.features.roles.has("protection")) return "protection";
      if (evidence.length > 0) return "theme";
      return null;
    }
    if (evidence.some((item) => item.relation === "enabler")) return "enabler";
    if (evidence.some((item) => item.relation === "payoff") || card.features.roles.has("threat")) return "payoff-threat";
    if (card.features.roles.has("interaction")) return "interaction";
    if (card.features.roles.has("advantage")) return "draw";
    return null;
  };

  const effectiveLocks = [
    ...(seed.anchorCardId ? [{ cardId: seed.anchorCardId }] : []),
    ...constraints.lockedCards
  ].filter((lock, index, all) =>
    all.findIndex((candidate) => candidate.cardId === lock.cardId) === index
  );
  for (const locked of effectiveLocks) {
    const card = byId.get(locked.cardId);
    if (!card || !allowed.some((candidate) => candidate.id === card.id)) return null;
    const allocation = chooseAllocation(card);
    if (!allocation) return null;
    const desired = locked.quantity ?? 1;
    if (addCopies(card, desired, allocation) !== desired) return null;
  }

  const slotTargets: Array<{ slot: AllocationSlot; target: number; label: string }> =
    seed.format === "standard"
      ? seed.profile === "proactive"
        ? [
            { slot: "enabler", target: 16, label: "Theme enablers" },
            { slot: "payoff-threat", target: 12, label: "Payoffs and threats" },
            { slot: "interaction", target: 6, label: "Interaction" },
            { slot: "draw", target: 3, label: "Card advantage" },
            { slot: "land", target: 23, label: "Lands" }
          ]
        : [
            { slot: "enabler", target: 12, label: "Theme enablers" },
            { slot: "payoff-threat", target: 10, label: "Payoffs and threats" },
            { slot: "interaction", target: 8, label: "Interaction" },
            { slot: "draw", target: 5, label: "Card advantage" },
            { slot: "land", target: 25, label: "Lands" }
          ]
      : [
          { slot: "theme", target: 30, label: "Commander theme" },
          { slot: "ramp", target: 10, label: "Ramp and fixing" },
          { slot: "interaction", target: 10, label: "Interaction" },
          { slot: "draw", target: 8, label: "Card advantage" },
          { slot: "protection", target: 3, label: "Protection and recursion" },
          { slot: "land", target: 38, label: "Lands" }
        ];
  const nonlands = allowed.filter((card) => !card.isLand);
  const utility = (card: LoadedCard) => {
    const evidence = themeEvidence(card);
    const themeScore = evidence.reduce((score, item) => score + (item.relation === "payoff" ? 6 : item.relation === "enabler" ? 4 : 1), 0);
    const roleScore = card.features.roles.has("interaction") ? 3 : card.features.roles.has("advantage") ? 2 : card.features.roles.has("threat") ? 1 : 0;
    return themeScore * 10 + roleScore * 3 + (card.ownedCount > 0 ? 25 : 0) - card.manaValue;
  };
  const sorted = [...nonlands].sort((left, right) => utility(right) - utility(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

  const allocationCount = (slot: AllocationSlot) =>
    [...selected.values()]
      .filter((entry) => entry.section === "main" && entry.allocation === slot)
      .reduce((sum, entry) => sum + entry.quantity, 0);
  const slotPredicate = (slot: AllocationSlot, card: LoadedCard) => {
    const evidence = themeEvidence(card);
    switch (slot) {
      case "enabler":
        return evidence.some((item) => item.relation === "enabler");
      case "payoff-threat":
        return evidence.some((item) => item.relation === "payoff") || card.features.roles.has("threat");
      case "theme":
        return evidence.length > 0;
      case "interaction":
        return card.features.roles.has("interaction");
      case "draw":
        return card.features.roles.has("advantage");
      case "ramp":
        return card.features.roles.has("ramp");
      case "protection":
        return card.features.roles.has("protection");
      default:
        return false;
    }
  };
  for (const target of slotTargets.filter((target) => target.slot !== "land")) {
    if (allocationCount(target.slot) > target.target) return null;
    if (target.slot === "theme" && seed.format === "brawl" && seed.commander) {
      const required = getBrawlThemeMinimums(
        seed.commander,
        seed.themeSlug,
        seed.typalSubtype
      );
      for (const relation of ["enabler", "payoff"] as const) {
        const relationCount = () => [...selected.values()]
          .filter((entry) =>
            entry.section === "main" &&
            entry.allocation === "theme" &&
            themeEvidence(entry.card).some((item) => item.relation === relation)
          )
          .reduce((sum, entry) => sum + entry.quantity, 0);
        let relationGuard = 0;
        while (relationCount() < required[relation] && relationGuard < 1_000) {
          relationGuard += 1;
          const candidate = sorted.find((card) =>
            themeEvidence(card).some((item) => item.relation === relation) &&
            (!selected.has(card.id) || selected.get(card.id)?.allocation === "theme") &&
            (getMaxCopiesForCard(seed.format, cardRuleEntry(card, 1, "main")) ?? Number.POSITIVE_INFINITY) >
              (selected.get(card.id)?.quantity ?? 0)
          );
          if (!candidate) return null;
          if (addCopies(candidate, 1, "theme") === 0) {
            sorted.splice(sorted.indexOf(candidate), 1);
          }
        }
        if (relationCount() < required[relation]) return null;
      }
    }
    let guard = 0;
    while (allocationCount(target.slot) < target.target && guard < 1_000) {
      guard += 1;
      const candidates = sorted.filter((card) =>
        slotPredicate(target.slot, card) &&
        (!selected.has(card.id) || selected.get(card.id)?.allocation === target.slot) &&
        (getMaxCopiesForCard(seed.format, cardRuleEntry(card, 1, "main")) ?? Number.POSITIVE_INFINITY) >
          (selected.get(card.id)?.quantity ?? 0)
      );
      const candidate = candidates[0];
      if (!candidate) return null;
      if (addCopies(candidate, 1, target.slot) === 0) {
        sorted.splice(sorted.indexOf(candidate), 1);
      }
    }
    if (allocationCount(target.slot) !== target.target) return null;
  }

  const basicLands = allowed.filter((card) => card.isBasicLand);
  const exactWastes = basicLands.filter((card) => card.normalizedName === "wastes" || card.normalizedName === "snow-covered wastes");
  const colorBasics = new Map<CoachColor, LoadedCard>();
  for (const color of seed.colors) {
    const basic = basicLands.find((card) => basicLandColor(card.typeLine) === color || card.producedMana.includes(color));
    if (basic) colorBasics.set(color, basic);
  }
  const basicsToUse = seed.colors.length === 0 ? exactWastes.slice(0, 1) : seed.colors.flatMap((color) => colorBasics.get(color) ?? []);
  if (basicsToUse.length === 0) return null;
  const landTarget = slotTargets.find((target) => target.slot === "land")?.target ?? 0;
  if (allocationCount("land") > landTarget) return null;
  const nonbasicLands = allowed
    .filter((card) => card.isLand && !card.isBasicLand && card.ownedCount > 0 && !selected.has(card.id))
    .sort((left, right) => right.ownedCount - left.ownedCount || left.name.localeCompare(right.name));
  const nonbasicTarget = Math.min(seed.format === "standard" ? 8 : 14, landTarget);
  for (const land of nonbasicLands) {
    if (allocationCount("land") >= nonbasicTarget) break;
    addCopies(land, Math.min(nonbasicTarget - allocationCount("land"), seed.format === "standard" ? 4 : 1), "land");
  }
  let basicIndex = 0;
  while (allocationCount("land") < landTarget) {
    const basic = basicsToUse[basicIndex % basicsToUse.length];
    if (!basic) return null;
    const current = selected.get(basic.id);
    selected.set(basic.id, {
      card: basic,
      quantity: (current?.quantity ?? 0) + 1,
      section: "main",
      allocation: "land"
    });
    basicIndex += 1;
  }

  const selectedList = [...selected.values()].sort((left, right) => left.section.localeCompare(right.section) || left.card.name.localeCompare(right.card.name));
  if (!passesCurveGuardrail(seed, selectedList) || !hasManaSourceCoverage(seed, selectedList)) {
    return null;
  }
  const synergyClaims = buildSynergyClaims(seed, selectedList);
  if (synergyClaims.length === 0) return null;
  const ruleValidation = validateDeckCandidate(seed.format, selectedList.map((entry) => cardRuleEntry(entry.card, entry.quantity, entry.section)));
  const validationIssues = ruleValidation.issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    ...(issue.cardId ? { cardId: issue.cardId } : {}),
    ...(issue.cardName ? { cardName: issue.cardName } : {})
  }));
  if (validationIssues.length > 0) return null;

  const toGroup = (card: LoadedCard): CoachCardGroup => {
    const allocation = selected.get(card.id)?.allocation;
    if (allocation === "land" || allocation === "ramp") return "mana";
    if (allocation === "interaction") return "interaction";
    if (["enabler", "payoff-threat", "theme", "commander"].includes(allocation ?? "")) return "core";
    return "support";
  };
  const prototypeCards: CoachPrototypeCard[] = selectedList.map((entry) => {
    const ownedQuantity = entry.card.isBasicLand ? entry.quantity : Math.min(entry.quantity, entry.card.ownedCount);
    return {
      cardId: entry.card.id,
      name: entry.card.name,
      quantity: entry.quantity,
      section: entry.section,
      group: toGroup(entry.card),
      manaCost: entry.card.manaCost,
      manaValue: entry.card.manaValue,
      typeLine: entry.card.typeLine,
      rarity: entry.card.rarity,
      imageUrl: entry.card.imageUrl,
      ownedQuantity,
      craftQuantity: entry.card.isBasicLand ? 0 : Math.max(entry.quantity - entry.card.ownedCount, 0),
      evidence: entry.card.features.all.slice(0, 50)
    };
  });
  const craftGaps = prototypeCards
    .filter((card): card is typeof card & { rarity: CoachRarity } =>
      card.craftQuantity > 0 && RARITY_ORDER.includes(card.rarity as CoachRarity)
    )
    .map((card) => ({ cardId: card.cardId, name: card.name, rarity: card.rarity, quantity: card.craftQuantity }));
  const roleCoverage = slotTargets.map(({ slot, target, label }) => {
    const count = allocationCount(slot);
    return { slug: slot, label, count, target, status: count >= target ? "met" as const : "thin" as const };
  });
  const concerns = roleCoverage
    .filter((role) => role.status === "thin")
    .slice(0, 3)
    .map((role) => ({
      code: `thin-${role.slug}`,
      severity: "warning" as const,
      title: `${role.label} look thin`,
      detail: `This draft has ${role.count} ${role.label.toLowerCase()} against a structural target of ${role.target}.`,
      cardIds: []
    }));
  const selectedIds = new Set(selectedList.map((entry) => entry.card.id));
  const alternativesByAllocation = new Map<AllocationSlot, LoadedCard[]>();
  for (const allocation of new Set(selectedList.map((entry) => entry.allocation))) {
    alternativesByAllocation.set(
      allocation,
      allowed
        .filter((card) =>
          !card.isLand &&
          !selectedIds.has(card.id) &&
          card.ownedCount > 0 &&
          slotPredicate(allocation, card)
        )
        .sort((left, right) => utility(right) - utility(left) || left.name.localeCompare(right.name))
    );
  }
  const replacements: ReplacementCandidate[] = [];
  for (const entry of selectedList.filter((item) =>
    item.section === "main" &&
    !item.card.isBasicLand &&
    item.card.id !== seed.anchorCardId
  )) {
    const alternatives = alternativesByAllocation.get(entry.allocation) ?? [];
    const alternative = alternatives.shift();
    if (!alternative) continue;
    replacements.push({
      forCardId: entry.card.id,
      card: cardRef(alternative),
      reason: `An owned ${SECTION_LABELS[toGroup(entry.card)].toLowerCase()} alternative for ${entry.card.name}.`,
      craftDelta: emptyCost()
    });
    if (replacements.length === 3) break;
  }
  const themeDensityCount = prototypeCards
    .filter((card) => card.section === "main" && selected.get(card.cardId)?.allocation === "theme")
    .reduce((sum, card) => sum + card.quantity, 0);
  const warnings = ["Craft rarity is estimated from the local Arena print metadata; review the exact Arena craft screen before spending wildcards."];
  return {
    seed,
    selected: selectedList,
    cards: prototypeCards,
    craftCost,
    craftGaps,
    roleCoverage,
    concerns,
    replacements,
    synergyClaims,
    validation: { isLegal: true, counts: ruleValidation.counts, issues: validationIssues },
    warnings,
    themeDensityCount
  };
};

const ideaFromBuilt = (
  built: BuiltPrototype,
  sourceBase: ReturnType<typeof getSourceBase>,
  request: CoachIdeasRequest
): CoachIdea => {
  const nonBasic = built.cards.filter((card) => !isBasicLandRule(card.typeLine));
  const required = nonBasic.reduce((sum, card) => sum + card.quantity, 0);
  const owned = nonBasic.reduce((sum, card) => sum + card.ownedQuantity, 0);
  const seed = built.seed;
  const baseTheme = getCoachTheme(seed.themeSlug);
  const source = sourceFor(sourceBase, {
    request: { ...request, excludedIdeaFingerprints: [], excludedConstraintFingerprints: [] },
    ideaFingerprint: seed.ideaFingerprint
  });
  const primaryExplanation = built.synergyClaims[0]?.explanation ?? baseTheme.plan;
  const secondaryExplanation = built.synergyClaims[1]?.explanation ?? primaryExplanation;
  return {
    ideaId: seed.ideaId,
    ideaFingerprint: seed.ideaFingerprint,
    format: seed.format,
    title: seed.commander ? `${seed.commander.name} · ${seed.themeLabel}` : `${describeColors(seed.colors)} ${seed.themeLabel}`,
    profile: seed.profile,
    theme: { slug: seed.themeSlug, label: seed.themeLabel, plan: baseTheme.plan },
    colors: seed.colors,
    commander: seed.commander ? cardRef(seed.commander, themeEvidenceFor(seed.commander, seed.themeSlug, seed.typalSubtype)) : null,
    anchors: seed.anchors.map((card) => cardRef(card, themeEvidenceFor(card, seed.themeSlug, seed.typalSubtype))),
    whyItAppeared: primaryExplanation,
    evidence: {
      synergyClaims: built.synergyClaims,
      ownedThemeCards: seed.ownedThemeCards,
      enablers: seed.enablers,
      payoffs: seed.payoffs,
      summary: secondaryExplanation,
      features: seed.anchors.flatMap((card) => themeEvidenceFor(card, seed.themeSlug, seed.typalSubtype)).slice(0, 100)
    },
    ownership: {
      ownedNonBasicCopies: owned,
      requiredNonBasicCopies: required,
      percent: required === 0 ? 100 : Math.round((owned / required) * 100)
    },
    craftCost: built.craftCost,
    craftGaps: built.craftGaps,
    source,
    warnings: built.warnings
  };
};

const ideaOverlap = (left: BuiltPrototype, right: BuiltPrototype) => {
  const leftIds = new Set(left.cards.filter((card) => card.group !== "mana").map((card) => card.cardId));
  const rightIds = new Set(right.cards.filter((card) => card.group !== "mana").map((card) => card.cardId));
  const intersection = [...leftIds].filter((id) => rightIds.has(id)).length;
  const union = new Set([...leftIds, ...rightIds]).size;
  return union === 0 ? 0 : intersection / union;
};

const generate = (db: DbHandle, request: CoachIdeasRequest) => {
  const sourceBase = getSourceBase(db);
  const loaded = loadEligibleCardsCached(db, request.format, sourceBase.dataFingerprint);
  const seeds = makeSeeds(loaded.cards, request, sourceBase);
  for (const seed of seeds) cacheSeed(db, sourceBase.dataFingerprint, seed);
  const excluded = new Set([
    ...request.excludedIdeaFingerprints,
    ...request.excludedConstraintFingerprints
  ]);
  const eligibleSeeds = seeds.filter((seed) => !excluded.has(seed.ideaFingerprint));
  const seedQueue: IdeaSeed[] = [];
  const queued = new Set<string>();
  const seenThemes = new Set<CoachThemeSlug>();
  const seenColors = new Set<string>();
  const seenCommanders = new Set<string>();
  const enqueue = (seed: IdeaSeed) => {
    if (queued.has(seed.ideaFingerprint)) return;
    queued.add(seed.ideaFingerprint);
    seenThemes.add(seed.themeSlug);
    seenColors.add(seed.colors.join(""));
    if (seed.commander) seenCommanders.add(seed.commander.id);
    seedQueue.push(seed);
  };

  // Try the genuinely different paths first. This prevents a broad five-color
  // commander (or one dense Standard color pair) from occupying every visible
  // slot simply because it has the largest eligible card pool.
  for (const seed of eligibleSeeds) {
    if (seenThemes.has(seed.themeSlug) || seenColors.has(seed.colors.join(""))) continue;
    if (seed.commander && seenCommanders.has(seed.commander.id)) continue;
    enqueue(seed);
  }
  for (const seed of eligibleSeeds) {
    if (seenThemes.has(seed.themeSlug)) continue;
    if (seed.commander && seenCommanders.has(seed.commander.id)) continue;
    enqueue(seed);
  }
  for (const seed of eligibleSeeds) {
    if (!seenThemes.has(seed.themeSlug)) enqueue(seed);
  }
  for (const seed of eligibleSeeds) enqueue(seed);
  const builtCandidates: BuiltPrototype[] = [];
  for (const seed of seedQueue.slice(0, 40)) {
    const built = buildPrototype(seed, loaded.cards, request.craftBudget, {
      lockedCards: [],
      excludedCardIds: []
    });
    if (built) builtCandidates.push(built);
    if (new Set(builtCandidates.map((candidate) => candidate.seed.themeSlug)).size >= 3) break;
  }
  builtCandidates.sort((left, right) =>
    left.craftCost.mythic - right.craftCost.mythic ||
    left.craftCost.rare - right.craftCost.rare ||
    right.seed.payoffs - left.seed.payoffs ||
    right.seed.enablers - left.seed.enablers ||
    right.seed.ownedThemeCards - left.seed.ownedThemeCards ||
    left.seed.ideaFingerprint.localeCompare(right.seed.ideaFingerprint)
  );
  const selected: BuiltPrototype[] = [];
  for (const candidate of builtCandidates) {
    if (selected.some((existing) => existing.seed.themeSlug === candidate.seed.themeSlug)) continue;
    if (selected.some((existing) => ideaOverlap(existing, candidate) > 0.72)) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }
  for (const candidate of builtCandidates) {
    if (selected.length === 3) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  const requestSource = sourceFor(sourceBase, request);
  const ideas = selected.map((built) => ideaFromBuilt(built, sourceBase, request));
  const response: CoachIdeasResponse = {
    source: requestSource,
    generatedAt: new Date().toISOString(),
    format: request.format,
    ideas,
    diagnostics: {
      ownedLegalCards: loaded.cards.filter((card) => card.ownedCount > 0).length,
      candidateIdeas: seeds.length,
      excludedPlaceholders: loaded.excludedPlaceholders,
      message: ideas.length === 0
        ? "No complete collection-fit prototype met the current format and crafting constraints."
        : ideas.length < 3
          ? `Only ${ideas.length} collection-fit ${ideas.length === 1 ? "idea" : "ideas"} met every legality, structure, theme, ownership, and crafting constraint; Coach did not pad the result with weaker concepts.`
          : null
    }
  };
  return { response, selected, cards: loaded.cards, sourceBase };
};

export const getCoachIdeas = (db: DbHandle, request: CoachIdeasRequest): CoachIdeasResponse =>
  generate(db, request).response;

export const getCoachPrototype = (db: DbHandle, request: CoachPrototypeRequest): CoachPrototype => {
  const currentSource = getSourceBase(db);
  if (
    request.source.dataFingerprint !== currentSource.dataFingerprint ||
    request.source.featureVersion !== COACH_FEATURE_VERSION ||
    request.source.collectionImportId !== currentSource.collectionImportId ||
    request.source.catalogSyncedAt !== currentSource.catalogSyncedAt
  ) {
    throw new CoachServiceError(
      "The collection or card catalog changed after these ideas were generated. Refresh Coach before opening this prototype.",
      "SOURCE_CHANGED",
      409
    );
  }
  const locator = parseIdeaId(request.ideaId);
  const baseRequest: CoachIdeasRequest = {
    format: request.format,
    craftBudget: request.craftBudget,
    ...(locator?.anchorCardId ? { anchorCardId: locator.anchorCardId } : {}),
    ...(locator?.commanderCardId ? { commanderCardId: locator.commanderCardId } : {}),
    excludedIdeaFingerprints: [],
    excludedConstraintFingerprints: []
  };
  const cachedSeed = ideaCaches.get(db)?.get(`${currentSource.dataFingerprint}:${request.ideaId}`);
  const loaded = loadEligibleCardsCached(db, request.format, currentSource.dataFingerprint);
  const fallbackSeed = cachedSeed ?? (
    locator?.format === request.format
      ? makeSeeds(loaded.cards, baseRequest, currentSource).find((candidate) =>
          candidate.ideaId === request.ideaId &&
          candidate.themeSlug === locator.themeSlug &&
          candidate.colors.join("") === locator.colors.join("") &&
          candidate.typalSubtype === locator.typalSubtype
        )
      : makeSeeds(loaded.cards, baseRequest, currentSource)
          .find((candidate) => candidate.ideaId === request.ideaId)
  );
  const seed = fallbackSeed;
  if (!seed) {
    throw new CoachServiceError("Coach idea not found for the current source snapshot.", "IDEA_NOT_FOUND", 404);
  }
  const rebuilt = buildPrototype(seed, loaded.cards, request.craftBudget, {
    lockedCards: request.lockedCards,
    excludedCardIds: request.excludedCardIds
  });
  if (!rebuilt) {
    throw new CoachServiceError(
      "The locked, excluded, and crafting constraints cannot produce a complete legal deck.",
      "INFEASIBLE_CONSTRAINTS",
      422
    );
  }
  const idea = ideaFromBuilt(rebuilt, currentSource, baseRequest);
  const source = sourceFor(currentSource, {
    ideaFingerprint: seed.ideaFingerprint,
    lockedCards: request.lockedCards,
    excludedCardIds: request.excludedCardIds,
    craftBudget: request.craftBudget
  });
  const sections = (["core", "support", "interaction", "mana"] as const).map((group) => ({
    group,
    label: SECTION_LABELS[group],
    cards: rebuilt.cards.filter((card) => card.group === group)
  })).filter((section) => section.cards.length > 0);
  return {
    source,
    idea: { ...idea, source },
    deck: { name: idea.title, format: request.format, cards: rebuilt.cards },
    sections,
    craftCost: rebuilt.craftCost,
    craftGaps: rebuilt.craftGaps,
    roleCoverage: rebuilt.roleCoverage,
    themeDensity: request.format === "brawl"
      ? { count: rebuilt.themeDensityCount, target: 30, label: `${rebuilt.themeDensityCount} cards directly advance ${idea.theme.label}.` }
      : null,
    concerns: rebuilt.concerns,
    replacements: rebuilt.replacements,
    warnings: rebuilt.warnings,
    validation: rebuilt.validation
  };
};
