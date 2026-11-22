import type { FastifyInstance } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  createPayrollPeriodSchema,
  periodParamsSchema,
  schoolParamsSchema,
  slipParamsSchema,
  updatePayrollSlipSchema,
} from "./payroll.schema.ts";
import {
  createPayrollPeriod,
  generatePeriodSlips,
  listMyPayrollSlips,
  listPayrollPeriods,
  listPeriodSlips,
  updatePayrollSlip,
} from "./payroll.service.ts";

export async function payrollRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/payroll/periods", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listPayrollPeriods(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/payroll/periods", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(createPayrollPeriodSchema, request.body);
    return createPayrollPeriod(app.prisma, auth, params.schoolId, body, meta);
  });

  app.post("/schools/:schoolId/payroll/periods/:periodId/generate", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(periodParamsSchema, request.params);
    return generatePeriodSlips(app.prisma, auth, params.schoolId, params.periodId, meta);
  });

  app.get("/schools/:schoolId/payroll/periods/:periodId/slips", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(periodParamsSchema, request.params);
    return listPeriodSlips(app.prisma, auth, params.schoolId, params.periodId, meta);
  });

  app.patch("/schools/:schoolId/payroll/slips/:slipId", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(slipParamsSchema, request.params);
    const body = parseInput(updatePayrollSlipSchema, request.body);
    return updatePayrollSlip(app.prisma, auth, params.schoolId, params.slipId, body, meta);
  });

  app.get("/schools/:schoolId/payroll/my-slips", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listMyPayrollSlips(app.prisma, auth, params.schoolId, meta);
  });
}
