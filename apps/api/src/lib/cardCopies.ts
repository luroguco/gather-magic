import { getMaxCopiesForCard } from "../services/deckRules.js";

export const getDeckBuildingLimit = (oracleText: string, typeLine: string): number | null =>
  getMaxCopiesForCard("standard", {
    oracleText,
    typeLine,
    legalities: {}
  });

export const getOwnedCountView = (rawOwnedCount: number, oracleText: string, typeLine: string) => {
  const deckBuildingLimit = getDeckBuildingLimit(oracleText, typeLine);
  return {
    rawOwnedCount,
    playableOwnedCount:
      deckBuildingLimit === null ? rawOwnedCount : Math.min(rawOwnedCount, deckBuildingLimit),
    deckBuildingLimit
  };
};
