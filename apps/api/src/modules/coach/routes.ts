import {
  coachIdeasRequestSchema,
  coachIdeasResponseSchema,
  coachPrototypeRequestSchema,
  coachPrototypeResponseSchema
} from "@mtga/contracts";
import type { FastifyInstance } from "fastify";

import type { DbHandle } from "../../lib/database.js";
import { getCoachIdeas, getCoachPrototype } from "../../services/coachService.js";

export const registerCoachRoutes = (app: FastifyInstance, db: DbHandle) => {
  app.post("/api/coach/ideas", async (request) => {
    const input = coachIdeasRequestSchema.parse(request.body);
    return coachIdeasResponseSchema.parse(getCoachIdeas(db, input));
  });

  app.post("/api/coach/prototype", async (request) => {
    const input = coachPrototypeRequestSchema.parse(request.body);
    return coachPrototypeResponseSchema.parse(getCoachPrototype(db, input));
  });
};
