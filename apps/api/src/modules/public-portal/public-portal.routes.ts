import type { FastifyInstance } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  applicantParamsSchema,
  createPpdbSchema,
  createWhistleblowerSchema,
  reportParamsSchema,
  schoolParamsSchema,
  updatePpdbStatusSchema,
  updateWhistleblowerSchema,
} from "./public-portal.schema.ts";
import {
  createAnonymousReport,
  createPpdbApplicant,
  listAnonymousReports,
  listPpdbApplicants,
  updateAnonymousReport,
  updatePpdbApplicantStatus,
} from "./public-portal.service.ts";

export async function publicPortalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/ppdb/applicants", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listPpdbApplicants(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/ppdb/applicants", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(createPpdbSchema, request.body);
    return createPpdbApplicant(app.prisma, auth, params.schoolId, body, meta);
  });

  app.patch("/schools/:schoolId/ppdb/applicants/:applicantId", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(applicantParamsSchema, request.params);
    const body = parseInput(updatePpdbStatusSchema, request.body);
    return updatePpdbApplicantStatus(app.prisma, auth, params.schoolId, params.applicantId, body, meta);
  });

  app.get("/schools/:schoolId/whistleblower/reports", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listAnonymousReports(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/whistleblower/reports", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(createWhistleblowerSchema, request.body);
    return createAnonymousReport(app.prisma, auth, params.schoolId, body, meta);
  });

  app.patch("/schools/:schoolId/whistleblower/reports/:reportId", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(reportParamsSchema, request.params);
    const body = parseInput(updateWhistleblowerSchema, request.body);
    return updateAnonymousReport(app.prisma, auth, params.schoolId, params.reportId, body, meta);
  });
}
