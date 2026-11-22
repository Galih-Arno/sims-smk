import type { FastifyInstance, FastifyRequest } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  attendanceSettingSchema,
  recapQuerySchema,
  schoolParamsSchema,
  staffPunchSchema,
} from "./hr-attendance.schema.ts";
import {
  checkInStaff,
  checkOutStaff,
  getAttendanceSetting,
  getTodayStaffAttendance,
  listStaffAttendanceRecap,
  updateAttendanceSetting,
} from "./hr-attendance.service.ts";

function ctx(request: FastifyRequest) {
  return {
    auth: getAuth(request),
    meta: requestMeta(request),
    params: parseInput(schoolParamsSchema, request.params),
  };
}

export async function hrAttendanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/staff-attendance/setting", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    return getAttendanceSetting(app.prisma, c.auth, c.params.schoolId, c.meta);
  });

  app.put("/schools/:schoolId/staff-attendance/setting", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    const body = parseInput(attendanceSettingSchema, request.body);
    return updateAttendanceSetting(app.prisma, c.auth, c.params.schoolId, body, c.meta);
  });

  app.get("/schools/:schoolId/staff-attendance/today", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    return getTodayStaffAttendance(app.prisma, c.auth, c.params.schoolId, c.meta);
  });

  app.post("/schools/:schoolId/staff-attendance/check-in", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    const body = parseInput(staffPunchSchema, request.body);
    return checkInStaff(app.prisma, c.auth, c.params.schoolId, body, c.meta);
  });

  app.post("/schools/:schoolId/staff-attendance/check-out", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    const body = parseInput(staffPunchSchema, request.body);
    return checkOutStaff(app.prisma, c.auth, c.params.schoolId, body, c.meta);
  });

  app.get("/schools/:schoolId/staff-attendance/recap", { preHandler: requireAuth }, async (request) => {
    const c = ctx(request);
    const query = parseInput(recapQuerySchema, request.query);
    return listStaffAttendanceRecap(app.prisma, c.auth, c.params.schoolId, query.date, c.meta);
  });
}
