import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import { ownerDashboard } from "../academic/dashboard.service.ts";
import { createSchool, deleteSchool, getSchool, listAcademicPeriods, listAuditLogs, listSchools, setSchoolAccessStatus, updateSchool } from "./school.service.ts";
import { schoolAccessStatusSchema, schoolWriteSchema } from "../academic/academic.schema.ts";

const schoolParamsSchema = z.object({
  schoolId: z.string().trim().min(1).max(64),
});

const auditQuerySchema = z.object({
  schoolId: z.string().trim().min(1).max(64).optional(),
});

export async function schoolRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard", { preHandler: requireAuth }, async (request) => {
    return ownerDashboard(app.prisma, getAuth(request));
  });

  app.get("/schools", { preHandler: requireAuth }, async (request) => {
    return { schools: await listSchools(app.prisma, getAuth(request)) };
  });

  app.post("/schools", { preHandler: requireAuth }, async (request, reply) => {
    const body = parseInput(schoolWriteSchema, request.body ?? {});
    const school = await createSchool(app.prisma, getAuth(request), body, requestMeta(request));
    return reply.status(201).send({ school });
  });

  app.patch("/schools/:schoolId/access-status", { preHandler: requireAuth }, async (request) => {
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(schoolAccessStatusSchema, request.body ?? {});
    return {
      school: await setSchoolAccessStatus(app.prisma, getAuth(request), params.schoolId, body, requestMeta(request)),
    };
  });

  app.patch("/schools/:schoolId", { preHandler: requireAuth }, async (request) => {
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(schoolWriteSchema, request.body ?? {});
    return {
      school: await updateSchool(app.prisma, getAuth(request), params.schoolId, body, requestMeta(request)),
    };
  });

  app.delete("/schools/:schoolId", { preHandler: requireAuth }, async (request, reply) => {
    const params = parseInput(schoolParamsSchema, request.params);
    await deleteSchool(app.prisma, getAuth(request), params.schoolId, requestMeta(request));
    return reply.status(204).send();
  });

  app.get("/schools/:schoolId", { preHandler: requireAuth }, async (request) => {
    const params = parseInput(schoolParamsSchema, request.params);
    return {
      school: await getSchool(app.prisma, getAuth(request), params.schoolId, requestMeta(request)),
    };
  });

  app.get("/schools/:schoolId/academic-periods", { preHandler: requireAuth }, async (request) => {
    const params = parseInput(schoolParamsSchema, request.params);
    return {
      academicPeriods: await listAcademicPeriods(
        app.prisma,
        getAuth(request),
        params.schoolId,
        requestMeta(request),
      ),
    };
  });

  app.get("/audit-logs", { preHandler: requireAuth }, async (request) => {
    const query = parseInput(auditQuerySchema, request.query);
    return {
      auditLogs: await listAuditLogs(app.prisma, getAuth(request), query.schoolId, requestMeta(request)),
    };
  });
}
