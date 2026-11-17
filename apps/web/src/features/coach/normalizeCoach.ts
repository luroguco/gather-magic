import type {
  CoachIdeaSummary,
  CoachIdeaView,
  CoachPrototypeCardView,
  CoachPrototypeResponse,
  CoachPrototypeView
} from "./types";

export const normalizeCoachIdea = (idea: CoachIdeaSummary): CoachIdeaView => ({
  id: idea.ideaId,
  name: idea.title,
  description: idea.theme.plan,
  colors: idea.colors,
  plan: [idea.theme.plan],
  anchors: [idea.commander?.name, ...idea.anchors.map((anchor) => anchor.name)].filter(
    (name): name is string => Boolean(name)
  ),
  // Coach sessions are browser-local. Keep older persisted sessions readable while
  // newly generated responses always carry structured synergy claims.
  synergyClaims: idea.evidence.synergyClaims ?? [],
  reasons: [...new Set([idea.whyItAppeared, idea.evidence.summary])],
  ownedCopies: idea.ownership.ownedNonBasicCopies,
  totalCopies: idea.ownership.requiredNonBasicCopies,
  craftCost: idea.craftCost,
  warnings: idea.warnings,
  source: idea
});

const normalizePrototypeCard = (
  card: CoachPrototypeResponse["deck"]["cards"][number]
): CoachPrototypeCardView => ({
  cardId: card.cardId,
  quantity: card.quantity,
  section: card.section,
  name: card.name,
  cardName: card.name,
  typeLine: card.typeLine,
  ...(card.manaCost ? { manaCost: card.manaCost } : {}),
  manaValue: card.manaValue,
  role: card.group,
  rarity: card.rarity,
  ownedCount: card.ownedQuantity,
  missingCount: card.craftQuantity,
  evidence: card.evidence.map((evidence) => evidence.label)
});

export const normalizeCoachPrototype = (
  response: CoachPrototypeResponse
): CoachPrototypeView => {
  const cards = response.deck.cards.map(normalizePrototypeCard);
  const byId = new Map(cards.map((card) => [`${card.cardId}:${card.section}`, card]));

  return {
    name: response.deck.name,
    format: response.deck.format,
    cards,
    sections: response.sections.map((section) => ({
      label: section.label,
      cards: section.cards.map((card) =>
        byId.get(`${card.cardId}:${card.section}`) ?? normalizePrototypeCard(card)
      )
    })),
    synergyClaims: response.idea.evidence.synergyClaims ?? [],
    reasons: [response.idea.whyItAppeared],
    warnings: response.warnings,
    validationIssues: response.validation.issues.map((issue) => issue.message),
    isLegal: response.validation.isLegal,
    craftCost: response.craftCost,
    roleCoverage: response.roleCoverage.map((coverage) => ({
      role: coverage.label,
      current: coverage.count,
      target: coverage.target,
      status: coverage.status
    })),
    concerns: response.concerns.slice(0, 3),
    replacements: response.replacements.slice(0, 3),
    themeDensity: response.themeDensity,
    sourceFingerprint: response.source,
    source: response
  };
};
