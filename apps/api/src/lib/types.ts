import type { ArenaFormat } from "./formats.js";

export type CardSummary = {
  id: string;
  name: string;
  oracleText: string;
  manaCost: string | null;
  manaValue: number;
  colors: string[];
  colorIdentity: string[];
  typeLine: string;
  rarity: string;
  preferredSetCode: string | null;
  preferredCollectorNumber: string | null;
  imageUrl: string | null;
  keywords: string[];
  legalities: Record<string, string>;
  ownedCount: number;
  rawOwnedCount: number;
  deckBuildingLimit: number | null;
  mechanics: {
    slug: string;
    label: string;
    type: "keyword" | "derived";
    definition: string;
  }[];
};

export type DeckCardInput = {
  cardId: string;
  quantity: number;
  section: "main" | "sideboard" | "commander";
  cardName?: string | undefined;
  typeLine?: string | undefined;
  ownedCount?: number | undefined;
};

export type DeckRecord = {
  id: string;
  name: string;
  format: ArenaFormat;
  notes: string;
  createdAt: string;
  updatedAt: string;
  cards: DeckCardInput[];
};
