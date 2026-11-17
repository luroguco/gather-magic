import { describe, expect, it } from "vitest";

import {
  coachIdeaEvidenceSchema,
  coachIdeasRequestSchema,
  coachPrototypeRequestSchema,
  coachSynergyClaimSchema
} from "./coach.js";

describe("Coach contracts", () => {
  it("accepts anchor, commander, and skip constraints", () => {
    const parsed = coachIdeasRequestSchema.parse({
      format: "brawl",
      craftBudget: { common: 0, uncommon: 2, rare: 1, mythic: 0 },
      anchorCardId: "anchor",
      commanderCardId: "commander",
      excludedIdeaFingerprints: ["a".repeat(64)]
    });

    expect(parsed.excludedIdeaFingerprints).toEqual(["a".repeat(64)]);
    expect(parsed.excludedConstraintFingerprints).toEqual([]);
  });

  it("accepts source-bound prototype tuning constraints", () => {
    const parsed = coachPrototypeRequestSchema.parse({
      ideaId: "idea",
      format: "standard",
      craftBudget: { common: 0, uncommon: 0, rare: 0, mythic: 0 },
      source: {
        collectionImportId: null,
        collectionImportedAt: null,
        catalogSyncedAt: null,
        featureVersion: "coach-features-v1",
        dataFingerprint: "a".repeat(64),
        constraintFingerprint: "b".repeat(64)
      },
      lockedCards: [{ cardId: "plains", quantity: 1 }],
      excludedCardIds: ["skip-card"]
    });

    expect(parsed.lockedCards).toHaveLength(1);
    expect(parsed.excludedCardIds).toEqual(["skip-card"]);
  });

  it("accepts at most three structured, card-specific synergy claims", () => {
    const claim = coachSynergyClaimSchema.parse({
      kind: "theme-engine",
      enablers: [{ cardId: "token-maker", name: "Token Maker" }],
      payoff: { cardId: "token-payoff", name: "Token Payoff" },
      explanation: "Token Maker creates the tokens that Token Payoff rewards.",
      evidenceRuleIds: ["tokens:create", "tokens:payoff"]
    });
    expect(claim.enablers[0]?.name).toBe("Token Maker");

    const evidence = {
      synergyClaims: [claim, claim, claim, claim],
      ownedThemeCards: 8,
      enablers: 4,
      payoffs: 4,
      summary: claim.explanation,
      features: []
    };
    expect(() => coachIdeaEvidenceSchema.parse(evidence)).toThrow();
    expect(coachIdeaEvidenceSchema.parse({ ...evidence, synergyClaims: [claim] }).synergyClaims).toHaveLength(1);
    expect(() => coachSynergyClaimSchema.parse({
      ...claim,
      enablers: [claim.payoff]
    })).toThrow(/two distinct selected cards/i);
  });
});
