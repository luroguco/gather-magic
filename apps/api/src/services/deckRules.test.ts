import { describe, expect, it } from "vitest";

import { mapArenaFormat } from "./arenaDeckSync.js";
import {
  getDeckFormatRule,
  getMaxCopiesForCard,
  isBrawlCommanderEligible,
  isColorIdentitySubset,
  validateDeckCandidate,
  type DeckRuleCardEntry
} from "./deckRules.js";

const card = (
  overrides: Partial<DeckRuleCardEntry> = {}
): DeckRuleCardEntry => ({
  cardId: "card-1",
  quantity: 1,
  section: "main",
  name: "Test Card",
  normalizedName: "test card",
  oracleText: "",
  typeLine: "Creature — Human",
  colorIdentity: [],
  legalities: {
    standard: "legal",
    brawl: "legal",
    standardbrawl: "legal"
  },
  ownedCount: 4,
  ...overrides
});

describe("deck format rules", () => {
  it("keeps current Brawl and legacy Standard Brawl sizes distinct", () => {
    expect(getDeckFormatRule("brawl")).toMatchObject({
      mainDeck: { minimum: 99, maximum: 99 },
      sideboardMaximum: 0,
      commanderCount: 1,
      defaultCopyLimit: 1
    });
    expect(getDeckFormatRule("standardbrawl")).toMatchObject({
      mainDeck: { minimum: 59, maximum: 59 },
      commanderCount: 1
    });
  });

  it("maps Arena's current Brawl label without changing explicit Standard Brawl", () => {
    expect(mapArenaFormat("Brawl")).toBe("brawl");
    expect(mapArenaFormat("HistoricBrawlWithAllowList_20260210_MWM")).toBe(
      "brawl"
    );
    expect(mapArenaFormat("StandardBrawl")).toBe("standardbrawl");
  });
});

describe("format-aware copy limits", () => {
  it("uses four copies in Standard and singleton in Brawl", () => {
    expect(getMaxCopiesForCard("standard", card())).toBe(4);
    expect(getMaxCopiesForCard("brawl", card())).toBe(1);
  });

  it("honors basic lands, named exceptions, and restricted cards", () => {
    expect(
      getMaxCopiesForCard(
        "brawl",
        card({ typeLine: "Basic Snow Land — Plains" })
      )
    ).toBeNull();
    expect(
      getMaxCopiesForCard(
        "brawl",
        card({
          oracleText: "A deck can have up to seven cards named Seven Dwarves."
        })
      )
    ).toBe(7);
    expect(
      getMaxCopiesForCard(
        "standard",
        card({
          oracleText: "A deck can have any number of cards named Relentless Rats."
        })
      )
    ).toBeNull();
    expect(
      getMaxCopiesForCard(
        "standard",
        card({ legalities: { standard: "restricted" } })
      )
    ).toBe(1);
  });

  it("aggregates the copy limit across main deck and sideboard", () => {
    const validation = validateDeckCandidate("standard", [
      card({ quantity: 3, section: "main" }),
      card({ quantity: 2, section: "sideboard" })
    ]);

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "copy_limit",
          severity: "error",
          cardName: "Test Card"
        })
      ])
    );
  });
});

describe("Arena catalog availability", () => {
  it("rejects a format-legal row without an Arena printing", () => {
    const validation = validateDeckCandidate("standard", [
      card({ availableOnArena: false })
    ]);

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "catalog_unavailable",
          cardName: "Test Card"
        })
      ])
    );
  });
});

describe("Brawl commander rules", () => {
  const commander = card({
    cardId: "commander",
    section: "commander",
    name: "White Leader",
    normalizedName: "white leader",
    typeLine: "Legendary Creature — Human",
    colorIdentity: ["W"],
    ownedCount: 1
  });
  const plains = card({
    cardId: "plains",
    quantity: 99,
    name: "Snow-Covered Plains",
    normalizedName: "snow-covered plains",
    typeLine: "Basic Snow Land — Plains",
    colorIdentity: ["W"],
    ownedCount: 0
  });

  it("accepts a legal 99 plus one deck and treats basic lands as unlimited", () => {
    const validation = validateDeckCandidate("brawl", [commander, plains]);

    expect(validation.counts).toEqual({
      main: 99,
      sideboard: 0,
      commander: 1,
      total: 100
    });
    expect(validation.issues).toEqual([]);
    expect(validation.ownershipGaps).toEqual([]);
  });

  it("rejects ineligible commanders and cards outside color identity", () => {
    const redCard = card({
      cardId: "red-card",
      name: "Red Card",
      normalizedName: "red card",
      colorIdentity: ["R"],
      ownedCount: 1
    });
    const validation = validateDeckCandidate("brawl", [
      { ...commander, typeLine: "Artifact" },
      { ...plains, quantity: 98 },
      redCard
    ]);

    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "commander_eligibility",
        "commander_color_identity"
      ])
    );
  });

  it("does not treat a legendary back face as an eligible commander", () => {
    const validation = validateDeckCandidate("brawl", [
      {
        ...commander,
        name: "The Legend of a Hero // Hero Awakened",
        typeLine: "Enchantment — Saga // Legendary Creature — Avatar"
      },
      plains
    ]);

    expect(validation.issues.map((issue) => issue.code)).toContain(
      "commander_eligibility"
    );
  });

  it("allows only documented commander shapes and explicit card permission", () => {
    expect(isBrawlCommanderEligible(commander)).toBe(true);
    expect(
      isBrawlCommanderEligible(card({ typeLine: "Legendary Planeswalker — Test" }))
    ).toBe(true);
    expect(
      isBrawlCommanderEligible(
        card({
          typeLine: "Artifact",
          oracleText: "This card can be your commander."
        })
      )
    ).toBe(true);
    expect(isBrawlCommanderEligible(card({ typeLine: "Artifact — Vehicle" }))).toBe(
      false
    );
    expect(
      isBrawlCommanderEligible(
        card({ typeLine: "Enchantment — Saga // Legendary Creature — Avatar" })
      )
    ).toBe(false);
    expect(
      isBrawlCommanderEligible(
        card({ typeLine: "Battle — Siege // Legendary Planeswalker — Hero" })
      )
    ).toBe(false);
    expect(
      isBrawlCommanderEligible(
        card({ typeLine: "Legendary Creature — Human // Enchantment — Saga" })
      )
    ).toBe(true);
    expect(isColorIdentitySubset(["W"], ["W", "U"])).toBe(true);
    expect(isColorIdentitySubset(["R"], ["W", "U"])).toBe(false);
  });
});

describe("ownership gaps", () => {
  it("aggregates requirements across sections without counting ownership twice", () => {
    const validation = validateDeckCandidate("standard", [
      card({ quantity: 2, section: "main", ownedCount: 3 }),
      card({ quantity: 2, section: "sideboard", ownedCount: 3 })
    ]);

    expect(validation.ownershipGaps).toEqual([
      {
        cardId: "card-1",
        name: "Test Card",
        needed: 4,
        owned: 3,
        missing: 1
      }
    ]);
  });
});
