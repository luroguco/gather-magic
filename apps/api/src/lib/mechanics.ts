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
  flying: "A creature with flying can be blocked only by creatures with flying or reach.",
  trample:
    "This creature can deal excess combat damage to the player or permanent it is attacking.",
  vigilance: "Attacking doesn't cause this creature to tap.",
  haste:
    "This creature isn't affected by summoning sickness. It can attack and use tap abilities as soon as it comes under your control.",
  flash: "You may cast this spell any time you could cast an instant.",
  lifelink: "Damage dealt by a source with lifelink also causes its controller to gain that much life.",
  deathtouch:
    "Any nonzero amount of combat damage this deals to a creature is enough to destroy it.",
  menace: "This creature can't be blocked except by two or more creatures.",
  reach: "This creature can block creatures with flying.",
  "first-strike":
    "This creature deals combat damage before creatures without first strike or double strike.",
  "double-strike": "This creature deals both first-strike and regular combat damage.",
  ward:
    "Whenever this permanent becomes the target of a spell or ability an opponent controls, counter that spell or ability unless that player pays the ward cost.",
  hexproof:
    "This permanent or player can't be the target of spells or abilities opponents control.",
  indestructible:
    "This permanent can't be destroyed by damage or by effects that say 'destroy.'",
  defender: "This creature can't attack.",
  scry:
    "Look at the stated number of cards from the top of your library. Put any number on the bottom and the rest on top in any order.",
  surveil:
    "Look at the stated number of cards from the top of your library. Put any number into your graveyard and the rest back on top in any order.",
  mill: "Put that many cards from the top of a library into its owner's graveyard.",
  equip:
    "Attach this Equipment to target creature you control. Equip only as a sorcery.",
  enchant:
    "An Aura with enchant can be attached only to the kind of object named after enchant.",
  cycling: "Pay the cycling cost, discard this card, and draw a card.",
  kicker:
    "You may pay an additional kicker cost as you cast this spell for an added effect.",
  flashback:
    "You may cast this card from your graveyard by paying its flashback cost. If you do, exile it instead of putting it anywhere else any time it would leave the stack.",
  protection:
    "Protection from a quality means it can't be damaged, enchanted or equipped, blocked, or targeted by anything with that quality.",
  treasure:
    "Treasure is an artifact token with '{T}, Sacrifice this artifact: Add one mana of any color.'",
  transform: "A transforming permanent can turn to its other face when an effect or ability instructs it to transform.",
  convoke:
    "Your creatures can help cast this spell. Each creature you tap while casting it pays for {1} or one mana of that creature's color.",
  prowess:
    "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.",
  toxic:
    "Combat damage dealt to a player by this creature causes that many poison counters, in addition to the damage's other results.",
  infect:
    "Damage dealt to players by this source is dealt as poison counters, and damage dealt to creatures by this source is dealt as -1/-1 counters.",
  casualty:
    "As an additional cost to cast this spell, you may sacrifice a creature with the stated power or greater. When you cast it, if that casualty cost was paid, copy it.",
  disturb:
    "You may cast this double-faced card transformed from your graveyard by paying its disturb cost rather than its mana cost.",
  bargain:
    "As an additional cost to cast this spell, you may sacrifice an artifact, enchantment, or token.",
  descend:
    "Descend is an ability word that checks whether cards were put into your graveyard this turn or how many permanents are in your graveyard.",
  spree: "Choose one or more additional modes and pay each mode's additional cost.",
  offspring:
    "You may pay the offspring cost as you cast this spell. If you do, when this permanent enters, create a 1/1 token copy of it if it's a creature.",
  gift:
    "You may promise the stated gift to an opponent as you cast this spell. If you do, that player gets the stated benefit and the spell gains the listed bonus effect.",
  discover:
    "Exile cards from the top of your library until you exile a nonland card with the stated mana value or less. You may cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.",
  disguise:
    "You may cast this card face down as a 2/2 creature with ward {2} for {3}, then turn it face up for its disguise cost.",
  plot:
    "You may pay the plot cost and exile this card as a sorcery. On a later turn, you may cast it from exile as a sorcery without paying its mana cost."
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
