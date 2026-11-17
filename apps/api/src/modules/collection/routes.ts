import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { z } from "zod";

import type { DbHandle } from "../../lib/database.js";
import {
  listCollectionImportHistory,
  restoreCollectionImport
} from "../../services/collectionHistory.js";
import {
  importCollectionCsv,
  previewCollectionCsv
} from "../../services/collectionImport.js";
import {
  importCollectorSnapshotJson,
  importUntappedCollectionJson,
  previewCollectorSnapshotImport,
  previewUntappedCollectionImport,
  type UntappedCatalogSource
} from "../../services/untappedCollectionImport.js";

type CollectionRouteOptions = {
  untappedCatalogSource: UntappedCatalogSource;
  collectorCatalogSource: UntappedCatalogSource;
  untappedBuild?: string;
  untappedLocale?: string;
};

const requireUploadedFile = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const file = await request.file();
  if (!file) {
    reply.code(400);
    return null;
  }
  return file;
};

const parseImportConfirmation = (query: unknown) =>
  z
    .object({
      confirmSuspiciousDiff: z
        .string()
        .optional()
        .transform((value) => value === "true")
    })
    .parse(query);

export const registerCollectionRoutes = (
  app: FastifyInstance,
  db: DbHandle,
  options: CollectionRouteOptions
) => {
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

  app.post("/api/imports/collection-csv/preview", async (request, reply) => {
    const file = await requireUploadedFile(request, reply);
    if (!file) {
      return { error: "Expected a multipart file field." };
    }
    const csvContent = await file.toBuffer();
    return previewCollectionCsv(db, csvContent.toString("utf8"));
  });

  app.post("/api/imports/collection-csv", async (request, reply) => {
    const file = await requireUploadedFile(request, reply);
    if (!file) {
      return { error: "Expected a multipart file field." };
    }
    const csvContent = await file.toBuffer();
    const query = parseImportConfirmation(request.query);
    return importCollectionCsv(db, csvContent.toString("utf8"), {
      confirmSuspiciousDiff: query.confirmSuspiciousDiff
    });
  });

  app.post("/api/imports/collector-snapshot/preview", async (request, reply) => {
    const file = await requireUploadedFile(request, reply);
    if (!file) {
      return { error: "Expected a multipart file field." };
    }
    const jsonContent = await file.toBuffer();
    return previewCollectorSnapshotImport(
      db,
      jsonContent.toString("utf8"),
      collectorImportOptions
    );
  });

  app.post("/api/imports/collector-snapshot", async (request, reply) => {
    const file = await requireUploadedFile(request, reply);
    if (!file) {
      return { error: "Expected a multipart file field." };
    }
    const jsonContent = await file.toBuffer();
    const query = parseImportConfirmation(request.query);
    return importCollectorSnapshotJson(db, jsonContent.toString("utf8"), {
      ...collectorImportOptions,
      confirmSuspiciousDiff: query.confirmSuspiciousDiff
    });
  });

  app.post("/api/imports/untapped-json/preview", async (request, reply) => {
    const file = await requireUploadedFile(request, reply);
    if (!file) {
      return { error: "Expected a multipart file field." };
    }
    const jsonContent = await file.toBuffer();
    return previewUntappedCollectionImport(
      db,
      jsonContent.toString("utf8"),
      untappedImportOptions
    );
  });

  app.post("/api/imports/untapped-json", async (request, reply) => {
    const file = await requireUploadedFile(request, reply);
    if (!file) {
      return { error: "Expected a multipart file field." };
    }
    const jsonContent = await file.toBuffer();
    const query = parseImportConfirmation(request.query);
    return importUntappedCollectionJson(db, jsonContent.toString("utf8"), {
      ...untappedImportOptions,
      confirmSuspiciousDiff: query.confirmSuspiciousDiff
    });
  });

  app.get("/api/collection/imports", async () => ({
    items: listCollectionImportHistory(db)
  }));

  app.post("/api/collection/imports/:id/restore", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const restored = restoreCollectionImport(db, params.id);
    if (!restored) {
      return reply.code(404).send({ error: "Collection import not found" });
    }
    return restored;
  });
};
