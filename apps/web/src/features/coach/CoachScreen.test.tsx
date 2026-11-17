import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CoachIdea,
  CoachIdeasResponse,
  CoachPrototypeResponse,
  SourceFingerprint
} from "@mtga/contracts";

import { ApiError } from "../../api";
import type { AppStatus } from "../../types";
import { CoachScreen } from "./CoachScreen";

const source: SourceFingerprint = {
  collectionImportId: "collection-1",
  collectionImportedAt: "2026-08-17T20:00:00.000Z",
  catalogSyncedAt: "2026-08-17T19:00:00.000Z",
  featureVersion: "coach-features-v2",
  dataFingerprint: "data-fingerprint-123456789",
  constraintFingerprint: "constraint-fingerprint-123456789"
};

const status: AppStatus = {
  collection: {
    ownedEntries: 100,
    uniqueNames: 90,
    uniqueCanonicalCards: 90,
    unresolvedEntries: 0,
    importRowsWithCopies: 100,
    ownedCopies: 240,
    importedAt: source.collectionImportedAt
  },
  cards: { total: 1_000 },
  cardData: {
    source: "test",
    sourceUpdatedAt: source.catalogSyncedAt,
    downloadUri: null,
    syncedAt: source.catalogSyncedAt,
    cardCount: 1_000,
    printCount: 2_000,
    formats: ["standard", "brawl"]
  }
};

const evidence = {
  featureKind: "theme" as const,
  featureSlug: "tokens",
  relation: "payoff" as const,
  source: "mechanic" as const,
  ruleId: "tokens-payoff",
  label: "Rewards creature tokens"
};

const makeIdea = (index: number): CoachIdea => ({
  ideaId: `idea-${index}`,
  ideaFingerprint: `idea-fingerprint-${String(index).padStart(16, "0")}`,
  format: "standard",
  title: `Token idea ${index}`,
  profile: "value",
  theme: {
    slug: "tokens",
    label: "Tokens",
    plan: "Build a wide board, then turn it into card advantage."
  },
  colors: ["W", "G"],
  commander: null,
  anchors: [
    {
      cardId: `anchor-${index}`,
      name: `Anchor ${index}`,
      manaCost: "{1}{W}",
      manaValue: 2,
      typeLine: "Creature",
      rarity: "rare",
      imageUrl: null,
      ownedCount: 4,
      evidence: [evidence]
    }
  ],
  whyItAppeared: "You own the core token engine.",
  evidence: {
    synergyClaims: [
      {
        kind: "theme-engine",
        enablers: [{ cardId: `maker-${index}`, name: `Token Maker ${index}` }],
        payoff: { cardId: `anchor-${index}`, name: `Anchor ${index}` },
        explanation: `Token Maker ${index} builds the board that Anchor ${index} rewards.`,
        evidenceRuleIds: ["tokens:create", "tokens:payoff"]
      }
    ],
    ownedThemeCards: 18,
    enablers: 9,
    payoffs: 6,
    summary: "Owned enablers and payoffs form a complete core.",
    features: [evidence]
  },
  ownership: {
    ownedNonBasicCopies: 34,
    requiredNonBasicCopies: 36,
    percent: 94
  },
  craftCost: { common: 0, uncommon: 0, rare: 2, mythic: 0 },
  craftGaps: [],
  source,
  warnings: []
});

const makeIdeasResponse = (ideas: CoachIdea[]): CoachIdeasResponse => ({
  source,
  generatedAt: "2026-08-17T20:01:00.000Z",
  format: "standard",
  ideas,
  diagnostics: {
    ownedLegalCards: 80,
    candidateIdeas: ideas.length,
    excludedPlaceholders: 0,
    message: null
  }
});

const prototype: CoachPrototypeResponse = {
  source,
  idea: makeIdea(1),
  deck: {
    name: "Selesnya Collection Tokens",
    format: "standard",
    cards: [
      {
        cardId: "anchor-1",
        name: "Anchor 1",
        quantity: 4,
        section: "main",
        group: "core",
        manaCost: "{1}{W}",
        manaValue: 2,
        typeLine: "Creature",
        rarity: "rare",
        imageUrl: null,
        ownedQuantity: 4,
        craftQuantity: 0,
        evidence: [evidence]
      }
    ]
  },
  sections: [
    {
      group: "core",
      label: "Core plan",
      cards: [
        {
          cardId: "anchor-1",
          name: "Anchor 1",
          quantity: 4,
          section: "main",
          group: "core",
          manaCost: "{1}{W}",
          manaValue: 2,
          typeLine: "Creature",
          rarity: "rare",
          imageUrl: null,
          ownedQuantity: 4,
          craftQuantity: 0,
          evidence: [evidence]
        }
      ]
    }
  ],
  craftCost: { common: 0, uncommon: 0, rare: 0, mythic: 0 },
  craftGaps: [],
  roleCoverage: [
    { slug: "interaction", label: "Interaction", count: 8, target: 8, status: "met" }
  ],
  themeDensity: { count: 18, target: 16, label: "18 theme cards" },
  concerns: [],
  replacements: [],
  warnings: [],
  validation: {
    isLegal: true,
    counts: { main: 60, sideboard: 0, commander: 0, total: 60 },
    issues: []
  }
};

describe("CoachScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("requests an exact budget and renders no more than three ideas", async () => {
    const loadIdeas = vi
      .fn()
      .mockResolvedValue(makeIdeasResponse([makeIdea(1), makeIdea(2), makeIdea(3), makeIdea(4)]));

    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={vi.fn().mockResolvedValue("deck-1")}
        loadIdeas={loadIdeas}
        loadPrototype={vi.fn().mockResolvedValue(prototype)}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /owned only/i }));
    fireEvent.change(screen.getByLabelText("Rare wildcard limit"), {
      target: { value: "2" }
    });
    fireEvent.change(screen.getByLabelText("Mythic wildcard limit"), {
      target: { value: "1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Find up to three ideas" }));

    await waitFor(() =>
      expect(loadIdeas).toHaveBeenCalledWith({
        format: "standard",
        craftBudget: { common: 0, uncommon: 0, rare: 2, mythic: 1 },
        excludedIdeaFingerprints: [],
        excludedConstraintFingerprints: []
      })
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByText("Token idea 4")).not.toBeInTheDocument();
    expect(screen.getByText("Token Maker 1 sets up Anchor 1")).toBeInTheDocument();
    expect(
      screen.getByText("Estimated wildcards C 0 · U 0 · R 2 · M 1", { exact: false })
    ).toBeInTheDocument();
  });

  it("re-requests ideas with the skipped fingerprint", async () => {
    const loadIdeas = vi
      .fn()
      .mockResolvedValueOnce(makeIdeasResponse([makeIdea(1), makeIdea(2)]))
      .mockResolvedValueOnce(makeIdeasResponse([makeIdea(2), makeIdea(3)]));

    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={vi.fn().mockResolvedValue("deck-1")}
        loadIdeas={loadIdeas}
        loadPrototype={vi.fn().mockResolvedValue(prototype)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Find up to three ideas" }));
    await screen.findByText("Token idea 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Skip" })[0]!);

    await waitFor(() =>
      expect(loadIdeas).toHaveBeenLastCalledWith(
        expect.objectContaining({
          excludedIdeaFingerprints: [makeIdea(1).ideaFingerprint]
        })
      )
    );
    expect(await screen.findByText("Token idea 3")).toBeInTheDocument();
  });

  it("clears generated ideas when their format or budget inputs change", async () => {
    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={vi.fn().mockResolvedValue("deck-1")}
        loadIdeas={vi.fn().mockResolvedValue(makeIdeasResponse([makeIdea(1)]))}
        loadPrototype={vi.fn().mockResolvedValue(prototype)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Find up to three ideas" }));
    expect(await screen.findByText("Token idea 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /brawl/i }));
    expect(screen.queryByText("Token idea 1")).not.toBeInTheDocument();
  });

  it("discards a persisted pre-synergy Coach session", () => {
    const staleIdea = makeIdea(1);
    delete (staleIdea.evidence as Partial<typeof staleIdea.evidence>).synergyClaims;
    window.localStorage.setItem(
      "mtga.coach-beta.session",
      JSON.stringify({
        ideasResponse: makeIdeasResponse([staleIdea]),
        selectedIdea: staleIdea,
        prototype: null,
        deckName: "",
        constraints: { lockedCards: [], excludedCardIds: [] },
        constraintHistory: [],
        savedDeckId: null
      })
    );

    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={vi.fn().mockResolvedValue("deck-1")}
        loadIdeas={vi.fn().mockResolvedValue(makeIdeasResponse([makeIdea(1)]))}
        loadPrototype={vi.fn().mockResolvedValue(prototype)}
      />
    );

    expect(screen.queryByText("Token idea 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find up to three ideas" })).toBeInTheDocument();
  });

  it("discards persisted explanations from an older feature version", () => {
    const staleIdea = makeIdea(1);
    staleIdea.source = { ...staleIdea.source, featureVersion: "coach-features-v1" };
    window.localStorage.setItem(
      "mtga.coach-beta.session",
      JSON.stringify({
        ideasResponse: makeIdeasResponse([staleIdea]),
        selectedIdea: staleIdea,
        prototype: null,
        deckName: "",
        constraints: { lockedCards: [], excludedCardIds: [] },
        constraintHistory: [],
        savedDeckId: null
      })
    );

    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={vi.fn().mockResolvedValue("deck-1")}
        loadIdeas={vi.fn().mockResolvedValue(makeIdeasResponse([makeIdea(1)]))}
        loadPrototype={vi.fn().mockResolvedValue(prototype)}
      />
    );

    expect(screen.queryByText("Token idea 1")).not.toBeInTheDocument();
  });

  it("reviews, saves locally, then updates and opens the same deck", async () => {
    const onSave = vi.fn().mockResolvedValue("deck-1");
    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={onSave}
        loadIdeas={vi.fn().mockResolvedValue(makeIdeasResponse([makeIdea(1)]))}
        loadPrototype={vi.fn().mockResolvedValue(prototype)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Find up to three ideas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review draft" }));
    expect(await screen.findByRole("heading", { name: "Prototype" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use this draft" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "Selesnya Collection Tokens" }),
        { deckId: null, openEditor: false }
      )
    );
    expect(await screen.findByText("Saved Selesnya Collection Tokens to Decks.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save and edit" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenLastCalledWith(expect.any(Object), {
        deckId: "deck-1",
        openEditor: true
      })
    );
  });

  it("keeps an explicitly selected Standard anchor out of tuning removals", async () => {
    window.localStorage.setItem(
      "mtga.coach-beta.preferences",
      JSON.stringify({
        format: "standard",
        ownedOnly: true,
        budget: { common: 0, uncommon: 0, rare: 0, mythic: 0 },
        brawlAnchorMode: "suggest",
        anchor: { cardId: "anchor-1", name: "Anchor 1" },
        excludedIdeaFingerprints: [],
        constraints: { lockedCards: [], excludedCardIds: [] },
        constraintHistory: []
      })
    );
    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={vi.fn().mockResolvedValue("deck-1")}
        loadIdeas={vi.fn().mockResolvedValue(makeIdeasResponse([makeIdea(1)]))}
        loadPrototype={vi.fn().mockResolvedValue(prototype)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Find up to three ideas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review draft" }));
    fireEvent.click(await screen.findByRole("button", { name: "Tune this deck" }));

    expect(screen.getByRole("button", { name: "Required anchor" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kept in draft" })).toBeDisabled();
  });

  it("refreshes ideas after a stale prototype response", async () => {
    const loadIdeas = vi.fn().mockResolvedValue(makeIdeasResponse([makeIdea(1)]));
    render(
      <CoachScreen
        status={status}
        onOpenCollection={vi.fn()}
        onSave={vi.fn().mockResolvedValue("deck-1")}
        loadIdeas={loadIdeas}
        loadPrototype={vi
          .fn()
          .mockRejectedValue(new ApiError("Source changed", 409, "SOURCE_CHANGED"))}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Find up to three ideas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review draft" }));

    expect(
      await screen.findByText(/collection or catalog changed, so Coach refreshed/i)
    ).toBeInTheDocument();
    expect(loadIdeas).toHaveBeenCalledTimes(2);
  });
});
