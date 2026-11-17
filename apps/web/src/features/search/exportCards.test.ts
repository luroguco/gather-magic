import { describe, expect, it } from "vitest";

import type { CardSummary } from "../../types";
import { buildCardSearchCsv } from "./exportCards";

const baseCard: CardSummary = {
  id: "card-1",
  name: "Sample Card",
  oracleText: "Draw a card.",
  manaCost: "{1}{U}",
  manaValue: 2,
  colors: ["U"],
  colorIdentity: ["U"],
  typeLine: "Creature - Wizard",
  rarity: "rare",
  preferredSetCode: "TST",
  preferredCollectorNumber: "42",
  imageUrl: null,
  keywords: [],
  legalities: {},
  ownedCount: 2,
  rawOwnedCount: 3,
  deckBuildingLimit: 4,
  mechanics: []
};

describe("buildCardSearchCsv", () => {
  it("exports card search rows with CSV escaping", () => {
    const csv = buildCardSearchCsv([
      {
        ...baseCard,
        name: 'A-Carnelian Orb, "Bright"',
        oracleText: "Choose one,\nthen draw a card.",
        keywords: ["Flying", "Ward"],
        mechanics: [
          {
            slug: "card-draw",
            label: "Card Draw",
            type: "derived",
            definition: "Draws cards."
          }
        ]
      }
    ]);

    expect(csv).toContain("Name,Mana Cost,Mana Value,Type");
    expect(csv).toContain('"A-Carnelian Orb, ""Bright"""');
    expect(csv).toContain('"Choose one,\nthen draw a card."');
    expect(csv).toContain("Card Draw,Flying; Ward");
  });

  it("marks uncapped deck limits as unlimited", () => {
    const csv = buildCardSearchCsv([
      {
        ...baseCard,
        deckBuildingLimit: null
      }
    ]);

    expect(csv).toContain(",Unlimited,");
  });
});
