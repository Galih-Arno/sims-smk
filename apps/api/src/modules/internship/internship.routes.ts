import type { FastifyInstance } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  internshipLogCreateSchema,
  internshipLogVerifySchema,
  logVerifyParamsSchema,
  placementCreateSchema,
  schoolParamsSchema,
} from "./internship.schema.ts";
import {
  createInternshipLog,
  createInternshipPlacement,
  listInternshipLogs,
  listInternshipPlacements,
  verifyInternshipLog,
} from "./internship.service.ts";

export async function internshipRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/internship-placements", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listInternshipPlacements(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/internship-placements", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(placementCreateSchema, request.body);
    return createInternshipPlacement(app.prisma, auth, params.schoolId, body, meta);
  });

  app.get("/schools/:schoolId/internship-logs", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listInternshipLogs(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/internship-logs", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(internshipLogCreateSchema, request.body);
    return createInternshipLog(app.prisma, auth, params.schoolId, body, meta);
  });

  app.post("/schools/:schoolId/internship-logs/:logId/verify", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(logVerifyParamsSchema, request.params);
    const body = parseInput(internshipLogVerifySchema, request.body);
    return verifyInternshipLog(app.prisma, auth, params.schoolId, params.logId, body, meta);
  });
}
