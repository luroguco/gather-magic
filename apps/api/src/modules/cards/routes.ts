import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ARENA_FORMATS } from "../../lib/formats.js";
import type { DbHandle } from "../../lib/database.js";
import {
  CARD_DRILLDOWN_KINDS,
  getCardById,
  getCardStats,
  listMechanics,
  searchCards,
  type SearchFilters
} from "../../services/cardsRepository.js";

const MAX_SEARCH_PAGE_SIZE = 50_000;

const optionalNumberQuery = z
  .string()
  .optional()
  .transform((value, context) => {
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      context.addIssue({
        code: "custom",
        message: "Expected a finite number."
      });
      return z.NEVER;
    }
    return parsed;
  });

const optionalIntegerQuery = (fallback: number, maximum?: number) =>
  z
    .string()
    .optional()
    .transform((value, context) => {
      if (!value) {
        return fallback;
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        context.addIssue({
          code: "custom",
          message: "Expected a positive integer."
        });
        return z.NEVER;
      }
      return maximum ? Math.min(parsed, maximum) : parsed;
    });

const searchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  format: z.enum(ARENA_FORMATS).optional(),
  colors: z.string().max(200).optional(),
  mechanics: z.string().max(5_000).optional(),
  types: z.string().max(1_000).optional(),
  subtypes: z.string().max(2_000).optional(),
  rarity: z.string().max(200).optional(),
  sets: z.string().max(5_000).optional(),
  drilldownKind: z.enum(CARD_DRILLDOWN_KINDS).optional(),
  drilldownKey: z.string().max(500).optional(),
  ownedOnly: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  playableCountMin: optionalNumberQuery,
  playableCountMax: optionalNumberQuery,
  manaValueMin: optionalNumberQuery,
  manaValueMax: optionalNumberQuery,
  page: optionalIntegerQuery(1),
  pageSize: optionalIntegerQuery(MAX_SEARCH_PAGE_SIZE, MAX_SEARCH_PAGE_SIZE)
});

const mechanicsQuerySchema = z.object({
  ownedOnly: z
    .string()
    .optional()
    .transform((value) => value === "true")
});

const splitCsvParam = (value?: string) =>
  value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? undefined;

type SearchQuery = z.infer<typeof searchQuerySchema>;

const mapSearchQueryToFilters = (query: SearchQuery): SearchFilters => ({
  q: query.q,
  format: query.format,
  colors: splitCsvParam(query.colors),
  mechanics: splitCsvParam(query.mechanics),
  types: splitCsvParam(query.types),
  subtypes: splitCsvParam(query.subtypes),
  rarity: splitCsvParam(query.rarity),
  sets: splitCsvParam(query.sets),
  drilldownKind: query.drilldownKind,
  drilldownKey: query.drilldownKey,
  ownedOnly: query.ownedOnly,
  playableCountMin: query.playableCountMin,
  playableCountMax: query.playableCountMax,
  manaValueMin: query.manaValueMin,
  manaValueMax: query.manaValueMax,
  page: query.page,
  pageSize: query.pageSize
});

export const registerCardRoutes = (app: FastifyInstance, db: DbHandle) => {
  app.get("/api/mechanics", async (request) => {
    const query = mechanicsQuerySchema.parse(request.query);
    return {
      items: listMechanics(db, {
        ownedOnly: query.ownedOnly
      })
    };
  });

  app.get("/api/cards/search", async (request) => {
    const query = searchQuerySchema.parse(request.query);
    return searchCards(db, mapSearchQueryToFilters(query));
  });

  app.get("/api/stats/cards", async (request) => {
    const query = searchQuerySchema.parse(request.query);
    return getCardStats(db, mapSearchQueryToFilters(query));
  });

  app.get("/api/cards/:id", async (request, reply) => {
    const params = z.object({ id: z.string().min(1).max(500) }).parse(request.params);
    const card = getCardById(db, params.id);
    if (!card) {
      return reply.code(404).send({ error: "Card not found" });
    }
    return card;
  });
};
