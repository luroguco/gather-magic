import type {
  CoachColor,
  CoachFeatureEvidence,
  CoachProfile,
  CoachTheme,
  CoachThemeSlug
} from "@mtga/contracts";

export const COACH_THEMES: ReadonlyArray<CoachTheme & { profile: CoachProfile }> = [
  {
    slug: "tokens",
    label: "Tokens",
    profile: "proactive",
    plan: "Build a wide board, then turn a crowd of small tokens into a decisive attack."
  },
  {
    slug: "counters",
    label: "+1/+1 Counters",
    profile: "proactive",
    plan: "Grow efficient creatures with counters and compound every counter placed."
  },
  {
    slug: "lifegain",
    label: "Lifegain",
    profile: "proactive",
    plan: "Gain life repeatedly and convert those triggers into larger threats and staying power."
  },
  {
    slug: "sacrifice",
    label: "Sacrifice Value",
    profile: "value",
    plan: "Turn expendable permanents into cards, damage, and death-trigger value."
  },
  {
    slug: "graveyard",
    label: "Graveyard Value",
    profile: "value",
    plan: "Stock the graveyard, then reuse it as a second hand for steady card advantage."
  },
  {
    slug: "blink-etb",
    label: "Blink / ETB",
    profile: "value",
    plan: "Reuse enter-the-battlefield abilities by exiling and returning your own permanents."
  },
  {
    slug: "landfall",
    label: "Landfall",
    profile: "value",
    plan: "Keep lands entering the battlefield and turn every land drop into extra value."
  },
  {
    slug: "typal",
    label: "Typal",
    profile: "proactive",
    plan: "Concentrate on a creature type and compound the rewards that explicitly support it."
  }
];

export const COACH_ROLE_LABELS: Record<string, string> = {
  threat: "Threats",
  interaction: "Interaction",
  advantage: "Card advantage",
  ramp: "Ramp and fixing",
  protection: "Protection and recursion",
  finisher: "Finishers",
  land: "Mana"
};

export type CoachFeatureCardInput = {
  oracleText: string;
  typeLine: string;
  manaValue: number;
  keywords: string[];
  mechanics: string[];
};

export type CoachCardFeatures = {
  themes: Map<CoachThemeSlug, CoachFeatureEvidence[]>;
  roles: Map<string, CoachFeatureEvidence[]>;
  all: CoachFeatureEvidence[];
};

const evidence = (
  featureKind: CoachFeatureEvidence["featureKind"],
  featureSlug: string,
  relation: CoachFeatureEvidence["relation"],
  source: CoachFeatureEvidence["source"],
  ruleId: string,
  label: string
): CoachFeatureEvidence => ({
  featureKind,
  featureSlug,
  relation,
  source,
  ruleId,
  label
});

const addFeature = <K extends string>(
  map: Map<K, CoachFeatureEvidence[]>,
  slug: K,
  next: CoachFeatureEvidence
) => {
  const existing = map.get(slug) ?? [];
  if (!existing.some((item) => item.ruleId === next.ruleId)) {
    existing.push(next);
    map.set(slug, existing);
  }
};

const matchesAny = (value: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(value));

export const classifyCoachCard = (card: CoachFeatureCardInput): CoachCardFeatures => {
  let oracle = card.oracleText.toLowerCase();
  // Reminder text explains rules but is not an effect the card itself performs.
  for (let pass = 0; pass < 3; pass += 1) {
    oracle = oracle.replace(/\([^()]*\)/g, " ");
  }
  const typeLine = card.typeLine.toLowerCase();
  const keywords = new Set(card.keywords.map((keyword) => keyword.toLowerCase()));
  const mechanics = new Set(card.mechanics.map((mechanic) => mechanic.toLowerCase()));
  const themes = new Map<CoachThemeSlug, CoachFeatureEvidence[]>();
  const roles = new Map<string, CoachFeatureEvidence[]>();

  const addTheme = (
    slug: CoachThemeSlug,
    relation: CoachFeatureEvidence["relation"],
    source: CoachFeatureEvidence["source"],
    ruleId: string,
    label: string
  ) => addFeature(themes, slug, evidence("theme", slug, relation, source, ruleId, label));
  const addRole = (
    slug: string,
    source: CoachFeatureEvidence["source"],
    ruleId: string,
    label: string
  ) => addFeature(roles, slug, evidence("role", slug, "none", source, ruleId, label));

  if (mechanics.has("token-creation") || /create(?:s)? [^.]* token/.test(oracle)) {
    addTheme("tokens", "enabler", "oracle-rule", "tokens:create", "Creates tokens for the deck's core plan.");
  }
  if (matchesAny(oracle, [/tokens? you control/, /for each token/, /whenever one or more tokens/])) {
    addTheme("tokens", "payoff", "oracle-rule", "tokens:payoff", "Rewards a wide board or token creation.");
  }

  const placesPlusOneCounters =
    ["adapt", "backup", "evolve", "fabricate", "mentor", "reinforce", "riot", "training"]
      .some((keyword) => keywords.has(keyword)) ||
    matchesAny(oracle, [
      /put (?:a|an|one|two|three|four|five|six|x|\d+)[^.]*\+1\/\+1 counters? on/,
      /enters? with [^.]*\+1\/\+1 counters?/,
      /distribute [^.]*\+1\/\+1 counters?/
    ]);
  if (placesPlusOneCounters) {
    addTheme("counters", "enabler", "oracle-rule", "counters:place", "Places or carries +1/+1 counters.");
  }
  if (
    matchesAny(oracle, [
      /for each[^.]*counter/,
      /with (?:a|one or more) \+1\/\+1 counter/,
      /double the number of[^.]*counter/,
      /whenever one or more counters/
    ])
  ) {
    addTheme("counters", "payoff", "oracle-rule", "counters:payoff", "Scales with creatures or permanents that have counters.");
  }

  if (
    keywords.has("lifelink") ||
    /(?:you )?gain(?:s)? (?:x|\d+) life|gain that much life|you gain life equal to/.test(oracle)
  ) {
    addTheme("lifegain", "enabler", "oracle-rule", "lifegain:gain", "Gains life or supplies lifelink.");
  }
  if (mechanics.has("lifegain-payoff") || /whenever you gain life|if you gained life/.test(oracle)) {
    addTheme("lifegain", "payoff", "oracle-rule", "lifegain:payoff", "Rewards repeated life-gain events.");
  }

  const selfDirectedSacrifice =
    keywords.has("exploit") ||
    keywords.has("casualty") ||
    keywords.has("bargain") ||
    matchesAny(oracle, [
      /\byou (?:may|must) sacrifice (?:a|an|another|one or more|this)\b/,
      /(?:^|[\n•—.;:,])\s*you sacrifice (?:a|an|another|one or more|this)\b/,
      /as an additional cost[^.]*sacrifice (?:a|an|another|one or more)\b/,
      /(?:^|[\n•—.;:,])\s*sacrifice (?:a|an|another|one or more|this)\b/
    ]);
  if (selfDirectedSacrifice) {
    addTheme("sacrifice", "enabler", "oracle-rule", "sacrifice:outlet", "Provides or asks for a sacrifice outlet.");
  }
  const temporaryReturnTrick = /when[^.]* dies,[^.]*return (?:it|that card) to the battlefield/.test(oracle);
  if (
    !temporaryReturnTrick &&
    (mechanics.has("death-triggers") ||
      matchesAny(oracle, [/whenever[^.]* dies/, /when[^.]* dies/, /whenever you sacrifice/, /if you sacrificed/]))
  ) {
    addTheme("sacrifice", "payoff", "oracle-rule", "sacrifice:payoff", "Pays you when a permanent dies or is sacrificed.");
  }
  if (themes.has("tokens")) {
    addTheme("sacrifice", "support", "oracle-rule", "sacrifice:fodder", "Token production supplies expendable permanents.");
  }

  const selfDirectedDiscard = matchesAny(oracle, [
    /\byou (?:may|must) discard\b/,
    /(?:^|[\n•—.;:,])\s*you discard\b/,
    /\beach player discards?\b/,
    /(?:^|[\n•—.;:,])\s*discard (?:a|one|two|three|x|your hand)\b/
  ]);
  if (
    mechanics.has("surveil") ||
    selfDirectedDiscard ||
    matchesAny(oracle, [
      /(?:^|[\n•—.;:,])\s*(?:you )?mill (?:a|one|two|three|four|five|six|seven|eight|nine|ten|x|\d+)\b/,
      /from your library into your graveyard/
    ])
  ) {
    addTheme("graveyard", "enabler", "oracle-rule", "graveyard:stock", "Stocks the graveyard with usable cards.");
  }
  const reusesYourGraveyard =
    keywords.has("flashback") ||
    keywords.has("disturb") ||
    keywords.has("escape") ||
    keywords.has("unearth") ||
    mechanics.has("reanimation") ||
    matchesAny(oracle, [
      /(?:cast|play)[^.]*from your graveyard/,
      /return [^.]*from (?:your|a) graveyard (?:to|onto)/,
      /put [^.]*from (?:your|a) graveyard onto/,
      /in your graveyard,[^.]*return (?:it|this card)/
    ]);
  if (
    reusesYourGraveyard
  ) {
    addTheme("graveyard", "payoff", "oracle-rule", "graveyard:reuse", "Reuses cards from the graveyard.");
  }

  if (
    /exile (?:another|target)[^.]*you control[^.]*return (?:it|that card|that permanent) to the battlefield/.test(oracle) ||
    /exile (?:another|target)[^.]*then return (?:it|that card|that permanent) to the battlefield/.test(oracle)
  ) {
    addTheme("blink-etb", "enabler", "oracle-rule", "blink:effect", "Exiles and returns one of your permanents.");
  }
  if (/when this [a-z]+ enters(?: the battlefield)?/.test(oracle)) {
    addTheme("blink-etb", "payoff", "oracle-rule", "blink:etb", "Has an enter-the-battlefield ability worth reusing.");
  }

  if (typeLine.includes("land") || mechanics.has("ramp")) {
    addTheme("landfall", "enabler", "type-line", "landfall:land", "Supplies land drops or finds additional lands.");
  }
  if (mechanics.has("landfall") || /whenever a land enters/.test(oracle)) {
    addTheme("landfall", "payoff", "oracle-rule", "landfall:payoff", "Rewards lands entering the battlefield.");
  }

  const typeParts = typeLine.split(/\s+[—-]\s+/u);
  const subtypes = (typeParts[1] ?? "").split(/\s+/).filter(Boolean);
  if (typeLine.includes("creature") && subtypes.length > 0) {
    addTheme("typal", "enabler", "type-line", "typal:creature", `Adds a ${subtypes[0]} creature to a typal core.`);
  }
  if (
    typeLine.includes("creature") &&
    matchesAny(oracle, [/other [a-z'-]+s? you control/, /[a-z'-]+ spells you cast/, /choose a creature type/])
  ) {
    addTheme("typal", "payoff", "oracle-rule", "typal:payoff", "Explicitly rewards concentrating on a creature type.");
  }

  if (typeLine.includes("creature") || typeLine.includes("planeswalker") || typeLine.includes("battle")) {
    addRole("threat", "type-line", "role:threat", "Can pressure the opponent or build a board.");
  }
  if (
    mechanics.has("spot-removal") ||
    mechanics.has("counterspell") ||
    mechanics.has("burn") ||
    matchesAny(oracle, [/destroy target/, /exile target/, /counter target spell/, /damage to any target/, /target creature gets -\d/])
  ) {
    addRole("interaction", "oracle-rule", "role:interaction", "Answers an opposing spell or permanent.");
  }
  if (mechanics.has("board-wipe") || /destroy all creatures|exile all creatures|all creatures get -\d/.test(oracle)) {
    addRole("interaction", "oracle-rule", "role:mass-interaction", "Can answer several opposing threats at once.");
  }
  if (
    mechanics.has("card-draw") ||
    mechanics.has("graveyard-recursion") ||
    matchesAny(oracle, [/draw (?:a|two|three|x) cards?/, /exile the top[^.]*you may (?:play|cast)/])
  ) {
    addRole("advantage", "oracle-rule", "role:advantage", "Produces card selection or card advantage.");
  }
  if (mechanics.has("ramp") || mechanics.has("treasure") || /add \{[wubrgc]\}|additional land|treasure token/.test(oracle)) {
    addRole("ramp", "oracle-rule", "role:ramp", "Accelerates or fixes mana.");
  }
  if (
    mechanics.has("graveyard-recursion") ||
    matchesAny(oracle, [/gains? (?:hexproof|indestructible)/, /return target[^.]*from your graveyard/, /phase[s]? out/])
  ) {
    addRole("protection", "oracle-rule", "role:protection", "Protects or recovers important cards.");
  }
  if (
    (card.manaValue >= 5 && (typeLine.includes("creature") || typeLine.includes("planeswalker"))) ||
    /creatures you control get \+\d\/\+\d/.test(oracle)
  ) {
    addRole("finisher", "mana-value", "role:finisher", "Can close a game after the deck develops.");
  }
  if (typeLine.includes("land")) {
    addRole("land", "type-line", "role:land", "Provides a mana-base slot.");
  }

  return {
    themes,
    roles,
    all: [...themes.values(), ...roles.values()].flat()
  };
};

export const getCoachTheme = (slug: CoachThemeSlug) => {
  const theme = COACH_THEMES.find((item) => item.slug === slug);
  if (!theme) {
    throw new Error(`Unknown Coach theme "${slug}".`);
  }
  return theme;
};

export const isColorIdentityWithin = (identity: CoachColor[], allowed: CoachColor[]) =>
  identity.every((color) => allowed.includes(color));

const COLOR_NAMES: Record<CoachColor, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green"
};

export const describeColors = (colors: CoachColor[]) => {
  if (colors.length === 0) {
    return "Colorless";
  }
  return colors.map((color) => COLOR_NAMES[color]).join("–");
};

export const basicLandColor = (typeLine: string): CoachColor | null => {
  const normalized = typeLine.toLowerCase();
  if (normalized.includes("plains")) return "W";
  if (normalized.includes("island")) return "U";
  if (normalized.includes("swamp")) return "B";
  if (normalized.includes("mountain")) return "R";
  if (normalized.includes("forest")) return "G";
  return null;
};
