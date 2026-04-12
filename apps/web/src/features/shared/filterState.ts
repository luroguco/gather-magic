import type { ArenaFormat, Mechanic } from "../../types";

export const FORMATS = [
  ["standard", "Standard"],
  ["alchemy", "Alchemy"],
  ["explorer", "Explorer"],
  ["historic", "Historic"],
  ["timeless", "Timeless"],
  ["brawl", "Brawl"],
  ["standardbrawl", "Standard Brawl"]
] as const;

export const COLORS = ["W", "U", "B", "R", "G"] as const;
export const CARD_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land"] as const;
export const RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
export const SEARCH_PAGE_SIZE = 50_000;
export const INITIAL_VISIBLE_RESULTS = 120;
export const VISIBLE_RESULTS_STEP = 120;

export type FilterState = {
  q: string;
  format: ArenaFormat;
  colors: string[];
  mechanics: string[];
  types: string[];
  subtypes: string;
  rarity: string[];
  playableCountMin: string;
  playableCountMax: string;
  manaValueMin: string;
  manaValueMax: string;
  ownedOnly: boolean;
  drilldownKind: "" | StatsDrilldownKind;
  drilldownKey: string;
  drilldownLabel: string;
};

export type FilterStateUpdater = (updater: (current: FilterState) => FilterState) => void;
export type ResultsViewMode = "grid" | "list" | "table";
export type StatsDrilldownKind = "color" | "manaValue" | "type" | "rarity" | "set" | "mechanic";

type MechanicBucketOrder = readonly string[];

export type MechanicSection = {
  id: string;
  label: string;
  items: Mechanic[];
};

const defaultFilterState = {
  q: "",
  format: "standard" as ArenaFormat,
  colors: [] as string[],
  mechanics: [] as string[],
  types: [] as string[],
  subtypes: "",
  rarity: [] as string[],
  playableCountMin: "",
  playableCountMax: "",
  manaValueMin: "",
  manaValueMax: ""
};

export const defaultSearch: FilterState = {
  ...defaultFilterState,
  ownedOnly: false,
  drilldownKind: "",
  drilldownKey: "",
  drilldownLabel: ""
};

export const defaultStatsFilters: FilterState = {
  ...defaultFilterState,
  ownedOnly: true,
  drilldownKind: "",
  drilldownKey: "",
  drilldownLabel: ""
};

const derivedBucketLabels: Record<string, string> = {
  advantage: "Card Advantage",
  removal: "Removal",
  graveyard: "Graveyard",
  tokens: "Tokens and Counters",
  mana: "Mana and Ramp",
  synergy: "Synergy",
  combat: "Combat"
};

const derivedBucketOrder = ["advantage", "removal", "graveyard", "tokens", "mana", "synergy", "combat"] as const;

const keywordBucketLabels: Record<string, string> = {
  evasion: "Combat and Evasion",
  defense: "Defense and Protection",
  casting: "Casting and Timing",
  resources: "Resources and Objects",
  library: "Library and Graveyard",
  transformation: "Transform and Alternate Casting",
  misc: "Other Keywords"
};

const keywordBucketOrder = ["evasion", "defense", "casting", "resources", "library", "transformation", "misc"] as const;

export const toggleValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

export const buildSearchParams = (state: FilterState) => {
  const params = new URLSearchParams();

  if (state.q.trim()) {
    params.set("q", state.q.trim());
  }
  if (state.format) {
    params.set("format", state.format);
  }
  if (state.colors.length) {
    params.set("colors", state.colors.join(","));
  }
  if (state.mechanics.length) {
    params.set("mechanics", state.mechanics.join(","));
  }
  if (state.types.length) {
    params.set("types", state.types.join(","));
  }
  if (state.subtypes.trim()) {
    params.set(
      "subtypes",
      state.subtypes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .join(",")
    );
  }
  if (state.rarity.length) {
    params.set("rarity", state.rarity.join(","));
  }
  if (state.ownedOnly) {
    params.set("ownedOnly", "true");
  }
  if (state.playableCountMin) {
    params.set("playableCountMin", state.playableCountMin);
  }
  if (state.playableCountMax) {
    params.set("playableCountMax", state.playableCountMax);
  }
  if (state.manaValueMin) {
    params.set("manaValueMin", state.manaValueMin);
  }
  if (state.manaValueMax) {
    params.set("manaValueMax", state.manaValueMax);
  }
  if (state.drilldownKind && state.drilldownKey) {
    params.set("drilldownKind", state.drilldownKind);
    params.set("drilldownKey", state.drilldownKey);
  }

  params.set("page", "1");
  params.set("pageSize", String(SEARCH_PAGE_SIZE));
  return params;
};

export const mergeSharedFilterFields = (target: FilterState, source: FilterState): FilterState => ({
  ...target,
  q: source.q,
  format: source.format,
  colors: [...source.colors],
  mechanics: [...source.mechanics],
  types: [...source.types],
  subtypes: source.subtypes,
  rarity: [...source.rarity],
  playableCountMin: source.playableCountMin,
  playableCountMax: source.playableCountMax,
  manaValueMin: source.manaValueMin,
  manaValueMax: source.manaValueMax
});

export const clearDrilldownState = (state: FilterState): FilterState => ({
  ...state,
  drilldownKind: "",
  drilldownKey: "",
  drilldownLabel: ""
});

const getDerivedBucketId = (slug: string) => {
  if (["card-draw", "enter-the-battlefield"].includes(slug)) {
    return "advantage";
  }
  if (["spot-removal", "board-wipe", "counterspell", "burn"].includes(slug)) {
    return "removal";
  }
  if (
    ["self-mill", "discard", "discard-payoff", "graveyard-recursion", "reanimation", "graveyard-hate", "death-triggers"].includes(
      slug
    )
  ) {
    return "graveyard";
  }
  if (["token-creation", "token-payoff", "counters-plus-one"].includes(slug)) {
    return "tokens";
  }
  if (["ramp", "landfall"].includes(slug)) {
    return "mana";
  }
  if (["sacrifice", "blink", "artifact-matters", "enchantment-matters", "lifegain", "lifegain-payoff", "spellslinger"].includes(slug)) {
    return "synergy";
  }
  return "combat";
};

const getKeywordBucketId = (slug: string) => {
  if (["flying", "trample", "menace", "reach", "first-strike", "double-strike", "deathtouch", "lifelink", "haste", "vigilance"].includes(slug)) {
    return "evasion";
  }
  if (["ward", "hexproof", "indestructible", "protection", "defender"].includes(slug)) {
    return "defense";
  }
  if (["flash", "kicker", "convoke", "spree", "bargain", "casualty", "gift", "equip", "enchant"].includes(slug)) {
    return "casting";
  }
  if (["treasure", "cycling", "landwalk", "domain"].includes(slug)) {
    return "resources";
  }
  if (["scry", "surveil", "mill", "flashback", "unearth", "morph", "discover"].includes(slug)) {
    return "library";
  }
  if (["transform", "foretell", "plot", "disturb", "disguise", "daybound", "nightbound"].includes(slug)) {
    return "transformation";
  }
  return "misc";
};

const groupMechanics = (
  items: Mechanic[],
  bucketFor: (slug: string) => string,
  labels: Record<string, string>,
  order: MechanicBucketOrder
) => {
  const grouped = new Map<string, Mechanic[]>();
  for (const item of items) {
    const bucketId = bucketFor(item.slug);
    const bucketItems = grouped.get(bucketId) ?? [];
    bucketItems.push(item);
    grouped.set(bucketId, bucketItems);
  }

  const sections = order
    .map((bucketId) => ({
      id: bucketId,
      label: labels[bucketId] ?? bucketId,
      items: grouped.get(bucketId) ?? []
    }))
    .filter((section) => section.items.length > 0);

  for (const [bucketId, bucketItems] of grouped.entries()) {
    if (order.includes(bucketId as (typeof order)[number])) {
      continue;
    }
    sections.push({
      id: bucketId,
      label: labels[bucketId] ?? bucketId,
      items: bucketItems
    });
  }

  return sections;
};

export const groupDerivedMechanics = (items: Mechanic[]) =>
  groupMechanics(items, getDerivedBucketId, derivedBucketLabels, derivedBucketOrder);

export const groupKeywordMechanics = (items: Mechanic[]) =>
  groupMechanics(items, getKeywordBucketId, keywordBucketLabels, keywordBucketOrder);
