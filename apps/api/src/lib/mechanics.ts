type DerivedRule = {
  slug: string;
  label: string;
  definition: string;
  test: (card: {
    oracleText: string;
    typeLine: string;
    keywords: string[];
  }) => boolean;
};

const textIncludesAny = (text: string, values: string[]): boolean =>
  values.some((value) => text.includes(value));

const keywordDefinitions: Record<string, string> = {
  flying: "Can only be blocked by creatures with flying or reach.",
  trample: "Excess combat damage can be assigned to the defending player or permanent.",
  vigilance: "Attacking does not cause the creature to tap.",
  haste: "The creature can attack and use tap abilities as soon as it comes under your control.",
  flash: "You can cast the spell any time you could cast an instant.",
  lifelink: "Damage dealt by this source also causes its controller to gain that much life.",
  deathtouch: "Any amount of damage this deals to a creature is enough to destroy it.",
  menace: "The creature can't be blocked except by two or more creatures.",
  reach: "This creature can block creatures with flying.",
  "first-strike": "This creature deals combat damage before creatures without first strike.",
  "double-strike": "This creature deals both first-strike and regular combat damage.",
  ward: "Counter or tax effect that applies unless the opponent pays the ward cost.",
  hexproof: "This permanent can't be the target of spells or abilities your opponents control.",
  indestructible: "Effects that say destroy do not destroy this permanent.",
  defender: "This creature can't attack.",
  scry: "Look at cards from the top of your library, then put any number on the bottom and the rest on top.",
  surveil: "Look at cards from the top of your library, put any number into your graveyard and the rest back on top.",
  mill: "Put cards from the top of a library into a graveyard.",
  equip: "Attach this Equipment to a creature you control for the equip cost at sorcery speed.",
  enchant: "This Aura can only be attached to the type of object named after enchant.",
  cycling: "Pay the cycling cost, discard the card, and draw a card.",
  kicker: "You may pay an additional kicker cost as you cast the spell for a bonus effect.",
  flashback: "You may cast this card from your graveyard for its flashback cost, then exile it.",
  protection: "Prevents damage, enchanting/equipping, blocking, and targeting from the stated quality.",
  treasure: "A Treasure token can be sacrificed for one mana of any color.",
  transform: "This card can turn to its other face when the transform condition is met.",
  convoke: "Your creatures can help cast the spell by tapping for mana or generic costs.",
  prowess: "Gets +1/+1 until end of turn when you cast a noncreature spell.",
  toxic: "Players dealt combat damage by this creature get that many poison counters.",
  infect: "Deals damage to creatures as -1/-1 counters and to players as poison counters.",
  casualty: "You may sacrifice a creature of the stated power as an additional cost to copy the spell.",
  disturb: "You may cast this from your graveyard transformed for its disturb cost.",
  bargain: "You may sacrifice an artifact, enchantment, or token as you cast the spell for an extra effect.",
  descend: "Checks whether cards went to your graveyard from anywhere this turn or how many permanents are there.",
  spree: "Choose one or more additional modes and pay each added cost.",
  offspring: "Pay the offspring cost as you cast to also create a 1/1 token copy.",
  gift: "You may give the stated benefit to an opponent for an additional effect.",
  discover: "Exile cards until you hit a nonland of the stated mana value or less; cast it or put it in hand.",
  disguise: "You may cast this face down as a 2/2 creature, then turn it face up for its disguise cost.",
  plot: "Pay the plot cost to exile the card and cast it later as a sorcery without paying mana."
};

export const derivedMechanicRules: DerivedRule[] = [
  {
    slug: "sacrifice",
    label: "Sacrifice",
    definition: "Cards that ask you to sacrifice permanents or reward sacrifice patterns.",
    test: ({ oracleText }) => oracleText.includes("sacrifice")
  },
  {
    slug: "death-triggers",
    label: "Death Triggers",
    definition: "Cards that trigger when creatures or permanents die.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, ["dies", "whenever another creature dies", "whenever this creature dies"])
  },
  {
    slug: "token-creation",
    label: "Token Creation",
    definition: "Cards that create creature, artifact, or other game-piece tokens.",
    test: ({ oracleText }) => /create .* token/.test(oracleText)
  },
  {
    slug: "token-payoff",
    label: "Token Payoff",
    definition: "Cards that scale with tokens or reward going wide.",
    test: ({ oracleText, typeLine }) =>
      textIncludesAny(oracleText, [
        "for each token",
        "whenever one or more tokens",
        "creatures you control get +",
        "tokens you control"
      ]) || typeLine.includes("anthem")
  },
  {
    slug: "blink",
    label: "Blink",
    definition: "Cards that exile and return permanents to retrigger enter-the-battlefield effects.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "exile another target",
        "return it to the battlefield",
        "return that card to the battlefield",
        "enters, exile"
      ])
  },
  {
    slug: "enter-the-battlefield",
    label: "Enter the Battlefield",
    definition: "Cards with ETB effects or cards that care about creatures entering.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "enters the battlefield",
        "enter the battlefield",
        "whenever another creature enters"
      ])
  },
  {
    slug: "self-mill",
    label: "Self-Mill",
    definition: "Cards that put your own library cards into your graveyard.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "mill ",
        "put the top",
        "from your library into your graveyard"
      ])
  },
  {
    slug: "discard",
    label: "Discard",
    definition: "Cards that make players discard or use discard as a resource.",
    test: ({ oracleText }) => oracleText.includes("discard")
  },
  {
    slug: "discard-payoff",
    label: "Discard Payoff",
    definition: "Cards that reward you for discarding or that turn discard into value.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "whenever you discard",
        "when you discard",
        "if you discarded"
      ])
  },
  {
    slug: "graveyard-recursion",
    label: "Graveyard Recursion",
    definition: "Cards that buy cards back from your graveyard to hand or battlefield.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "return target card from your graveyard",
        "return up to",
        "from your graveyard to your hand",
        "from your graveyard to the battlefield"
      ])
  },
  {
    slug: "reanimation",
    label: "Reanimation",
    definition: "Cards that return creatures directly from graveyards to the battlefield.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "return target creature card from your graveyard to the battlefield",
        "put target creature card from a graveyard onto the battlefield",
        "return each creature card from your graveyard to the battlefield"
      ])
  },
  {
    slug: "graveyard-hate",
    label: "Graveyard Hate",
    definition: "Cards that exile graveyards or shut graveyard-based plans down.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "exile target card from a graveyard",
        "exile all graveyards",
        "cards in graveyards can't",
        "graveyard"
      ]) && textIncludesAny(oracleText, ["exile", "can't"])
  },
  {
    slug: "artifact-matters",
    label: "Artifact Matters",
    definition: "Artifacts and cards that care about artifacts entering, existing, or being cast.",
    test: ({ oracleText, typeLine }) =>
      typeLine.includes("artifact") ||
      textIncludesAny(oracleText, [
        "artifact spell",
        "artifacts you control",
        "whenever an artifact",
        "artifact card"
      ])
  },
  {
    slug: "enchantment-matters",
    label: "Enchantment Matters",
    definition: "Enchantments and cards that reward enchantment-heavy shells.",
    test: ({ oracleText, typeLine }) =>
      typeLine.includes("enchantment") ||
      textIncludesAny(oracleText, [
        "enchantment spell",
        "enchantments you control",
        "whenever an enchantment",
        "enchantment card"
      ])
  },
  {
    slug: "lifegain",
    label: "Lifegain",
    definition: "Cards that gain life directly or repeatedly as part of their game plan.",
    test: ({ oracleText }) => textIncludesAny(oracleText, ["gain life", "you gain "])
  },
  {
    slug: "lifegain-payoff",
    label: "Lifegain Payoff",
    definition: "Cards that reward you for gaining life.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "whenever you gain life",
        "if you gained life",
        "whenever one or more creatures you control gain lifelink"
      ])
  },
  {
    slug: "counters-plus-one",
    label: "+1/+1 Counters",
    definition: "Cards that place or care about +1/+1 counters.",
    test: ({ oracleText }) =>
      oracleText.includes("+1/+1 counter") ||
      oracleText.includes("+1/+1 counters")
  },
  {
    slug: "spellslinger",
    label: "Spellslinger",
    definition: "Cards that reward casting instants, sorceries, or noncreature spells.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "instant or sorcery",
        "whenever you cast a noncreature spell",
        "whenever you cast an instant",
        "whenever you cast a sorcery"
      ])
  },
  {
    slug: "ramp",
    label: "Ramp",
    definition: "Cards that accelerate mana through lands, mana production, or Treasures.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "search your library for a basic land",
        "add {",
        "additional land",
        "treasure token"
      ])
  },
  {
    slug: "card-draw",
    label: "Card Draw",
    definition: "Cards that generate extra cards or repeated card advantage.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "draw a card",
        "draw two cards",
        "draw three cards",
        "draw x cards"
      ])
  },
  {
    slug: "counterspell",
    label: "Counterspell",
    definition: "Cards that counter spells on the stack.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, ["counter target spell", "counter up to one target spell"])
  },
  {
    slug: "burn",
    label: "Burn",
    definition: "Direct damage to opponents, creatures, or planeswalkers.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "deals 1 damage",
        "deals 2 damage",
        "deals 3 damage",
        "any target",
        "each opponent"
      ])
  },
  {
    slug: "spot-removal",
    label: "Spot Removal",
    definition: "Single-target removal for creatures, permanents, or threats.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "destroy target",
        "exile target",
        "target creature gets -",
        "target permanent"
      ])
  },
  {
    slug: "board-wipe",
    label: "Board Wipe",
    definition: "Mass removal that clears many permanents at once.",
    test: ({ oracleText }) =>
      textIncludesAny(oracleText, [
        "destroy all creatures",
        "exile all creatures",
        "all creatures get -",
        "destroy all artifacts",
        "destroy all enchantments"
      ])
  },
  {
    slug: "combat-trick",
    label: "Combat Trick",
    definition: "Usually cheap instants that swing combat with stats, protection, or surprise effects.",
    test: ({ oracleText, typeLine }) =>
      typeLine.includes("instant") &&
      textIncludesAny(oracleText, ["target creature gets +", "target creature gains", "indestructible until end of turn"])
  },
  {
    slug: "landfall",
    label: "Landfall",
    definition: "Cards that trigger or scale when lands enter the battlefield under your control.",
    test: ({ oracleText, keywords }) =>
      oracleText.includes("whenever a land enters the battlefield under your control") ||
      keywords.includes("Landfall")
  }
];

export const getMechanicDefinition = (slug: string, label: string, type: "keyword" | "derived") => {
  if (type === "derived") {
    return derivedMechanicRules.find((rule) => rule.slug === slug)?.definition ?? "Derived gameplay tag.";
  }

  return (
    keywordDefinitions[slug] ??
    `Official MTG keyword mechanic indexed from oracle data: ${label}.`
  );
};

export const buildMechanicTags = (keywords: string[], oracleText: string, typeLine: string) => {
  const normalizedText = oracleText.toLowerCase();
  const normalizedTypeLine = typeLine.toLowerCase();
  const keywordTags = keywords.map((keyword) => {
    const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return {
      slug,
      label: keyword,
      definition: getMechanicDefinition(slug, keyword, "keyword"),
      type: "keyword" as const,
      sourceRule: "scryfall-keywords"
    };
  });

  const derivedTags = derivedMechanicRules
    .filter((rule) =>
      rule.test({
        oracleText: normalizedText,
        typeLine: normalizedTypeLine,
        keywords
      })
    )
    .map((rule) => ({
      slug: rule.slug,
      label: rule.label,
      definition: rule.definition,
      type: "derived" as const,
      sourceRule: `rule:${rule.slug}`
    }));

  const deduped = new Map<string, (typeof keywordTags)[number] | (typeof derivedTags)[number]>();
  for (const tag of [...keywordTags, ...derivedTags]) {
    if (!deduped.has(tag.slug)) {
      deduped.set(tag.slug, tag);
    }
  }

  return [...deduped.values()];
};
