import {
  ARENA_FORMATS,
  DECK_FORMAT_LABELS,
  type ArenaFormat,
  type DeckFormat
} from "../lib/formats.js";
import type { DeckCardInput } from "../lib/types.js";

export type DeckRuleCardEntry = {
  cardId: string;
  quantity: number;
  section: DeckCardInput["section"];
  name: string | null;
  normalizedName?: string | null | undefined;
  oracleText?: string | undefined;
  typeLine?: string | undefined;
  colorIdentity?: readonly string[] | undefined;
  legalities?: Readonly<Record<string, string>> | undefined;
  availableOnArena?: boolean | undefined;
  ownedCount?: number | undefined;
};

export type DeckFormatRule = {
  format: DeckFormat;
  mainDeck: {
    minimum: number | null;
    maximum: number | null;
  };
  sideboardMaximum: number | null;
  commanderCount: number | null;
  defaultCopyLimit: number | null;
  enforceCommanderColorIdentity: boolean;
};

export type DeckRuleIssueCode =
  | "missing_card"
  | "catalog_unavailable"
  | "format_legality"
  | "main_deck_size"
  | "sideboard_size"
  | "commander_count"
  | "commander_eligibility"
  | "commander_color_identity"
  | "copy_limit";

export type DeckRuleIssue = {
  code: DeckRuleIssueCode;
  severity: "error" | "warning";
  message: string;
  cardId?: string | undefined;
  cardName?: string | undefined;
};

export type DeckOwnershipGap = {
  cardId: string;
  name: string;
  needed: number;
  owned: number;
  missing: number;
};

export type DeckRuleValidation = {
  format: DeckFormat;
  counts: {
    main: number;
    sideboard: number;
    commander: number;
    total: number;
  };
  issues: DeckRuleIssue[];
  ownershipGaps: DeckOwnershipGap[];
};

const numberWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
};

const normalizeCardName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

export const isBasicLand = (typeLine: string) => {
  const cardTypes = typeLine.split(/\s+[—-]\s+/u, 1)[0]?.toLowerCase() ?? "";
  return /\bbasic\b/.test(cardTypes) && /\bland\b/.test(cardTypes);
};

const getExplicitCopyLimit = (oracleText: string): number | null | undefined => {
  const normalized = oracleText.toLowerCase();
  if (normalized.includes("a deck can have any number of cards named")) {
    return null;
  }

  const match = normalized.match(
    /a deck can have up to (\d+|[a-z]+) cards named/
  );
  const value = match?.[1];
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return numberWords[value];
};

export const getDeckFormatRule = (format: DeckFormat): DeckFormatRule => {
  if (format === "brawl") {
    return {
      format,
      mainDeck: { minimum: 99, maximum: 99 },
      sideboardMaximum: 0,
      commanderCount: 1,
      defaultCopyLimit: 1,
      enforceCommanderColorIdentity: true
    };
  }

  if (format === "standardbrawl") {
    return {
      format,
      mainDeck: { minimum: 59, maximum: 59 },
      sideboardMaximum: 0,
      commanderCount: 1,
      defaultCopyLimit: 1,
      enforceCommanderColorIdentity: true
    };
  }

  if (format === "limited") {
    return {
      format,
      mainDeck: { minimum: 40, maximum: null },
      sideboardMaximum: null,
      commanderCount: null,
      defaultCopyLimit: null,
      enforceCommanderColorIdentity: false
    };
  }

  if (format === "other") {
    return {
      format,
      mainDeck: { minimum: null, maximum: null },
      sideboardMaximum: null,
      commanderCount: null,
      defaultCopyLimit: null,
      enforceCommanderColorIdentity: false
    };
  }

  return {
    format,
    mainDeck: { minimum: 60, maximum: null },
    sideboardMaximum: 15,
    commanderCount: 0,
    defaultCopyLimit: 4,
    enforceCommanderColorIdentity: false
  };
};

export const getMaxCopiesForCard = (
  format: DeckFormat,
  card: Pick<
    DeckRuleCardEntry,
    "oracleText" | "typeLine" | "legalities"
  >
): number | null => {
  const rule = getDeckFormatRule(format);
  if (rule.defaultCopyLimit === null) {
    return null;
  }
  if (isBasicLand(card.typeLine ?? "")) {
    return null;
  }

  const explicitLimit = getExplicitCopyLimit(card.oracleText ?? "");
  let limit = explicitLimit === undefined ? rule.defaultCopyLimit : explicitLimit;
  if (card.legalities?.[format] === "restricted") {
    limit = limit === null ? 1 : Math.min(limit, 1);
  }
  return limit;
};

export const isBrawlCommanderEligible = (
  card: Pick<DeckRuleCardEntry, "oracleText" | "typeLine">
) => {
  // Transforming and modal cards use the front face for commander eligibility.
  // A legendary creature or planeswalker only on the back face is insufficient.
  const typeLine = ((card.typeLine ?? "").split("//", 1)[0] ?? "").toLowerCase();
  const oracleText = (card.oracleText ?? "").toLowerCase();
  return (
    oracleText.includes("can be your commander") ||
    typeLine.includes("planeswalker") ||
    (typeLine.includes("legendary") && typeLine.includes("creature"))
  );
};

export const isColorIdentitySubset = (
  cardColorIdentity: readonly string[],
  commanderColorIdentity: readonly string[]
) => {
  const allowed = new Set(commanderColorIdentity.map((color) => color.toUpperCase()));
  return cardColorIdentity.every((color) => allowed.has(color.toUpperCase()));
};

const isArenaFormat = (format: DeckFormat): format is ArenaFormat =>
  ARENA_FORMATS.includes(format as ArenaFormat);

const addSizeIssues = (
  validation: DeckRuleValidation,
  rule: DeckFormatRule
) => {
  const label = DECK_FORMAT_LABELS[validation.format];
  const { main, sideboard, commander } = validation.counts;
  const { minimum, maximum } = rule.mainDeck;

  if (minimum !== null && maximum === minimum && main !== minimum) {
    validation.issues.push({
      code: "main_deck_size",
      severity: "error",
      message: `${label} decks should contain ${minimum} cards in the main deck.`
    });
  } else if (minimum !== null && main < minimum) {
    validation.issues.push({
      code: "main_deck_size",
      severity: "error",
      message: `${label} decks should contain at least ${minimum} main-deck cards.`
    });
  } else if (maximum !== null && main > maximum) {
    validation.issues.push({
      code: "main_deck_size",
      severity: "error",
      message: `${label} decks should contain no more than ${maximum} main-deck cards.`
    });
  }

  if (rule.sideboardMaximum !== null && sideboard > rule.sideboardMaximum) {
    validation.issues.push({
      code: "sideboard_size",
      severity: "error",
      message:
        rule.sideboardMaximum === 0
          ? `${label} decks cannot contain a sideboard.`
          : `${label} sideboards cannot contain more than ${rule.sideboardMaximum} cards.`
    });
  }

  if (rule.commanderCount !== null && commander !== rule.commanderCount) {
    validation.issues.push({
      code: "commander_count",
      severity: "error",
      message:
        rule.commanderCount === 0
          ? `${label} decks cannot contain a commander.`
          : `${label} decks should contain exactly ${rule.commanderCount} commander.`
    });
  }
};

export const validateDeckCandidate = (
  format: DeckFormat,
  entries: readonly DeckRuleCardEntry[]
): DeckRuleValidation => {
  const counts = entries.reduce(
    (result, entry) => {
      result[entry.section] += entry.quantity;
      result.total += entry.quantity;
      return result;
    },
    { main: 0, sideboard: 0, commander: 0, total: 0 }
  );
  const validation: DeckRuleValidation = {
    format,
    counts,
    issues: [],
    ownershipGaps: []
  };
  const rule = getDeckFormatRule(format);
  addSizeIssues(validation, rule);

  const seenCardIds = new Set<string>();
  for (const entry of entries) {
    if (!entry.name) {
      if (!seenCardIds.has(entry.cardId)) {
        validation.issues.push({
          code: "missing_card",
          severity: "error",
          cardId: entry.cardId,
          message: `Card "${entry.cardId}" no longer exists in the local catalog.`
        });
        seenCardIds.add(entry.cardId);
      }
      continue;
    }

    if (
      isArenaFormat(format) &&
      entry.availableOnArena === false &&
      !seenCardIds.has(entry.cardId)
    ) {
      validation.issues.push({
        code: "catalog_unavailable",
        severity: "error",
        cardId: entry.cardId,
        cardName: entry.name,
        message: `${entry.name} does not have an Arena printing in the local catalog.`
      });
    }

    if (isArenaFormat(format) && !seenCardIds.has(entry.cardId)) {
      const legality = entry.legalities?.[format] ?? "not_legal";
      if (legality !== "legal" && legality !== "restricted") {
        validation.issues.push({
          code: "format_legality",
          severity: "error",
          cardId: entry.cardId,
          cardName: entry.name,
          message: `${entry.name} is not ${DECK_FORMAT_LABELS[format]}-legal.`
        });
      }
    }
    seenCardIds.add(entry.cardId);
  }

  const copyGroups = new Map<
    string,
    { entry: DeckRuleCardEntry; quantity: number }
  >();
  for (const entry of entries) {
    if (!entry.name) {
      continue;
    }
    const key = entry.normalizedName ?? normalizeCardName(entry.name);
    const group = copyGroups.get(key);
    if (group) {
      group.quantity += entry.quantity;
    } else {
      copyGroups.set(key, { entry, quantity: entry.quantity });
    }
  }
  for (const { entry, quantity } of copyGroups.values()) {
    const limit = getMaxCopiesForCard(format, entry);
    if (limit !== null && quantity > limit) {
      validation.issues.push({
        code: "copy_limit",
        severity: "error",
        cardId: entry.cardId,
        cardName: entry.name ?? undefined,
        message:
          rule.defaultCopyLimit === 1 && limit === 1
            ? `${entry.name} violates the singleton rule.`
            : `${entry.name} exceeds the ${limit}-copy limit.`
      });
    }
  }

  if (rule.commanderCount === 1) {
    const commanderEntry = entries.find(
      (entry) => entry.section === "commander" && entry.name
    );
    if (commanderEntry && !isBrawlCommanderEligible(commanderEntry)) {
      validation.issues.push({
        code: "commander_eligibility",
        severity: "error",
        cardId: commanderEntry.cardId,
        cardName: commanderEntry.name ?? undefined,
        message: `${commanderEntry.name} is not eligible to be a ${DECK_FORMAT_LABELS[format]} commander.`
      });
    }

    if (
      commanderEntry &&
      rule.enforceCommanderColorIdentity &&
      counts.commander === 1
    ) {
      const commanderIdentity = commanderEntry.colorIdentity ?? [];
      const reportedNames = new Set<string>();
      for (const entry of entries) {
        if (
          entry.section !== "main" ||
          !entry.name ||
          isColorIdentitySubset(entry.colorIdentity ?? [], commanderIdentity)
        ) {
          continue;
        }
        const key = entry.normalizedName ?? normalizeCardName(entry.name);
        if (reportedNames.has(key)) {
          continue;
        }
        reportedNames.add(key);
        validation.issues.push({
          code: "commander_color_identity",
          severity: "error",
          cardId: entry.cardId,
          cardName: entry.name,
          message: `${entry.name} falls outside ${commanderEntry.name}'s color identity.`
        });
      }
    }
  }

  const ownershipGroups = new Map<
    string,
    {
      cardId: string;
      name: string;
      needed: number;
      ownedByCardId: Map<string, number>;
    }
  >();
  for (const entry of entries) {
    if (!entry.name || isBasicLand(entry.typeLine ?? "")) {
      continue;
    }
    const key = entry.normalizedName ?? normalizeCardName(entry.name);
    const group = ownershipGroups.get(key) ?? {
      cardId: entry.cardId,
      name: entry.name,
      needed: 0,
      ownedByCardId: new Map<string, number>()
    };
    group.needed += entry.quantity;
    group.ownedByCardId.set(
      entry.cardId,
      Math.max(group.ownedByCardId.get(entry.cardId) ?? 0, entry.ownedCount ?? 0)
    );
    ownershipGroups.set(key, group);
  }
  validation.ownershipGaps = [...ownershipGroups.values()]
    .map((group) => {
      const owned = [...group.ownedByCardId.values()].reduce(
        (total, count) => total + count,
        0
      );
      return {
        cardId: group.cardId,
        name: group.name,
        needed: group.needed,
        owned,
        missing: Math.max(group.needed - owned, 0)
      };
    })
    .filter((gap) => gap.missing > 0);

  return validation;
};
