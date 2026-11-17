import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import type { DbHandle } from "../../lib/database.js";
import { syncCardCatalog } from "../../services/cardData.js";
import {
  captureCollectorSnapshot,
  getCollectorCaptureStatus,
  readExpectedCollectorSnapshot,
  readLatestCollectorSnapshot,
  type CollectorCaptureHelperOptions
} from "../../services/mtgaCollectorHelper.js";
import {
  UNTAPPED_CAPTURE_SNIPPET,
  getUntappedCaptureStatus,
  readExpectedUntappedCapture,
  readLatestUntappedCapture,
  setUntappedDevToolsEnabled
} from "../../services/untappedCaptureHelper.js";
import {
  captureUntappedCompanionCollection,
  getUntappedCompanionBridgeStatus,
  restartUntappedCompanionForAutomation,
  type UntappedCompanionBridgeOptions
} from "../../services/untappedCompanionBridge.js";
import {
  importCollectorSnapshotJson,
  importUntappedCollectionJson,
  previewCollectorSnapshotImport,
  previewUntappedCollectionImport,
  type UntappedCatalogSource
} from "../../services/untappedCollectionImport.js";

type CaptureRouteOptions = {
  enabled: boolean;
  collectorHelperOptions?: CollectorCaptureHelperOptions;
  collectorCatalogSource: UntappedCatalogSource;
  untappedCatalogSource: UntappedCatalogSource;
  untappedBuild?: string;
  untappedLocale?: string;
  untappedConfigPath?: string;
  untappedDownloadsPath?: string;
  untappedCapturePath?: string;
  untappedBridgeOptions?: UntappedCompanionBridgeOptions;
  cardCatalogSync?: typeof syncCardCatalog;
};

const disabledMessage =
  "Direct Arena capture is disabled for this server. Keep the API on localhost or set ENABLE_DIRECT_CAPTURE=1 for a trusted local session.";

const requireCaptureEnabled = (enabled: boolean, reply: FastifyReply) => {
  if (enabled) {
    return true;
  }
  reply.code(403).send({ error: disabledMessage });
  return false;
};

export const registerCaptureRoutes = (
  app: FastifyInstance,
  db: DbHandle,
  options: CaptureRouteOptions
) => {
  const collectorOptions = options.collectorHelperOptions;
  const untappedHelperOptions = {
    ...(options.untappedConfigPath ? { configPath: options.untappedConfigPath } : {}),
    ...(options.untappedDownloadsPath ? { downloadsPath: options.untappedDownloadsPath } : {}),
    ...(options.untappedCapturePath ? { capturePath: options.untappedCapturePath } : {})
  };
  const untappedBridgeOptions = options.untappedBridgeOptions;
  const untappedImportOptions = {
    catalogSource: options.untappedCatalogSource,
    ...(options.untappedBuild ? { untappedBuild: options.untappedBuild } : {}),
    ...(options.untappedLocale ? { untappedLocale: options.untappedLocale } : {})
  };
  const collectorImportOptions = {
    catalogSource: options.collectorCatalogSource,
    ...(options.untappedBuild ? { untappedBuild: options.untappedBuild } : {}),
    ...(options.untappedLocale ? { untappedLocale: options.untappedLocale } : {})
  };

  app.get("/api/imports/collector-helper/status", async () => {
    if (!options.enabled) {
      return {
        enabled: false,
        available: false,
        readyToCapture: false,
        disabledReason: disabledMessage,
        snapshotPath: "",
        addonPath: "",
        addonAvailable: false,
        codesignAvailable: false,
        scriptAvailable: false,
        mtgaRunning: false,
        mtgaPid: null,
        latestCapture: null,
        lastFailure: null
      };
    }
    return {
      enabled: true,
      ...getCollectorCaptureStatus(collectorOptions)
    };
  });

  app.post("/api/imports/collector-helper/capture-preview", async (_request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const { capture, content } = await captureCollectorSnapshot(collectorOptions);
    const preview = await previewCollectorSnapshotImport(
      db,
      content,
      collectorImportOptions
    );
    return { ...preview, capture };
  });

  app.post("/api/imports/collector-helper/preview-latest", async (_request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const { capture, content } = readLatestCollectorSnapshot(collectorOptions);
    const preview = await previewCollectorSnapshotImport(
      db,
      content,
      collectorImportOptions
    );
    return { ...preview, capture };
  });

  app.post("/api/imports/collector-helper/import-latest", async (request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const query = z
      .object({
        captureId: z.string().length(64),
        confirmSuspiciousDiff: z
          .string()
          .optional()
          .transform((value) => value === "true")
      })
      .parse(request.query);
    const { capture, content } = readExpectedCollectorSnapshot(
      query.captureId,
      collectorOptions
    );
    const imported = await importCollectorSnapshotJson(db, content, {
      ...collectorImportOptions,
      confirmSuspiciousDiff: query.confirmSuspiciousDiff
    });
    return { ...imported, capture };
  });

  app.get("/api/imports/untapped-helper/status", async () => {
    if (!options.enabled) {
      return {
        enabled: false,
        available: false,
        disabledReason: disabledMessage,
        configPath: "",
        downloadsPath: "",
        showDevTools: null,
        latestCapture: null,
        companionInstalled: false,
        companionRunning: false,
        companionPid: null,
        automationState: "unavailable",
        readyToCapture: false,
        restartRequired: false,
        message: disabledMessage,
        snippet: ""
      };
    }
    const bridgeStatus = await getUntappedCompanionBridgeStatus(
      untappedBridgeOptions
    );
    return {
      enabled: true,
      ...getUntappedCaptureStatus(untappedHelperOptions),
      ...bridgeStatus,
      snippet: UNTAPPED_CAPTURE_SNIPPET
    };
  });

  app.post("/api/imports/untapped-helper/restart", async (_request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const status = await restartUntappedCompanionForAutomation(
      untappedBridgeOptions
    );
    return {
      enabled: true,
      ...getUntappedCaptureStatus(untappedHelperOptions),
      ...status,
      snippet: UNTAPPED_CAPTURE_SNIPPET
    };
  });

  app.post("/api/imports/untapped-helper/capture-preview", async (_request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const catalogResult = await (options.cardCatalogSync ?? syncCardCatalog)(db);
    const { capture, content } = await captureUntappedCompanionCollection(
      untappedHelperOptions,
      untappedBridgeOptions
    );
    const preview = await previewUntappedCollectionImport(
      db,
      content,
      untappedImportOptions
    );
    return {
      ...preview,
      capture,
      catalogSync: {
        sourceUpdatedAt: catalogResult.syncMetadata?.sourceUpdatedAt ?? null,
        syncedAt: catalogResult.syncMetadata?.syncedAt ?? null,
        cardCount: catalogResult.cardCount,
        printCount: catalogResult.printCount
      }
    };
  });

  app.post("/api/imports/untapped-helper/start", async (_request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const result = setUntappedDevToolsEnabled(true, untappedHelperOptions);
    const bridgeStatus = await getUntappedCompanionBridgeStatus(
      untappedBridgeOptions
    );
    return {
      changed: result.changed,
      status: {
        enabled: true,
        ...result.status,
        ...bridgeStatus
      },
      snippet: UNTAPPED_CAPTURE_SNIPPET
    };
  });

  app.post("/api/imports/untapped-helper/stop", async (_request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const result = setUntappedDevToolsEnabled(false, untappedHelperOptions);
    const bridgeStatus = await getUntappedCompanionBridgeStatus(
      untappedBridgeOptions
    );
    return {
      changed: result.changed,
      status: {
        enabled: true,
        ...result.status,
        ...bridgeStatus
      }
    };
  });

  app.post("/api/imports/untapped-helper/preview-latest", async (_request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const { capture, content } = readLatestUntappedCapture(untappedHelperOptions);
    const preview = await previewUntappedCollectionImport(
      db,
      content,
      untappedImportOptions
    );
    return { ...preview, capture };
  });

  app.post("/api/imports/untapped-helper/import-latest", async (request, reply) => {
    if (!requireCaptureEnabled(options.enabled, reply)) {
      return;
    }
    const query = z
      .object({
        captureId: z.string().length(64),
        confirmSuspiciousDiff: z
          .string()
          .optional()
          .transform((value) => value === "true")
      })
      .parse(request.query);
    const { capture, content } = readExpectedUntappedCapture(
      query.captureId,
      untappedHelperOptions
    );
    const imported = await importUntappedCollectionJson(db, content, {
      ...untappedImportOptions,
      confirmSuspiciousDiff: query.confirmSuspiciousDiff
    });
    return { ...imported, capture };
  });
};
