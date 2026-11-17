import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { DbHandle } from "../../lib/database.js";
import { DECK_FORMATS } from "../../lib/formats.js";
import {
  importArenaDecks,
  previewArenaDeckSync,
  type ArenaDeckSyncOptions
} from "../../services/arenaDeckSync.js";
import {
  createDeck,
  exportAllDecksForArena,
  exportDeckForArena,
  getDeck,
  listDecks,
  updateDeck,
  validateDeck
} from "../../services/decks.js";

type DeckRouteOptions = Pick<
  ArenaDeckSyncOptions,
  "playerLogPath" | "catalogSource" | "untappedBuild" | "untappedLocale"
>;

const deckCardSchema = z
  .object({
    cardId: z.string().min(1).max(500),
    quantity: z.number().int().positive().max(10_000),
    section: z.enum(["main", "sideboard", "commander"])
  })
  .strict();

const createDeckSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    format: z.enum(DECK_FORMATS),
    notes: z.string().max(20_000).optional().default(""),
    cards: z.array(deckCardSchema).max(10_000).optional()
  })
  .strict();

const updateDeckSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    format: z.enum(DECK_FORMATS).optional(),
    notes: z.string().max(20_000).optional(),
    cards: z.array(deckCardSchema).max(10_000).optional()
  })
  .strict();

const deckParamsSchema = z.object({ id: z.string().min(1).max(500) });
const arenaDeckSyncSchema = z
  .object({
    includeStarterDecks: z.boolean().optional().default(false)
  })
  .strict();

export const registerDeckRoutes = (
  app: FastifyInstance,
  db: DbHandle,
  options: DeckRouteOptions = {}
) => {
  app.get("/api/decks", async () => ({
    items: listDecks(db)
  }));

  app.post("/api/decks/imports/arena-log/preview", async (request) => {
    const input = arenaDeckSyncSchema.parse(request.body ?? {});
    return previewArenaDeckSync(db, {
      ...options,
      includeStarterDecks: input.includeStarterDecks
    });
  });

  app.post("/api/decks/imports/arena-log", async (request) => {
    const input = arenaDeckSyncSchema.parse(request.body ?? {});
    return importArenaDecks(db, {
      ...options,
      includeStarterDecks: input.includeStarterDecks
    });
  });

  app.get("/api/decks/exports/arena", async () =>
    exportAllDecksForArena(db)
  );

  app.post("/api/decks", async (request) => {
    const input = createDeckSchema.parse(request.body);
    return createDeck(db, input);
  });

  app.get("/api/decks/:id", async (request, reply) => {
    const params = deckParamsSchema.parse(request.params);
    const deck = getDeck(db, params.id);
    if (!deck) {
      return reply.code(404).send({ error: "Deck not found" });
    }
    return deck;
  });

  app.patch("/api/decks/:id", async (request, reply) => {
    const params = deckParamsSchema.parse(request.params);
    const input = updateDeckSchema.parse(request.body);
    const deck = updateDeck(db, params.id, input);
    if (!deck) {
      return reply.code(404).send({ error: "Deck not found" });
    }
    return deck;
  });

  app.post("/api/decks/:id/validate", async (request, reply) => {
    const params = deckParamsSchema.parse(request.params);
    const validation = validateDeck(db, params.id);
    if (!validation) {
      return reply.code(404).send({ error: "Deck not found" });
    }
    return validation;
  });

  app.get("/api/decks/:id/export/arena", async (request, reply) => {
    const params = deckParamsSchema.parse(request.params);
    const exportPayload = exportDeckForArena(db, params.id);
    if (!exportPayload) {
      return reply.code(404).send({ error: "Deck not found" });
    }
    return exportPayload;
  });
};
