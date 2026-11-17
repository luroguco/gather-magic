import type { FastifyInstance } from "fastify";

import type { DbHandle } from "../../lib/database.js";
import {
  getCardDataSyncSummary,
  getCollectionSummary
} from "../../services/cardsRepository.js";

export const registerSystemRoutes = (app: FastifyInstance, db: DbHandle) => {
  app.get("/api/health", async () => ({
    ok: true
  }));

  app.get("/api/status", async () => ({
    collection: getCollectionSummary(db),
    cards: db.prepare("SELECT COUNT(*) AS total FROM cards").get(),
    cardData: getCardDataSyncSummary(db)
  }));
};
