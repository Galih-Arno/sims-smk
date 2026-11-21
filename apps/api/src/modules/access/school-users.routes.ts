import type { FastifyInstance, FastifyRequest } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  schoolParamsSchema,
  schoolUserCreateSchema,
  schoolUserListSchema,
  schoolUserParamsSchema,
  schoolUserRolesSchema,
  schoolUserStatusSchema,
} from "./school-users.schema.ts";
import {
  createSchoolUser,
  listLinkableTeachers,
  listSchoolUsers,
  resetSchoolUserPassword,
  setSchoolUserStatus,
  updateSchoolUserRoles,
} from "./school-users.service.ts";

function context(request: FastifyRequest) {
  return {
    auth: getAuth(request),
    meta: requestMeta(request),
    params: parseInput(schoolParamsSchema, request.params),
  };
}

export async function schoolUserRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/users/teachers", { preHandler: requireAuth }, async (request) => {
    const current = context(request);
    return listLinkableTeachers(app.prisma, current.auth, current.params.schoolId, current.meta);
  });
  app.get("/schools/:schoolId/users", { preHandler: requireAuth }, async (request) => {
    const current = context(request);
    const query = parseInput(schoolUserListSchema, request.query);
    return listSchoolUsers(app.prisma, current.auth, current.params.schoolId, {
      q: query.q,
      role: query.role,
      status: query.status,
      page: Number(query.page),
      pageSize: Number(query.pageSize) as 10 | 25 | 50,
    }, current.meta);
  });
  app.post("/schools/:schoolId/users", { preHandler: requireAuth }, async (request, reply) => {
    const current = context(request);
    const result = await createSchoolUser(app.prisma, current.auth, current.params.schoolId, parseInput(schoolUserCreateSchema, request.body ?? {}), current.meta);
    return reply.status(result.created ? 201 : 200).send(result);
  });
  app.patch("/schools/:schoolId/users/:id/roles", { preHandler: requireAuth }, async (request) => {
    const current = context(request);
    const params = parseInput(schoolUserParamsSchema, request.params);
    return updateSchoolUserRoles(app.prisma, current.auth, params.schoolId, params.id, parseInput(schoolUserRolesSchema, request.body ?? {}), current.meta);
  });
  app.post("/schools/:schoolId/users/:id/reset-password", { preHandler: requireAuth }, async (request) => {
    const current = context(request);
    const params = parseInput(schoolUserParamsSchema, request.params);
    return resetSchoolUserPassword(app.prisma, current.auth, params.schoolId, params.id, current.meta);
  });
  app.post("/schools/:schoolId/users/:id/status", { preHandler: requireAuth }, async (request) => {
    const current = context(request);
    const params = parseInput(schoolUserParamsSchema, request.params);
    const body = parseInput(schoolUserStatusSchema, request.body ?? {});
    return setSchoolUserStatus(app.prisma, current.auth, params.schoolId, params.id, body.isActive, current.meta);
  });
}
