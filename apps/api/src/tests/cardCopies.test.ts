import { describe, expect, it } from "vitest";
import { getDeckBuildingLimit, getOwnedCountView } from "../lib/cardCopies.js";
import { getMechanicDefinition } from "../lib/mechanics.js";

describe("deck copy helpers", () => {
  it("caps normal cards at four playable copies", () => {
    expect(getDeckBuildingLimit("", "Creature — Cat Soldier")).toBe(4);
    expect(getOwnedCountView(16, "", "Creature — Cat Soldier")).toEqual({
      rawOwnedCount: 16,
      playableOwnedCount: 4,
      deckBuildingLimit: 4
    });
  });

  it("leaves unlimited deckbuilding cards uncapped", () => {
    expect(
      getDeckBuildingLimit(
        "A deck can have any number of cards named Hare Apparent.",
        "Creature — Rabbit Noble"
      )
    ).toBeNull();
    expect(
      getOwnedCountView(
        12,
        "A deck can have any number of cards named Hare Apparent.",
        "Creature — Rabbit Noble"
      )
    ).toEqual({
      rawOwnedCount: 12,
      playableOwnedCount: 12,
      deckBuildingLimit: null
    });
  });

  it("returns mechanic definitions for both derived and keyword mechanics", () => {
    expect(getMechanicDefinition("blink", "Blink", "derived")).toContain("exile and return");
    expect(getMechanicDefinition("flying", "Flying", "keyword")).toContain("blocked");
  });
});
