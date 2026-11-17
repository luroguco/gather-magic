import { timingSafeEqual } from "node:crypto";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { ZodError } from "zod";

import { createDatabase, type DbHandle } from "./lib/database.js";
import { registerCaptureRoutes } from "./modules/capture/routes.js";
import { registerCardRoutes } from "./modules/cards/routes.js";
import { registerCoachRoutes } from "./modules/coach/routes.js";
import { registerCollectionRoutes } from "./modules/collection/routes.js";
import { registerDeckRoutes } from "./modules/decks/routes.js";
import { registerSystemRoutes } from "./modules/system/routes.js";
import type { CollectorCaptureHelperOptions } from "./services/mtgaCollectorHelper.js";
import type { syncCardCatalog } from "./services/cardData.js";
import type { UntappedCompanionBridgeOptions } from "./services/untappedCompanionBridge.js";
import type { UntappedCatalogSource } from "./services/untappedCollectionImport.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];
const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1"];
const LOOPBACK_ORIGIN_HOSTS = new Set(DEFAULT_ALLOWED_HOSTS);
const MAX_MULTIPART_FILE_SIZE = 5 * 1024 * 1024;

const isLoopbackDevelopmentOrigin = (origin: string) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && LOOPBACK_ORIGIN_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

export type BuildAppOptions = {
  untappedCatalogSource?: UntappedCatalogSource;
  collectorCatalogSource?: UntappedCatalogSource;
  untappedBuild?: string;
  untappedLocale?: string;
  untappedConfigPath?: string;
  untappedDownloadsPath?: string;
  untappedCapturePath?: string;
  arenaPlayerLogPath?: string;
  arenaDeckCatalogSource?: UntappedCatalogSource;
  untappedBridgeOptions?: UntappedCompanionBridgeOptions;
  collectorHelperOptions?: CollectorCaptureHelperOptions;
  directCaptureEnabled?: boolean;
  experimentalCaptureEnabled?: boolean;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  localApiToken?: string;
  cardCatalogSync?: typeof syncCardCatalog;
};

const tokenMatches = (expected: string, actual: string | undefined) => {
  if (!actual?.startsWith("Bearer ")) {
    return false;
  }
  const actualToken = actual.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actualToken);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
};

export const buildApp = (
  db: DbHandle = createDatabase(),
  options: BuildAppOptions = {}
) => {
  const app = Fastify({
    logger: false,
    bodyLimit: MAX_MULTIPART_FILE_SIZE
  });
  const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  const isAllowedOrigin = (origin: string) =>
    allowedOrigins.includes(origin) ||
    (options.allowedOrigins === undefined && isLoopbackDevelopmentOrigin(origin));
  const allowedHosts = new Set(options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS);
  const untappedCatalogSource = options.untappedCatalogSource ?? "untapped-public";
  const collectorCatalogSource = options.collectorCatalogSource ?? "hybrid";
  const directCaptureEnabled =
    options.directCaptureEnabled ?? options.experimentalCaptureEnabled ?? false;

  app.register(cors, {
    origin: (origin, callback) => {
      callback(null, !origin || isAllowedOrigin(origin));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"]
  });
  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: MAX_MULTIPART_FILE_SIZE,
      fields: 5
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!allowedHosts.has(request.hostname)) {
      return reply.code(403).send({ error: "Unrecognized API host." });
    }

    const origin = request.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      return reply.code(403).send({ error: "Origin is not allowed." });
    }

    if (
      options.localApiToken &&
      request.url !== "/api/health" &&
      request.method !== "OPTIONS" &&
      !tokenMatches(options.localApiToken, request.headers.authorization)
    ) {
      return reply.code(401).send({ error: "A valid local API token is required." });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Invalid request.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    const errorCode =
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    return reply.code(statusCode).send({
      error:
        statusCode >= 500 && !errorCode
          ? "Request failed."
          : error instanceof Error
            ? error.message
            : "Request failed.",
      ...(errorCode ? { code: errorCode } : {})
    });
  });

  registerSystemRoutes(app, db);
  registerCardRoutes(app, db);
  registerCoachRoutes(app, db);
  registerCollectionRoutes(app, db, {
    untappedCatalogSource,
    collectorCatalogSource,
    ...(options.untappedBuild ? { untappedBuild: options.untappedBuild } : {}),
    ...(options.untappedLocale ? { untappedLocale: options.untappedLocale } : {})
  });
  registerCaptureRoutes(app, db, {
    enabled: directCaptureEnabled,
    untappedCatalogSource,
    collectorCatalogSource,
    ...(options.untappedBuild ? { untappedBuild: options.untappedBuild } : {}),
    ...(options.untappedLocale ? { untappedLocale: options.untappedLocale } : {}),
    ...(options.untappedConfigPath ? { untappedConfigPath: options.untappedConfigPath } : {}),
    ...(options.untappedDownloadsPath
      ? { untappedDownloadsPath: options.untappedDownloadsPath }
      : {}),
    ...(options.untappedCapturePath
      ? { untappedCapturePath: options.untappedCapturePath }
      : {}),
    ...(options.untappedBridgeOptions
      ? { untappedBridgeOptions: options.untappedBridgeOptions }
      : {}),
    ...(options.collectorHelperOptions
      ? { collectorHelperOptions: options.collectorHelperOptions }
      : {}),
    ...(options.cardCatalogSync
      ? { cardCatalogSync: options.cardCatalogSync }
      : {})
  });
  registerDeckRoutes(app, db, {
    catalogSource: options.arenaDeckCatalogSource ?? collectorCatalogSource,
    ...(options.arenaPlayerLogPath
      ? { playerLogPath: options.arenaPlayerLogPath }
      : {}),
    ...(options.untappedBuild ? { untappedBuild: options.untappedBuild } : {}),
    ...(options.untappedLocale ? { untappedLocale: options.untappedLocale } : {})
  });

  return app;
};
