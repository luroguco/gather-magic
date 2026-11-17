import { afterEach, describe, expect, it } from "vitest";

import type { CoachFormat, CoachRarity } from "@mtga/contracts";
import Fastify from "fastify";
import { createDatabase, type DbHandle } from "../lib/database.js";
import { registerCoachRoutes } from "../modules/coach/routes.js";
import {
  CoachServiceError,
  getCoachIdeas,
  getCoachPrototype
} from "./coachService.js";

const databases: DbHandle[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const makeDatabase = () => {
  const db = createDatabase(":memory:");
  databases.push(db);
  db.prepare(`
    INSERT INTO collection_imports (
      id, source, imported_at, metadata_json, card_entries, owned_copies, raw_owned_copies
    ) VALUES ('import-1', 'test', '2026-01-01T00:00:00.000Z', '{}', 0, 0, 0)
  `).run();
  db.prepare(`
    INSERT INTO card_data_syncs (
      source, source_updated_at, download_uri, synced_at, card_count, print_count
    ) VALUES ('test', NULL, NULL, '2026-01-01T00:00:00.000Z', 0, 0)
  `).run();
  return db;
};

let nextArenaId = 50_000;

const insertCard = (
  db: DbHandle,
  input: {
    id: string;
    name: string;
    oracleText: string;
    typeLine: string;
    colorIdentity?: string[];
    producedMana?: string[];
    rarity?: CoachRarity;
    owned?: number;
    formats: CoachFormat[];
    manaValue?: number;
  }
) => {
  const rarity = input.rarity ?? "common";
  const normalizedName = input.name.toLowerCase();
  const legalities = Object.fromEntries(input.formats.map((format) => [format, "legal"]));
  db.prepare(`
    INSERT INTO cards (
      id, oracle_id, name, normalized_name, oracle_text, mana_cost, mana_value,
      colors_json, color_identity_json, produced_mana_json, type_line, rarity,
      layout, keywords_json, legalities_json
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, '[]', ?, ?, ?, ?, 'normal', '[]', ?)
  `).run(
    input.id,
    input.id,
    input.name,
    normalizedName,
    input.oracleText,
    input.manaValue ?? 2,
    JSON.stringify(input.colorIdentity ?? ["W"]),
    JSON.stringify(input.producedMana ?? []),
    input.typeLine,
    rarity,
    JSON.stringify(legalities)
  );
  db.prepare(`
    INSERT INTO card_prints (
      print_id, card_id, arena_id, set_code, collector_number, rarity,
      games_json, image_url, released_at
    ) VALUES (?, ?, ?, 'TST', '1', ?, '["arena"]', NULL, '2026-01-01')
  `).run(`print-${input.id}`, input.id, nextArenaId++, rarity);
  if ((input.owned ?? 0) > 0) {
    db.prepare(`
      INSERT INTO collection_cards (
        card_id, count, print_count, source_rows_json, imported_at
      ) VALUES (?, ?, ?, '[]', '2026-01-01T00:00:00.000Z')
    `).run(input.id, input.owned, input.owned);
  }
};

const seedStandardTokens = (db: DbHandle) => {
  for (let index = 0; index < 5; index += 1) {
    insertCard(db, {
      id: `token-maker-${index}`,
      name: `Token Maker ${index}`,
      oracleText: "Create a 1/1 white Soldier creature token.",
      typeLine: "Sorcery",
      owned: 4,
      formats: ["standard"]
    });
  }
  for (let index = 0; index < 4; index += 1) {
    insertCard(db, {
      id: `token-payoff-${index}`,
      name: `Token Payoff ${index}`,
      oracleText: "Tokens you control get +1/+1.",
      typeLine: "Creature — Soldier",
      owned: 4,
      formats: ["standard"]
    });
  }
  for (let index = 0; index < 3; index += 1) {
    insertCard(db, {
      id: `removal-${index}`,
      name: `Removal ${index}`,
      oracleText: "Destroy target creature.",
      typeLine: "Instant",
      owned: 4,
      formats: ["standard"]
    });
  }
  for (let index = 0; index < 2; index += 1) {
    insertCard(db, {
      id: `generic-threat-${index}`,
      name: `Generic Threat ${index}`,
      oracleText: "Vigilance",
      typeLine: "Creature — Human",
      owned: 4,
      formats: ["standard"]
    });
  }
  insertCard(db, {
    id: "draw-spell",
    name: "Draw Spell",
    oracleText: "Draw two cards.",
    typeLine: "Sorcery",
    owned: 4,
    formats: ["standard"]
  });
  insertCard(db, {
    id: "rare-draw-spell",
    name: "Rare Draw Spell",
    oracleText: "Draw two cards.",
    typeLine: "Sorcery",
    rarity: "rare",
    owned: 0,
    formats: ["standard"]
  });
  insertCard(db, {
    id: "plains",
    name: "Plains",
    oracleText: "",
    typeLine: "Basic Land — Plains",
    producedMana: ["W"],
    owned: 0,
    formats: ["standard"]
  });
};

const seedStandardGraveyard = (db: DbHandle) => {
  for (let index = 0; index < 3; index += 1) {
    insertCard(db, {
      id: `mill-${index}`,
      name: `Mill ${index}`,
      oracleText: "Mill 3 cards.",
      typeLine: "Sorcery",
      colorIdentity: ["B"],
      owned: 4,
      formats: ["standard"]
    });
    insertCard(db, {
      id: `recursion-${index}`,
      name: `Recursion ${index}`,
      oracleText: "Return target card from your graveyard to your hand.",
      typeLine: "Creature — Spirit",
      colorIdentity: ["B"],
      owned: 4,
      formats: ["standard"]
    });
  }
  for (let index = 0; index < 2; index += 1) {
    insertCard(db, {
      id: `grave-removal-${index}`,
      name: `Grave Removal ${index}`,
      oracleText: "Destroy target creature.",
      typeLine: "Instant",
      colorIdentity: ["B"],
      owned: 4,
      formats: ["standard"]
    });
    insertCard(db, {
      id: `grave-draw-${index}`,
      name: `Grave Draw ${index}`,
      oracleText: "Draw two cards.",
      typeLine: "Sorcery",
      colorIdentity: ["B"],
      owned: 4,
      formats: ["standard"]
    });
  }
  insertCard(db, {
    id: "grave-swamp",
    name: "Swamp",
    oracleText: "",
    typeLine: "Basic Land — Swamp",
    colorIdentity: ["B"],
    producedMana: ["B"],
    owned: 0,
    formats: ["standard"]
  });
};

const seedBrawlTokens = (db: DbHandle) => {
  insertCard(db, {
    id: "token-commander",
    name: "Token Commander",
    oracleText: "Whenever one or more tokens enter under your control, draw a card.",
    typeLine: "Legendary Creature — Soldier",
    rarity: "rare",
    owned: 1,
    formats: ["brawl"]
  });
  for (let index = 0; index < 29; index += 1) {
    insertCard(db, {
      id: `brawl-token-${index}`,
      name: `Brawl Token Maker ${index}`,
      oracleText: "Create a 1/1 white Soldier creature token.",
      typeLine: "Sorcery",
      owned: 1,
      formats: ["brawl"]
    });
  }
  insertCard(db, {
    id: "brawl-token-payoff",
    name: "Brawl Token Payoff",
    oracleText: "Tokens you control get +1/+1.",
    typeLine: "Creature — Soldier",
    owned: 1,
    formats: ["brawl"]
  });
  for (let index = 0; index < 10; index += 1) {
    insertCard(db, {
      id: `brawl-ramp-${index}`,
      name: `Brawl Ramp ${index}`,
      oracleText: "Add {W}.",
      typeLine: "Artifact",
      owned: 1,
      formats: ["brawl"]
    });
    insertCard(db, {
      id: `brawl-removal-${index}`,
      name: `Brawl Removal ${index}`,
      oracleText: "Exile target creature.",
      typeLine: "Instant",
      owned: 1,
      formats: ["brawl"]
    });
  }
  for (let index = 0; index < 8; index += 1) {
    insertCard(db, {
      id: `brawl-draw-${index}`,
      name: `Brawl Draw ${index}`,
      oracleText: "Draw two cards.",
      typeLine: "Sorcery",
      owned: 1,
      formats: ["brawl"]
    });
  }
  for (let index = 0; index < 3; index += 1) {
    insertCard(db, {
      id: `brawl-protection-${index}`,
      name: `Brawl Protection ${index}`,
      oracleText: "Target creature gains indestructible until end of turn.",
      typeLine: "Instant",
      owned: 1,
      formats: ["brawl"]
    });
  }
  insertCard(db, {
    id: "brawl-plains",
    name: "Plains",
    oracleText: "",
    typeLine: "Basic Land — Plains",
    producedMana: ["W"],
    owned: 0,
    formats: ["brawl"]
  });
};

const seedBrawlThinBlink = (db: DbHandle) => {
  insertCard(db, {
    id: "blink-commander",
    name: "Blink Commander",
    oracleText: "When this creature enters, draw a card.",
    typeLine: "Legendary Creature — Wizard",
    owned: 1,
    formats: ["brawl"],
    colorIdentity: ["U"]
  });
  for (let index = 0; index < 5; index += 1) {
    insertCard(db, {
      id: `blink-effect-${index}`,
      name: `Blink Effect ${index}`,
      oracleText: "Exile target creature you control, then return that card to the battlefield under its owner's control.",
      typeLine: "Instant",
      owned: 1,
      formats: ["brawl"],
      colorIdentity: ["U"]
    });
  }
  for (let index = 0; index < 25; index += 1) {
    insertCard(db, {
      id: `etb-payoff-${index}`,
      name: `ETB Payoff ${index}`,
      oracleText: "When this creature enters, draw a card.",
      typeLine: "Creature — Wizard",
      owned: 1,
      formats: ["brawl"],
      colorIdentity: ["U"]
    });
  }
};

const zeroBudget = { common: 0, uncommon: 0, rare: 0, mythic: 0 } as const;

describe("Coach service", () => {
  it("builds a source-bound exact Standard prototype and supports Skip", () => {
    const db = makeDatabase();
    seedStandardTokens(db);
    const request = {
      format: "standard" as const,
      craftBudget: zeroBudget,
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    };
    const ideas = getCoachIdeas(db, request);
    const idea = ideas.ideas[0];
    if (ideas.ideas.length < 3) {
      expect(ideas.diagnostics.message).toMatch(/did not pad/i);
    }
    expect(idea?.theme.slug).toBe("tokens");
    expect(idea?.anchors.some((anchor) => anchor.evidence.some((item) => item.relation === "enabler"))).toBe(true);
    expect(idea?.anchors.some((anchor) => anchor.evidence.some((item) => item.relation === "payoff"))).toBe(true);

    const prototype = getCoachPrototype(db, {
      ideaId: idea!.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea!.source,
      lockedCards: [{ cardId: "plains", quantity: 1 }],
      excludedCardIds: []
    });
    expect(prototype.validation).toMatchObject({ isLegal: true, counts: { main: 60, commander: 0 } });
    expect(prototype.roleCoverage.map((role) => role.count)).toEqual([16, 12, 6, 3, 23]);
    expect(prototype.replacements.length).toBeLessThanOrEqual(3);
    expect(prototype.replacements.every((replacement) => replacement.forCardId !== null)).toBe(true);
    const claims = prototype.idea.evidence.synergyClaims;
    const prototypeCardIds = new Set(prototype.deck.cards.map((card) => card.cardId));
    expect(claims).toHaveLength(3);
    expect(claims.every((claim) =>
      claim.enablers.every((card) => prototypeCardIds.has(card.cardId)) &&
      prototypeCardIds.has(claim.payoff.cardId)
    )).toBe(true);
    expect(claims.every((claim) =>
      claim.enablers.every((card) => card.cardId !== claim.payoff.cardId)
    )).toBe(true);
    expect(new Set(claims.map((claim) =>
      [claim.enablers[0]!.cardId, claim.payoff.cardId].sort().join(":")
    )).size).toBe(claims.length);
    expect(new Set(claims.flatMap((claim) => [
      ...claim.enablers.map((card) => card.cardId),
      claim.payoff.cardId
    ])).size).toBe(claims.reduce((count, claim) => count + claim.enablers.length + 1, 0));
    expect(claims.every((claim) =>
      claim.evidenceRuleIds.includes("tokens:create") &&
      claim.evidenceRuleIds.includes("tokens:payoff")
    )).toBe(true);
    expect(claims[0]?.explanation).toMatch(/Token Maker \d creates the tokens that Token Payoff \d rewards/i);
    expect(prototype.idea.whyItAppeared).toBe(claims[0]?.explanation);
    expect(prototype.idea.evidence.summary).toBe(claims[1]?.explanation);
    expect(prototype.idea.whyItAppeared).not.toMatch(/you own|\d+ enablers|\d+ payoffs/i);

    const tuned = getCoachPrototype(db, {
      ideaId: idea!.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea!.source,
      lockedCards: [],
      excludedCardIds: ["token-maker-0"]
    });
    const tunedClaimIds = tuned.idea.evidence.synergyClaims.flatMap((claim) => [
      ...claim.enablers.map((card) => card.cardId),
      claim.payoff.cardId
    ]);
    expect(tuned.deck.cards.some((card) => card.cardId === "token-maker-0")).toBe(false);
    expect(tunedClaimIds).not.toContain("token-maker-0");
    expect(tuned.idea.evidence.synergyClaims).not.toEqual(claims);

    const onePackage = getCoachPrototype(db, {
      ideaId: idea!.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea!.source,
      lockedCards: [],
      excludedCardIds: ["token-payoff-1", "token-payoff-2", "token-payoff-3"]
    });
    expect(onePackage.idea.evidence.synergyClaims).toHaveLength(1);

    const skipped = getCoachIdeas(db, {
      ...request,
      excludedIdeaFingerprints: [idea!.ideaFingerprint]
    });
    expect(skipped.ideas.every((candidate) => candidate.ideaFingerprint !== idea!.ideaFingerprint)).toBe(true);

    const repeated = getCoachIdeas(db, request);
    expect(repeated.ideas).toHaveLength(ideas.ideas.length);
    expect(repeated.ideas.map((candidate) => candidate.ideaId)).toEqual(ideas.ideas.map((candidate) => candidate.ideaId));
    expect(repeated.ideas.length).toBeLessThanOrEqual(3);
  });

  it("uses the exact Standard value allocation", () => {
    const db = makeDatabase();
    seedStandardGraveyard(db);
    const ideas = getCoachIdeas(db, {
      format: "standard",
      craftBudget: zeroBudget,
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    });
    const idea = ideas.ideas.find((candidate) => candidate.theme.slug === "graveyard")!;
    const prototype = getCoachPrototype(db, {
      ideaId: idea.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea.source,
      lockedCards: [],
      excludedCardIds: []
    });
    expect(prototype.roleCoverage.map((role) => role.count)).toEqual([12, 10, 8, 5, 25]);
  });

  it("does not surface a complete-looking idea that fails its curve guardrail", () => {
    const db = makeDatabase();
    seedStandardTokens(db);
    db.prepare(`
      UPDATE cards SET mana_value = 7
      WHERE lower(type_line) NOT LIKE '%land%'
    `).run();

    const ideas = getCoachIdeas(db, {
      format: "standard",
      craftBudget: zeroBudget,
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    });

    expect(ideas.ideas).toEqual([]);
    expect(ideas.diagnostics.message).toMatch(/no complete collection-fit prototype/i);
  });

  it("reconstructs anchored ideas and enforces rarity budgets independently", () => {
    const db = makeDatabase();
    seedStandardTokens(db);
    const ideas = getCoachIdeas(db, {
      format: "standard",
      craftBudget: zeroBudget,
      anchorCardId: "token-maker-0",
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    });
    const idea = ideas.ideas[0]!;
    const anchored = getCoachPrototype(db, {
      ideaId: idea.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea.source,
      lockedCards: [],
      excludedCardIds: []
    });
    expect(anchored.deck.cards.some((card) => card.cardId === "token-maker-0")).toBe(true);
    expect(
      anchored.replacements.every((replacement) => replacement.forCardId !== "token-maker-0")
    ).toBe(true);
    expect(() => getCoachPrototype(db, {
      ideaId: idea.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea.source,
      lockedCards: [],
      excludedCardIds: ["token-maker-0"]
    })).toThrowError(/cannot produce a complete legal deck/i);

    const crafted = getCoachPrototype(db, {
      ideaId: idea.ideaId,
      format: "standard",
      craftBudget: { common: 0, uncommon: 0, rare: 3, mythic: 0 },
      source: idea.source,
      lockedCards: [{ cardId: "rare-draw-spell", quantity: 3 }],
      excludedCardIds: ["draw-spell"]
    });
    expect(crafted.craftCost).toEqual({ common: 0, uncommon: 0, rare: 3, mythic: 0 });
    expect(() => getCoachPrototype(db, {
      ideaId: idea.ideaId,
      format: "standard",
      craftBudget: { common: 100, uncommon: 100, rare: 2, mythic: 100 },
      source: idea.source,
      lockedCards: [{ cardId: "rare-draw-spell", quantity: 3 }],
      excludedCardIds: ["draw-spell"]
    })).toThrowError(/cannot produce a complete legal deck/i);
  });

  it("reconstructs an anchored idea after the process-local cache is gone", () => {
    const sourceDb = makeDatabase();
    seedStandardTokens(sourceDb);
    const ideas = getCoachIdeas(sourceDb, {
      format: "standard",
      craftBudget: zeroBudget,
      anchorCardId: "token-maker-0",
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    });
    const idea = ideas.ideas[0]!;

    // A second handle has an empty WeakMap cache but the same immutable source
    // snapshot, matching a server restart between choosing and reviewing.
    const restartedDb = makeDatabase();
    seedStandardTokens(restartedDb);
    const prototype = getCoachPrototype(restartedDb, {
      ideaId: idea.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea.source,
      lockedCards: [],
      excludedCardIds: []
    });

    expect(prototype.validation.isLegal).toBe(true);
    expect(prototype.deck.cards.some((card) => card.cardId === "token-maker-0")).toBe(true);
  });

  it("builds an exact 100-card Brawl prototype with explicit theme density", () => {
    const db = makeDatabase();
    seedBrawlTokens(db);
    const ideas = getCoachIdeas(db, {
      format: "brawl",
      craftBudget: zeroBudget,
      commanderCardId: "token-commander",
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    });
    const idea = ideas.ideas[0];
    expect(idea?.commander?.cardId).toBe("token-commander");

    const prototype = getCoachPrototype(db, {
      ideaId: idea!.ideaId,
      format: "brawl",
      craftBudget: zeroBudget,
      source: idea!.source,
      lockedCards: [],
      excludedCardIds: []
    });
    expect(prototype.validation.counts).toEqual({ main: 99, sideboard: 0, commander: 1, total: 100 });
    expect(prototype.themeDensity).toMatchObject({ count: 30, target: 30 });
    expect(prototype.roleCoverage.map((role) => role.count)).toEqual([30, 10, 10, 8, 3, 38]);
    const commanderClaim = prototype.idea.evidence.synergyClaims.find((claim) =>
      claim.kind === "commander-engine"
    );
    expect(commanderClaim?.payoff).toEqual({
      cardId: "token-commander",
      name: "Token Commander"
    });
    expect(commanderClaim?.enablers[0]?.cardId).toMatch(/^brawl-token-/);
    expect(commanderClaim?.explanation).toMatch(/ties Token Commander directly/i);
    const brawlCardIds = new Set(prototype.deck.cards.map((card) => card.cardId));
    expect(prototype.idea.evidence.synergyClaims.every((claim) =>
      claim.enablers.every((card) => brawlCardIds.has(card.cardId)) &&
      brawlCardIds.has(claim.payoff.cardId)
    )).toBe(true);
    expect(prototype.idea.evidence.synergyClaims.every((claim) =>
      claim.enablers.every((card) => card.cardId !== claim.payoff.cardId)
    )).toBe(true);
    const brawlClaimCards = prototype.idea.evidence.synergyClaims.flatMap((claim) => [
      ...claim.enablers.map((card) => card.cardId),
      claim.payoff.cardId
    ]);
    expect(new Set(brawlClaimCards).size).toBe(brawlClaimCards.length);
  });

  it("rejects a Brawl theme with many payoffs but too few actual enablers", () => {
    const db = makeDatabase();
    seedBrawlThinBlink(db);
    const ideas = getCoachIdeas(db, {
      format: "brawl",
      craftBudget: zeroBudget,
      commanderCardId: "blink-commander",
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    });

    expect(ideas.ideas.some((idea) => idea.theme.slug === "blink-etb")).toBe(false);
  });

  it("rejects a prototype when its collection source changes", () => {
    const db = makeDatabase();
    seedStandardTokens(db);
    const ideas = getCoachIdeas(db, {
      format: "standard",
      craftBudget: zeroBudget,
      excludedIdeaFingerprints: [],
      excludedConstraintFingerprints: []
    });
    const idea = ideas.ideas[0]!;
    db.prepare(`
      INSERT INTO collection_imports (
        id, source, imported_at, metadata_json, card_entries, owned_copies, raw_owned_copies
      ) VALUES ('import-2', 'test', '2026-02-01T00:00:00.000Z', '{}', 0, 0, 0)
    `).run();

    expect(() => getCoachPrototype(db, {
      ideaId: idea.ideaId,
      format: "standard",
      craftBudget: zeroBudget,
      source: idea.source,
      lockedCards: [],
      excludedCardIds: []
    })).toThrowError(CoachServiceError);
    try {
      getCoachPrototype(db, {
        ideaId: idea.ideaId,
        format: "standard",
        craftBudget: zeroBudget,
        source: idea.source,
        lockedCards: [],
        excludedCardIds: []
      });
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 409, code: "SOURCE_CHANGED" });
    }
  });

  it("serves the stateless ideas and prototype routes", async () => {
    const db = makeDatabase();
    seedStandardTokens(db);
    const app = Fastify();
    registerCoachRoutes(app, db);
    const ideasResponse = await app.inject({
      method: "POST",
      url: "/api/coach/ideas",
      payload: {
        format: "standard",
        craftBudget: zeroBudget
      }
    });
    expect(ideasResponse.statusCode).toBe(200);
    const payload = ideasResponse.json();
    expect(payload.ideas.length).toBeGreaterThan(0);
    const prototypeResponse = await app.inject({
      method: "POST",
      url: "/api/coach/prototype",
      payload: {
        ideaId: payload.ideas[0].ideaId,
        format: "standard",
        craftBudget: zeroBudget,
        source: payload.ideas[0].source
      }
    });
    expect(prototypeResponse.statusCode).toBe(200);
    expect(prototypeResponse.json().validation.isLegal).toBe(true);

    db.prepare(`
      INSERT INTO collection_imports (
        id, source, imported_at, metadata_json, card_entries, owned_copies, raw_owned_copies
      ) VALUES ('import-route-change', 'test', '2026-03-01T00:00:00.000Z', '{}', 0, 0, 0)
    `).run();
    const staleResponse = await app.inject({
      method: "POST",
      url: "/api/coach/prototype",
      payload: {
        ideaId: payload.ideas[0].ideaId,
        format: "standard",
        craftBudget: zeroBudget,
        source: payload.ideas[0].source
      }
    });
    expect(staleResponse.statusCode).toBe(409);
    expect(staleResponse.json()).toMatchObject({ code: "SOURCE_CHANGED" });
    await app.close();
  });
});
