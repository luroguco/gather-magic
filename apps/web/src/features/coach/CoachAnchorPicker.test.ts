import { describe, expect, it } from "vitest";

import type { CardSummary } from "../../types";
import { isBrawlCommanderCandidate } from "./CoachAnchorPicker";

const candidate = (typeLine: string, oracleText = "") =>
  ({ typeLine, oracleText } as CardSummary);

describe("Coach Brawl commander picker", () => {
  it("uses only the front face for type-based commander eligibility", () => {
    expect(
      isBrawlCommanderCandidate(
        candidate("Enchantment — Saga // Legendary Creature — Avatar")
      )
    ).toBe(false);
    expect(
      isBrawlCommanderCandidate(
        candidate("Battle — Siege // Legendary Planeswalker — Hero")
      )
    ).toBe(false);
    expect(
      isBrawlCommanderCandidate(
        candidate("Legendary Creature — Human // Enchantment — Saga")
      )
    ).toBe(true);
    expect(
      isBrawlCommanderCandidate(
        candidate("Enchantment — Saga // Legendary Creature — Avatar", "This card can be your commander.")
      )
    ).toBe(true);
  });
});
