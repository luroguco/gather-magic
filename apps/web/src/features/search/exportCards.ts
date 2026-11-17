import type { CardSummary } from "../../types";

const SEARCH_EXPORT_COLUMNS = [
  "Name",
  "Mana Cost",
  "Mana Value",
  "Type",
  "Rarity",
  "Set",
  "Collector Number",
  "Playable Owned",
  "Raw Owned",
  "Deck Limit",
  "Colors",
  "Color Identity",
  "Mechanics",
  "Keywords",
  "Oracle Text"
] as const;

const csvValue = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildCardSearchCsv = (cards: CardSummary[]) => {
  const rows = cards.map((card) => [
    card.name,
    card.manaCost ?? "",
    card.manaValue,
    card.typeLine,
    card.rarity,
    card.preferredSetCode ?? "",
    card.preferredCollectorNumber ?? "",
    card.ownedCount,
    card.rawOwnedCount,
    card.deckBuildingLimit === null ? "Unlimited" : card.deckBuildingLimit,
    card.colors.join(""),
    card.colorIdentity.join(""),
    card.mechanics.map((mechanic) => mechanic.label).join("; "),
    card.keywords.join("; "),
    card.oracleText
  ]);

  return [SEARCH_EXPORT_COLUMNS, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
};

export const downloadCsvFile = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
