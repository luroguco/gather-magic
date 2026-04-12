import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { createDatabase, type DbHandle } from "./lib/database.js";
import { ARENA_FORMATS } from "./lib/formats.js";
import { importCollectionCsv } from "./services/collectionImport.js";
import {
  CARD_DRILLDOWN_KINDS,
  getCardById,
  getCardStats,
  getCollectionSummary,
  listMechanics,
  searchCards,
  type SearchFilters
} from "./services/cardsRepository.js";
import { createDeck, exportDeckForArena, getDeck, listDecks, updateDeck, validateDeck } from "./services/decks.js";
import {
  UNTAPPED_CAPTURE_SNIPPET,
  getUntappedCaptureStatus,
  readLatestUntappedCapture,
  setUntappedDevToolsEnabled
} from "./services/untappedCaptureHelper.js";
import {
  captureCollectorSnapshot,
  getCollectorCaptureStatus,
  readLatestCollectorSnapshot,
  type CollectorCaptureHelperOptions
} from "./services/mtgaCollectorHelper.js";
import {
  importCollectorSnapshotJson,
  importUntappedCollectionJson,
  previewCollectorSnapshotImport,
  previewUntappedCollectionImport,
  type UntappedCatalogSource
} from "./services/untappedCollectionImport.js";

const MAX_SEARCH_PAGE_SIZE = 50_000;

const searchQuerySchema = z.object({
  q: z.string().optional(),
  format: z.enum(ARENA_FORMATS).optional(),
  colors: z.string().optional(),
  mechanics: z.string().optional(),
  types: z.string().optional(),
  subtypes: z.string().optional(),
  rarity: z.string().optional(),
  sets: z.string().optional(),
  drilldownKind: z.enum(CARD_DRILLDOWN_KINDS).optional(),
  drilldownKey: z.string().optional(),
  ownedOnly: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  playableCountMin: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseFloat(value) : undefined)),
  playableCountMax: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseFloat(value) : undefined)),
  manaValueMin: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseFloat(value) : undefined)),
  manaValueMax: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseFloat(value) : undefined)),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 1)),
  pageSize: z
    .string()
    .optional()
    .transform((value) => (value ? Math.min(Number.parseInt(value, 10), MAX_SEARCH_PAGE_SIZE) : MAX_SEARCH_PAGE_SIZE))
});

const mechanicsQuerySchema = z.object({
  ownedOnly: z
    .string()
    .optional()
    .transform((value) => value === "true")
});

const deckCardSchema = z.object({
  cardId: z.string().min(1),
  quantity: z.number().int().positive(),
  section: z.enum(["main", "sideboard", "commander"])
});

const createDeckSchema = z.object({
  name: z.string().min(1),
  format: z.enum(ARENA_FORMATS),
  notes: z.string().optional().default(""),
  cards: z.array(deckCardSchema).optional()
});

const updateDeckSchema = z.object({
  name: z.string().min(1).optional(),
  format: z.enum(ARENA_FORMATS).optional(),
  notes: z.string().optional(),
  cards: z.array(deckCardSchema).optional()
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

export const buildApp = (
  db: DbHandle = createDatabase(),
  options?: {
    untappedCatalogSource?: UntappedCatalogSource;
    untappedBuild?: string;
    untappedLocale?: string;
    untappedConfigPath?: string;
    untappedDownloadsPath?: string;
    collectorHelperOptions?: CollectorCaptureHelperOptions;
  }
) => {
  const app = Fastify({
    logger: false
  });
  const untappedImportOptions = {
    catalogSource: options?.untappedCatalogSource ?? "untapped-public",
    ...(options?.untappedBuild ? { untappedBuild: options.untappedBuild } : {}),
    ...(options?.untappedLocale ? { untappedLocale: options.untappedLocale } : {})
  };
  const untappedHelperOptions = {
    ...(options?.untappedConfigPath ? { configPath: options.untappedConfigPath } : {}),
    ...(options?.untappedDownloadsPath ? { downloadsPath: options.untappedDownloadsPath } : {})
  };
  const collectorHelperOptions = options?.collectorHelperOptions;

  app.register(cors, {
    origin: true
  });
  app.register(multipart);

  app.get("/api/health", async () => ({
    ok: true
  }));

  app.get("/api/status", async () => ({
    collection: getCollectionSummary(db),
    cards: db.prepare("SELECT COUNT(*) AS total FROM cards").get()
  }));

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
    const params = z.object({ id: z.string() }).parse(request.params);
    const card = getCardById(db, params.id);
    if (!card) {
      reply.code(404);
      return { error: "Card not found" };
    }
    return card;
  });

  app.post("/api/imports/collection-csv", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Expected a multipart file field." };
    }
    const csvContent = await file.toBuffer();
    const result = importCollectionCsv(db, csvContent.toString("utf8"));
    return result;
  });

  app.post("/api/imports/collector-snapshot/preview", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Expected a multipart file field." };
    }

    const jsonContent = await file.toBuffer();
    return previewCollectorSnapshotImport(db, jsonContent.toString("utf8"), untappedImportOptions);
  });

  app.post("/api/imports/collector-snapshot", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Expected a multipart file field." };
    }

    const jsonContent = await file.toBuffer();
    return importCollectorSnapshotJson(db, jsonContent.toString("utf8"), untappedImportOptions);
  });

  app.get("/api/imports/collector-helper/status", async () => getCollectorCaptureStatus(collectorHelperOptions));

  app.post("/api/imports/collector-helper/capture-preview", async () => {
    const { capture, content } = await captureCollectorSnapshot(collectorHelperOptions);
    const preview = await previewCollectorSnapshotImport(db, content, untappedImportOptions);

    return {
      ...preview,
      capture
    };
  });

  app.post("/api/imports/collector-helper/preview-latest", async () => {
    const { capture, content } = readLatestCollectorSnapshot(collectorHelperOptions);
    const preview = await previewCollectorSnapshotImport(db, content, untappedImportOptions);

    return {
      ...preview,
      capture
    };
  });

  app.post("/api/imports/collector-helper/import-latest", async () => {
    const { capture, content } = readLatestCollectorSnapshot(collectorHelperOptions);
    const imported = await importCollectorSnapshotJson(db, content, untappedImportOptions);

    return {
      ...imported,
      capture
    };
  });

  app.post("/api/imports/untapped-json/preview", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Expected a multipart file field." };
    }

    const jsonContent = await file.toBuffer();
    return previewUntappedCollectionImport(db, jsonContent.toString("utf8"), untappedImportOptions);
  });

  app.post("/api/imports/untapped-json", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400);
      return { error: "Expected a multipart file field." };
    }

    const jsonContent = await file.toBuffer();
    return importUntappedCollectionJson(db, jsonContent.toString("utf8"), untappedImportOptions);
  });

  app.get("/api/imports/untapped-helper/status", async () => ({
    ...getUntappedCaptureStatus(untappedHelperOptions),
    snippet: UNTAPPED_CAPTURE_SNIPPET
  }));

  app.post("/api/imports/untapped-helper/start", async () => {
    const result = setUntappedDevToolsEnabled(true, untappedHelperOptions);
    return {
      changed: result.changed,
      status: result.status,
      snippet: UNTAPPED_CAPTURE_SNIPPET
    };
  });

  app.post("/api/imports/untapped-helper/stop", async () => {
    const result = setUntappedDevToolsEnabled(false, untappedHelperOptions);
    return {
      changed: result.changed,
      status: result.status
    };
  });

  app.post("/api/imports/untapped-helper/preview-latest", async () => {
    const { capture, content } = readLatestUntappedCapture(untappedHelperOptions);
    const preview = await previewUntappedCollectionImport(db, content, untappedImportOptions);

    return {
      ...preview,
      capture
    };
  });

  app.post("/api/imports/untapped-helper/import-latest", async () => {
    const { capture, content } = readLatestUntappedCapture(untappedHelperOptions);
    const imported = await importUntappedCollectionJson(db, content, untappedImportOptions);

    return {
      ...imported,
      capture
    };
  });

  app.get("/api/decks", async () => ({
    items: listDecks(db)
  }));

  app.post("/api/decks", async (request) => {
    const input = createDeckSchema.parse(request.body);
    return createDeck(db, input);
  });

  app.get("/api/decks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deck = getDeck(db, params.id);
    if (!deck) {
      reply.code(404);
      return { error: "Deck not found" };
    }
    return deck;
  });

  app.patch("/api/decks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const input = updateDeckSchema.parse(request.body);
    const deck = updateDeck(db, params.id, input);
    if (!deck) {
      reply.code(404);
      return { error: "Deck not found" };
    }
    return deck;
  });

  app.post("/api/decks/:id/validate", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const validation = validateDeck(db, params.id);
    if (!validation) {
      reply.code(404);
      return { error: "Deck not found" };
    }
    return validation;
  });

  app.get("/api/decks/:id/export/arena", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const exportPayload = exportDeckForArena(db, params.id);
    if (!exportPayload) {
      reply.code(404);
      return { error: "Deck not found" };
    }
    return exportPayload;
  });

  return app;
};
