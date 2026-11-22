import type { FastifyInstance, FastifyRequest } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  characterRecordCreateSchema,
  counselingCreateSchema,
  counselingIdParamsSchema,
  counselingUpdateSchema,
  schoolParamsSchema,
} from "./character-counseling.schema.ts";
import {
  createCharacterRecord,
  createCounselingReport,
  listCharacterRecords,
  listCounselingReports,
  updateCounselingReport,
} from "./character-counseling.service.ts";

function schoolCtx(request: FastifyRequest) {
  return {
    auth: getAuth(request),
    meta: requestMeta(request),
    params: parseInput(schoolParamsSchema, request.params),
  };
}

export async function characterCounselingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/character-records", { preHandler: requireAuth }, async (request) => {
    const c = schoolCtx(request);
    return listCharacterRecords(app.prisma, c.auth, c.params.schoolId, c.meta);
  });

  app.post("/schools/:schoolId/character-records", { preHandler: requireAuth }, async (request) => {
    const c = schoolCtx(request);
    const body = parseInput(characterRecordCreateSchema, request.body);
    return createCharacterRecord(app.prisma, c.auth, c.params.schoolId, body, c.meta);
  });

  app.get("/schools/:schoolId/counseling-reports", { preHandler: requireAuth }, async (request) => {
    const c = schoolCtx(request);
    return listCounselingReports(app.prisma, c.auth, c.params.schoolId, c.meta);
  });

  app.post("/schools/:schoolId/counseling-reports", { preHandler: requireAuth }, async (request) => {
    const c = schoolCtx(request);
    const body = parseInput(counselingCreateSchema, request.body);
    return createCounselingReport(app.prisma, c.auth, c.params.schoolId, body, c.meta);
  });

  app.patch("/schools/:schoolId/counseling-reports/:id", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(counselingIdParamsSchema, request.params);
    const body = parseInput(counselingUpdateSchema, request.body);
    return updateCounselingReport(app.prisma, auth, params.schoolId, params.id, body, meta);
  });
}
