import { z } from "zod";

export const COACH_FEATURE_VERSION = "coach-features-v3";
export const COACH_FORMATS = ["standard", "brawl"] as const;
export const COACH_RARITIES = ["common", "uncommon", "rare", "mythic"] as const;
export const COACH_CARD_RARITIES = [...COACH_RARITIES, "unknown"] as const;
export const COACH_COLORS = ["W", "U", "B", "R", "G"] as const;
export const COACH_PROFILES = ["proactive", "value"] as const;
export const COACH_THEME_SLUGS = [
  "tokens",
  "counters",
  "sacrifice",
  "graveyard",
  "blink-etb",
  "lifegain",
  "landfall",
  "typal"
] as const;
export const COACH_CARD_GROUPS = ["core", "support", "interaction", "mana"] as const;

export const coachFormatSchema = z.enum(COACH_FORMATS);
export const coachRaritySchema = z.enum(COACH_RARITIES);
export const coachCardRaritySchema = z.enum(COACH_CARD_RARITIES);
export const coachColorSchema = z.enum(COACH_COLORS);
export const coachProfileSchema = z.enum(COACH_PROFILES);
export const coachThemeSlugSchema = z.enum(COACH_THEME_SLUGS);
export const coachCardGroupSchema = z.enum(COACH_CARD_GROUPS);

export const coachCraftBudgetSchema = z.object({
  common: z.number().int().min(0).max(100),
  uncommon: z.number().int().min(0).max(100),
  rare: z.number().int().min(0).max(100),
  mythic: z.number().int().min(0).max(100)
}).strict();
export const coachCraftCostSchema = coachCraftBudgetSchema;

export const coachSourceFingerprintSchema = z.object({
  collectionImportId: z.string().min(1).max(500).nullable(),
  collectionImportedAt: z.string().datetime().nullable(),
  catalogSyncedAt: z.string().datetime().nullable(),
  featureVersion: z.string().min(1).max(100),
  dataFingerprint: z.string().min(16).max(128),
  constraintFingerprint: z.string().min(16).max(128)
}).strict();

export const coachIdeasRequestSchema = z.object({
  format: coachFormatSchema,
  craftBudget: coachCraftBudgetSchema,
  anchorCardId: z.string().min(1).max(500).optional(),
  commanderCardId: z.string().min(1).max(500).optional(),
  excludedIdeaFingerprints: z.array(z.string().min(16).max(128)).max(100).optional().default([]),
  excludedConstraintFingerprints: z.array(z.string().min(16).max(128)).max(100).optional().default([])
}).strict();

export const coachFeatureEvidenceSchema = z.object({
  featureKind: z.enum(["theme", "role"]),
  featureSlug: z.string().min(1).max(100),
  relation: z.enum(["enabler", "payoff", "support", "none"]),
  source: z.enum(["mechanic", "keyword", "oracle-rule", "type-line", "mana-value"]),
  ruleId: z.string().min(1).max(100),
  label: z.string().min(1).max(300)
}).strict();

export const coachCardRefSchema = z.object({
  cardId: z.string().min(1).max(500),
  name: z.string().min(1).max(500),
  manaCost: z.string().nullable(),
  manaValue: z.number().finite().nonnegative(),
  typeLine: z.string().max(1_000),
  rarity: coachCardRaritySchema,
  imageUrl: z.string().nullable(),
  ownedCount: z.number().int().nonnegative(),
  evidence: z.array(coachFeatureEvidenceSchema).max(50)
}).strict();

export const coachThemeSchema = z.object({
  slug: coachThemeSlugSchema,
  label: z.string().min(1).max(100),
  plan: z.string().min(1).max(500)
}).strict();

export const coachCraftGapSchema = z.object({
  cardId: z.string().min(1).max(500),
  name: z.string().min(1).max(500),
  rarity: coachRaritySchema,
  quantity: z.number().int().positive().max(100)
}).strict();

export const coachSynergyCardSchema = z.object({
  cardId: z.string().min(1).max(500),
  name: z.string().min(1).max(500)
}).strict();

export const coachSynergyClaimSchema = z.object({
  kind: z.enum(["theme-engine", "commander-engine"]),
  enablers: z.array(coachSynergyCardSchema).min(1).max(2),
  payoff: coachSynergyCardSchema,
  explanation: z.string().min(1).max(1_500),
  evidenceRuleIds: z.array(z.string().min(1).max(100)).min(2).max(10)
}).strict().superRefine((claim, context) => {
  if (claim.enablers.some((enabler) => enabler.cardId === claim.payoff.cardId)) {
    context.addIssue({
      code: "custom",
      path: ["enablers"],
      message: "A synergy claim must connect two distinct selected cards."
    });
  }
});

export const coachIdeaEvidenceSchema = z.object({
  synergyClaims: z.array(coachSynergyClaimSchema).min(1).max(3),
  ownedThemeCards: z.number().int().nonnegative(),
  enablers: z.number().int().nonnegative(),
  payoffs: z.number().int().nonnegative(),
  summary: z.string().min(1).max(600),
  features: z.array(coachFeatureEvidenceSchema).max(100)
}).strict();

export const coachIdeaSchema = z.object({
  ideaId: z.string().min(1).max(200),
  ideaFingerprint: z.string().min(16).max(128),
  format: coachFormatSchema,
  title: z.string().min(1).max(200),
  profile: coachProfileSchema,
  theme: coachThemeSchema,
  colors: z.array(coachColorSchema).max(5),
  commander: coachCardRefSchema.nullable(),
  anchors: z.array(coachCardRefSchema).min(1).max(3),
  whyItAppeared: z.string().min(1).max(600),
  evidence: coachIdeaEvidenceSchema,
  ownership: z.object({
    ownedNonBasicCopies: z.number().int().nonnegative(),
    requiredNonBasicCopies: z.number().int().nonnegative(),
    percent: z.number().int().min(0).max(100)
  }).strict(),
  craftCost: coachCraftCostSchema,
  craftGaps: z.array(coachCraftGapSchema).max(500),
  source: coachSourceFingerprintSchema,
  warnings: z.array(z.string().min(1).max(500)).max(20)
}).strict();

export const coachIdeasResponseSchema = z.object({
  source: coachSourceFingerprintSchema,
  generatedAt: z.string().datetime(),
  format: coachFormatSchema,
  ideas: z.array(coachIdeaSchema).max(3),
  diagnostics: z.object({
    ownedLegalCards: z.number().int().nonnegative(),
    candidateIdeas: z.number().int().nonnegative(),
    excludedPlaceholders: z.number().int().nonnegative(),
    message: z.string().min(1).max(1_000).nullable()
  }).strict()
}).strict();

export const coachLockedCardSchema = z.object({
  cardId: z.string().min(1).max(500),
  quantity: z.number().int().positive().max(100).optional()
}).strict();

export const coachPrototypeRequestSchema = z.object({
  ideaId: z.string().min(1).max(200),
  format: coachFormatSchema,
  craftBudget: coachCraftBudgetSchema,
  source: coachSourceFingerprintSchema,
  lockedCards: z.array(coachLockedCardSchema).max(100).optional().default([]),
  excludedCardIds: z.array(z.string().min(1).max(500)).max(500).optional().default([])
}).strict();

export const coachPrototypeCardSchema = z.object({
  cardId: z.string().min(1).max(500),
  name: z.string().min(1).max(500),
  quantity: z.number().int().positive().max(100),
  section: z.enum(["main", "commander"]),
  group: coachCardGroupSchema,
  manaCost: z.string().nullable(),
  manaValue: z.number().finite().nonnegative(),
  typeLine: z.string().max(1_000),
  rarity: coachCardRaritySchema,
  imageUrl: z.string().nullable(),
  ownedQuantity: z.number().int().nonnegative(),
  craftQuantity: z.number().int().nonnegative(),
  evidence: z.array(coachFeatureEvidenceSchema).max(50)
}).strict();

export const coachRoleCoverageSchema = z.object({
  slug: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
  count: z.number().int().nonnegative(),
  target: z.number().int().nonnegative(),
  status: z.enum(["met", "thin"])
}).strict();

export const coachPrototypeSectionSchema = z.object({
  group: coachCardGroupSchema,
  label: z.string().min(1).max(100),
  cards: z.array(coachPrototypeCardSchema).max(500)
}).strict();

export const prototypeConcernSchema = z.object({
  code: z.string().min(1).max(100),
  severity: z.enum(["info", "warning", "blocking"]),
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(600),
  cardIds: z.array(z.string().min(1).max(500)).max(100)
}).strict();

export const replacementCandidateSchema = z.object({
  forCardId: z.string().min(1).max(500).nullable(),
  card: coachCardRefSchema,
  reason: z.string().min(1).max(500),
  craftDelta: coachCraftCostSchema
}).strict();

export const deckRuleIssueSchema = z.object({
  code: z.string().min(1).max(100),
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1).max(500),
  cardId: z.string().min(1).max(500).optional(),
  cardName: z.string().min(1).max(500).optional()
}).strict();
export const coachValidationIssueSchema = deckRuleIssueSchema;

export const coachPrototypeSchema = z.object({
  source: coachSourceFingerprintSchema,
  idea: coachIdeaSchema,
  deck: z.object({
    name: z.string().min(1).max(200),
    format: coachFormatSchema,
    cards: z.array(coachPrototypeCardSchema).min(1).max(500)
  }).strict(),
  sections: z.array(coachPrototypeSectionSchema).max(4),
  craftCost: coachCraftCostSchema,
  craftGaps: z.array(coachCraftGapSchema).max(500),
  roleCoverage: z.array(coachRoleCoverageSchema).max(30),
  themeDensity: z.object({
    count: z.number().int().nonnegative(),
    target: z.number().int().positive(),
    label: z.string().min(1).max(200)
  }).strict().nullable(),
  concerns: z.array(prototypeConcernSchema).max(3),
  replacements: z.array(replacementCandidateSchema).max(3),
  warnings: z.array(z.string().min(1).max(500)).max(20),
  validation: z.object({
    isLegal: z.boolean(),
    counts: z.object({
      main: z.number().int().nonnegative(),
      sideboard: z.number().int().nonnegative(),
      commander: z.number().int().nonnegative(),
      total: z.number().int().nonnegative()
    }).strict(),
    issues: z.array(deckRuleIssueSchema).max(100)
  }).strict()
}).strict();

export const coachPrototypeResponseSchema = coachPrototypeSchema;

export type CoachFormat = z.infer<typeof coachFormatSchema>;
export type CoachRarity = z.infer<typeof coachRaritySchema>;
export type CoachCardRarity = z.infer<typeof coachCardRaritySchema>;
export type CoachColor = z.infer<typeof coachColorSchema>;
export type CoachProfile = z.infer<typeof coachProfileSchema>;
export type CoachThemeSlug = z.infer<typeof coachThemeSlugSchema>;
export type CoachCardGroup = z.infer<typeof coachCardGroupSchema>;
export type CraftBudget = z.infer<typeof coachCraftBudgetSchema>;
export type CoachCraftBudget = CraftBudget;
export type CoachCraftCost = z.infer<typeof coachCraftCostSchema>;
export type SourceFingerprint = z.infer<typeof coachSourceFingerprintSchema>;
export type CoachIdeasRequest = z.infer<typeof coachIdeasRequestSchema>;
export type CoachFeatureEvidence = z.infer<typeof coachFeatureEvidenceSchema>;
export type CoachCardRef = z.infer<typeof coachCardRefSchema>;
export type CoachTheme = z.infer<typeof coachThemeSchema>;
export type CoachCraftGap = z.infer<typeof coachCraftGapSchema>;
export type CoachSynergyCard = z.infer<typeof coachSynergyCardSchema>;
export type CoachSynergyClaim = z.infer<typeof coachSynergyClaimSchema>;
export type CoachIdeaEvidence = z.infer<typeof coachIdeaEvidenceSchema>;
export type CoachIdea = z.infer<typeof coachIdeaSchema>;
export type CoachIdeaSummary = CoachIdea;
export type CoachIdeasResponse = z.infer<typeof coachIdeasResponseSchema>;
export type CoachLockedCard = z.infer<typeof coachLockedCardSchema>;
export type CoachPrototypeRequest = z.infer<typeof coachPrototypeRequestSchema>;
export type CoachPrototypeCard = z.infer<typeof coachPrototypeCardSchema>;
export type CoachRoleCoverage = z.infer<typeof coachRoleCoverageSchema>;
export type CoachPrototypeSection = z.infer<typeof coachPrototypeSectionSchema>;
export type DeckRuleIssue = z.infer<typeof deckRuleIssueSchema>;
export type PrototypeConcern = z.infer<typeof prototypeConcernSchema>;
export type ReplacementCandidate = z.infer<typeof replacementCandidateSchema>;
export type CoachPrototype = z.infer<typeof coachPrototypeSchema>;
export type CoachPrototypeResponse = CoachPrototype;
