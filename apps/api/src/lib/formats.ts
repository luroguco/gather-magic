export const ARENA_FORMATS = [
  "standard",
  "alchemy",
  "explorer",
  "historic",
  "timeless",
  "brawl",
  "standardbrawl"
] as const;

export type ArenaFormat = (typeof ARENA_FORMATS)[number];

export const FORMAT_LABELS: Record<ArenaFormat, string> = {
  standard: "Standard",
  alchemy: "Alchemy",
  explorer: "Explorer",
  historic: "Historic",
  timeless: "Timeless",
  brawl: "Brawl",
  standardbrawl: "Standard Brawl"
};

export const DECK_FORMATS = [...ARENA_FORMATS, "limited", "other"] as const;

export type DeckFormat = (typeof DECK_FORMATS)[number];

export const DECK_FORMAT_LABELS: Record<DeckFormat, string> = {
  ...FORMAT_LABELS,
  limited: "Limited",
  other: "Other / Event"
};

export const BRAWL_FORMATS = new Set<DeckFormat>(["brawl", "standardbrawl"]);
