import type { FastifyInstance, FastifyRequest } from "fastify";
import { requestMeta } from "../../lib/tenant.ts";
import { parseInput } from "../../lib/validation.ts";
import { getAuth, requireAuth } from "../auth/auth.routes.ts";
import {
  billCreateSchema,
  billParamsSchema,
  gatewayWebhookSchema,
  parentLinkCreateSchema,
  paymentCreateSchema,
  schoolParamsSchema,
} from "./finance.schema.ts";
import {
  createBill,
  createParentLink,
  handlePaymentGatewayWebhook,
  listBills,
  listParentLinks,
  recordBillPayment,
} from "./finance.service.ts";

export async function financeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/schools/:schoolId/bills", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listBills(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/bills", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(billCreateSchema, request.body);
    return createBill(
      app.prisma,
      auth,
      params.schoolId,
      {
        studentId: body.studentId,
        title: body.title,
        fundBucket: body.fundBucket ?? "KOMITE",
        amount: body.amount,
        dueDate: body.dueDate,
      },
      meta,
    );
  });

  app.post("/schools/:schoolId/bills/:billId/payments", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(billParamsSchema, request.params);
    const body = parseInput(paymentCreateSchema, request.body);
    return recordBillPayment(
      app.prisma,
      auth,
      params.schoolId,
      params.billId,
      {
        amount: body.amount,
        channel: body.channel ?? "TUNAI",
        referenceCode: body.referenceCode,
        idempotencyKey: body.idempotencyKey,
      },
      meta,
    );
  });

  app.get("/schools/:schoolId/parent-links", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    return listParentLinks(app.prisma, auth, params.schoolId, meta);
  });

  app.post("/schools/:schoolId/parent-links", { preHandler: requireAuth }, async (request) => {
    const auth = getAuth(request);
    const meta = requestMeta(request);
    const params = parseInput(schoolParamsSchema, request.params);
    const body = parseInput(parentLinkCreateSchema, request.body);
    return createParentLink(
      app.prisma,
      auth,
      params.schoolId,
      {
        parentUserId: body.parentUserId,
        studentId: body.studentId,
        relation: body.relation ?? "WALI",
      },
      meta,
    );
  });

  app.post("/webhooks/payment-gateway", async (request: FastifyRequest) => {
    const meta = requestMeta(request);
    const body = parseInput(gatewayWebhookSchema, request.body);
    const sig =
      typeof request.headers["x-webhook-signature"] === "string"
        ? request.headers["x-webhook-signature"]
        : undefined;
    return handlePaymentGatewayWebhook(
      app.prisma,
      JSON.stringify(request.body ?? {}),
      sig,
      {
        schoolId: body.schoolId,
        billId: body.billId,
        amount: body.amount,
        channel: body.channel ?? "MIDTRANS",
        orderId: body.orderId,
        transactionStatus: body.transactionStatus,
      },
      meta,
    );
  });
}
