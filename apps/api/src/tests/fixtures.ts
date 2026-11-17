export const fixtureCards = [
  {
    id: "print-angel",
    oracle_id: "oracle-angel",
    arena_id: 1001,
    name: "Angelic Blink",
    oracle_text: "Flying. Exile another target creature you control, then return that card to the battlefield under its owner's control. Draw a card.",
    mana_cost: "{2}{W}",
    cmc: 3,
    colors: ["W"],
    color_identity: ["W"],
    type_line: "Creature — Angel",
    rarity: "rare",
    layout: "normal",
    keywords: ["Flying"],
    legalities: {
      standard: "legal",
      alchemy: "legal",
      explorer: "legal",
      historic: "legal",
      timeless: "legal",
      brawl: "legal",
      standardbrawl: "legal"
    },
    set: "TST",
    collector_number: "1",
    released_at: "2025-01-01",
    games: ["arena"],
    image_uris: {
      normal: "https://example.com/angel.png"
    }
  },
  {
    id: "print-necromancer",
    oracle_id: "oracle-necromancer",
    arena_id: 1002,
    name: "Grave Whisper",
    oracle_text: "Return target creature card from your graveyard to your hand. Target player discards a card.",
    mana_cost: "{1}{B}",
    cmc: 2,
    colors: ["B"],
    color_identity: ["B"],
    type_line: "Sorcery",
    rarity: "uncommon",
    layout: "normal",
    keywords: [],
    legalities: {
      standard: "legal",
      alchemy: "legal",
      explorer: "legal",
      historic: "legal",
      timeless: "legal",
      brawl: "legal",
      standardbrawl: "legal"
    },
    set: "TST",
    collector_number: "7",
    released_at: "2025-01-01",
    games: ["arena"],
    image_uris: {
      normal: "https://example.com/grave.png"
    }
  },
  {
    id: "print-wrath",
    oracle_id: "oracle-wrath",
    arena_id: 1003,
    name: "Dawnfall",
    oracle_text: "Destroy all creatures.",
    mana_cost: "{2}{W}{W}",
    cmc: 4,
    colors: ["W"],
    color_identity: ["W"],
    type_line: "Sorcery",
    rarity: "rare",
    layout: "normal",
    keywords: [],
    legalities: {
      standard: "not_legal",
      alchemy: "not_legal",
      explorer: "legal",
      historic: "legal",
      timeless: "legal",
      brawl: "legal",
      standardbrawl: "not_legal"
    },
    set: "OLD",
    collector_number: "12",
    released_at: "2024-01-01",
    games: ["arena"],
    image_uris: {
      normal: "https://example.com/wrath.png"
    }
  },
  {
    id: "print-pridemate-a",
    oracle_id: "oracle-pridemate",
    arena_id: 2001,
    name: "Ajani's Pridemate",
    oracle_text: "Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.",
    mana_cost: "{1}{W}",
    cmc: 2,
    colors: ["W"],
    color_identity: ["W"],
    type_line: "Creature — Cat Soldier",
    rarity: "uncommon",
    layout: "normal",
    keywords: [],
    legalities: {
      standard: "legal",
      alchemy: "legal",
      explorer: "legal",
      historic: "legal",
      timeless: "legal",
      brawl: "legal",
      standardbrawl: "legal"
    },
    set: "AAA",
    collector_number: "21",
    released_at: "2025-02-01",
    games: ["arena"],
    image_uris: {
      normal: "https://example.com/pridemate-a.png"
    }
  },
  {
    id: "print-pridemate-b",
    oracle_id: "oracle-pridemate",
    arena_id: 2002,
    name: "Ajani's Pridemate",
    oracle_text: "Whenever you gain life, put a +1/+1 counter on Ajani's Pridemate.",
    mana_cost: "{1}{W}",
    cmc: 2,
    colors: ["W"],
    color_identity: ["W"],
    type_line: "Creature — Cat Soldier",
    rarity: "uncommon",
    layout: "normal",
    keywords: [],
    legalities: {
      standard: "legal",
      alchemy: "legal",
      explorer: "legal",
      historic: "legal",
      timeless: "legal",
      brawl: "legal",
      standardbrawl: "legal"
    },
    set: "BBB",
    collector_number: "8",
    released_at: "2024-05-01",
    games: ["arena"],
    image_uris: {
      normal: "https://example.com/pridemate-b.png"
    }
  }
] as const;

export const validCollectionCsv = `Id,Name,Set,Color,Rarity,Count,PrintCount
1001,"Angelic Blink",TST,White,Rare,2,2
1002,"Grave Whisper",TST,Black,Uncommon,1,1
9999,"Unknown Card",TST,Blue,Rare,1,1
`;

export const duplicateVariantCollectionCsv = `Id,Name,Set,Color,Rarity,Count,PrintCount
2001,"Ajani's Pridemate",AAA,White,Uncommon,4,0
2002,"Ajani's Pridemate",BBB,White,Uncommon,4,4
`;

export const untappedCollectionJson = JSON.stringify(
  {
    1001: 2,
    1002: 1,
    9999: 4
  },
  null,
  2
);

export const collectorSnapshotJson = JSON.stringify(
  {
    snapshotVersion: 1,
    status: "complete",
    capturedAt: "2026-04-03T02:15:00.000Z",
    platform: "darwin",
    collectorVersion: "0.1.0",
    mtgaPid: 11955,
    entryCount: 3,
    totalQuantity: 7,
    diagnostics: {
      source: "runtime-direct",
      warnings: ["attach failed"]
    },
    collection: {
      1001: 2,
      1002: 1,
      9999: 4
    }
  },
  null,
  2
);

export const arenaDeckPlayerLog = [
  "[UnityCrossThreadLogger] <== StartHook(1)",
  JSON.stringify({
    DeckSummaries: [
      {
        DeckId: "arena-custom-standard",
        Name: "Logbook Standard",
        Attributes: [
          { name: "Version", value: "4" },
          { name: "Format", value: "Standard" },
          { name: "LastUpdated", value: JSON.stringify("2026-07-25T15:00:00-04:00") },
          { name: "LastPlayed", value: JSON.stringify("2026-07-26T12:30:00-04:00") },
          { name: "IsFavorite", value: "true" }
        ]
      },
      {
        DeckId: "arena-custom-limited",
        Name: "Draft Keeps",
        Attributes: [
          { name: "Version", value: "2" },
          { name: "Format", value: "DirectGameLimited" },
          { name: "LastUpdated", value: JSON.stringify("2026-07-24T10:00:00-04:00") }
        ]
      },
      {
        DeckId: "arena-starter",
        Name: "?=?Loc/Decks/Precon/CC_ANB_W",
        Attributes: [{ name: "Format", value: "Alchemy" }]
      }
    ],
    Decks: {
      "arena-custom-standard": {
        MainDeck: [
          { cardId: 1001, quantity: 2 },
          { cardId: 9999, quantity: 1 }
        ],
        Sideboard: [{ cardId: 1002, quantity: 1 }],
        CommandZone: [],
        Companions: []
      },
      "arena-custom-limited": {
        MainDeck: [{ cardId: 1002, quantity: 40 }],
        Sideboard: [],
        CommandZone: [],
        Companions: []
      },
      "arena-starter": {
        MainDeck: [{ cardId: 1001, quantity: 60 }],
        Sideboard: [],
        CommandZone: [],
        Companions: []
      }
    }
  }),
  "[UnityCrossThreadLogger] startup complete"
].join("\n");
