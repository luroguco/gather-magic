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

export const BRAWL_FORMATS = new Set<ArenaFormat>(["brawl", "standardbrawl"]);
