import type {
  CoachCraftBudget,
  CoachIdeaSummary,
  CoachPrototypeResponse,
  CoachSynergyClaim,
  PrototypeConcern,
  ReplacementCandidate,
  SourceFingerprint
} from "@mtga/contracts";

import type { DeckCard } from "../../types";

export type {
  CoachCraftBudget,
  CoachFormat,
  CoachIdeaSummary,
  CoachIdeasRequest,
  CoachIdeasResponse,
  CoachPrototypeRequest,
  CoachPrototypeResponse,
  PrototypeConcern,
  ReplacementCandidate,
  SourceFingerprint
} from "@mtga/contracts";

export type CoachIdeaView = {
  id: string;
  name: string;
  description: string;
  colors: string[];
  plan: string[];
  anchors: string[];
  synergyClaims: CoachSynergyClaim[];
  reasons: string[];
  ownedCopies: number;
  totalCopies: number;
  craftCost: CoachCraftBudget;
  warnings: string[];
  source: CoachIdeaSummary;
};

export type CoachPrototypeCardView = DeckCard & {
  name: string;
  role: string;
  rarity: string;
  ownedCount: number;
  missingCount: number;
  evidence: string[];
};

export type CoachPrototypeView = {
  name: string;
  format: "standard" | "brawl";
  cards: CoachPrototypeCardView[];
  sections: Array<{ label: string; cards: CoachPrototypeCardView[] }>;
  synergyClaims: CoachSynergyClaim[];
  reasons: string[];
  warnings: string[];
  validationIssues: string[];
  isLegal: boolean;
  craftCost: CoachCraftBudget;
  roleCoverage: Array<{
    role: string;
    current: number;
    target: number;
    status: "met" | "thin";
  }>;
  concerns: PrototypeConcern[];
  replacements: ReplacementCandidate[];
  themeDensity: CoachPrototypeResponse["themeDensity"];
  sourceFingerprint: SourceFingerprint;
  source: CoachPrototypeResponse;
};

export const EMPTY_COACH_BUDGET: CoachCraftBudget = {
  common: 0,
  uncommon: 0,
  rare: 0,
  mythic: 0
};
