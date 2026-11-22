import type { FastifyInstance, FastifyRequest } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import { journalListQuerySchema, journalUpsertSchema, schoolParamsSchema } from "./journal.schema.ts";
import { listTeachingJournals, upsertTeachingJournal } from "./journal.service.ts";

function ctx(request: FastifyRequest) {
  return {
    auth: getAuth(request),
    meta: requestMeta(request),
    params: parseInput(schoolParamsSchema, request.params),
  };
}

export async function journalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/journals", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    const query = parseInput(journalListQuerySchema, request.query);
    return listTeachingJournals(app.prisma, c.auth, c.params.schoolId, query, c.meta);
  });

  app.post("/schools/:schoolId/journals", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    const body = parseInput(journalUpsertSchema, request.body);
    return upsertTeachingJournal(app.prisma, c.auth, c.params.schoolId, body, c.meta);
  });
}
