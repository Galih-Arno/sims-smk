import type { FastifyInstance, FastifyRequest } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import { leaveCreateSchema, leaveIdParamsSchema, leaveReviewSchema, schoolParamsSchema } from "./leave.schema.ts";
import { createLeaveRequest, listLeaveRequests, reviewLeaveRequest } from "./leave.service.ts";

function schoolCtx(request: FastifyRequest) {
  return {
    auth: getAuth(request),
    meta: requestMeta(request),
    params: parseInput(schoolParamsSchema, request.params),
  };
}

export async function leaveRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/leave-requests", { preHandler: requireAuth }, async (request) => {
    const c = schoolCtx(request);
    return listLeaveRequests(app.prisma, c.auth, c.params.schoolId, c.meta);
  });

  app.post("/schools/:schoolId/leave-requests", { preHandler: requireAuth }, async (request) => {
    const c = schoolCtx(request);
    const body = parseInput(leaveCreateSchema, request.body);
    return createLeaveRequest(app.prisma, c.auth, c.params.schoolId, body, c.meta);
  });

  app.post("/schools/:schoolId/leave-requests/:id/review", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(leaveIdParamsSchema, request.params);
    const body = parseInput(leaveReviewSchema, request.body);
    return reviewLeaveRequest(app.prisma, auth, params.schoolId, params.id, body, meta);
  });
}
