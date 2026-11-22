import type { FastifyInstance } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  createAlumniTracerSchema,
  createBkkJobSchema,
  createToolLoanSchema,
  createToolSchema,
  loanParamsSchema,
  schoolParamsSchema,
} from "./vokasi.schema.ts";
import {
  createAlumniTracer,
  createBkkJob,
  createToolLoan,
  createWorkshopTool,
  listAlumniTracers,
  listBkkJobs,
  listToolLoans,
  listWorkshopTools,
  returnToolLoan,
} from "./vokasi.service.ts";

export async function vokasiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/vokasi/tools", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listWorkshopTools(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/vokasi/tools", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(createToolSchema, request.body);
    return createWorkshopTool(app.prisma, auth, params.schoolId, body, meta);
  });

  app.get("/schools/:schoolId/vokasi/tool-loans", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listToolLoans(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/vokasi/tool-loans", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(createToolLoanSchema, request.body);
    return createToolLoan(app.prisma, auth, params.schoolId, body, meta);
  });

  app.post("/schools/:schoolId/vokasi/tool-loans/:loanId/return", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(loanParamsSchema, request.params);
    return returnToolLoan(app.prisma, auth, params.schoolId, params.loanId, meta);
  });

  app.get("/schools/:schoolId/vokasi/bkk-jobs", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listBkkJobs(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/vokasi/bkk-jobs", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(createBkkJobSchema, request.body);
    return createBkkJob(app.prisma, auth, params.schoolId, body, meta);
  });

  app.get("/schools/:schoolId/vokasi/tracer-study", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listAlumniTracers(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/vokasi/tracer-study", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(createAlumniTracerSchema, request.body);
    return createAlumniTracer(app.prisma, auth, params.schoolId, body, meta);
  });
}
