import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const billParamsSchema = z.object({
  schoolId: z.string().min(1),
  billId: z.string().min(1),
});

export const billCreateSchema = z.object({
  studentId: z.string().min(1),
  title: z.string().min(2).max(180),
  fundBucket: z.string().min(2).max(40).default("KOMITE"),
  amount: z.number().int().positive().max(100_000_000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const paymentCreateSchema = z.object({
  amount: z.number().int().positive().max(100_000_000),
  channel: z.enum(["TUNAI", "TRANSFER_MANUAL", "MIDTRANS", "XENDIT"]).default("TUNAI"),
  referenceCode: z.string().max(120).optional().nullable(),
  idempotencyKey: z.string().min(6).max(100).optional(),
});

export const parentLinkCreateSchema = z.object({
  parentUserId: z.string().min(1),
  studentId: z.string().min(1),
  relation: z.string().min(2).max(40).default("WALI"),
});

export const gatewayWebhookSchema = z.object({
  schoolId: z.string().min(1),
  billId: z.string().min(1),
  amount: z.number().int().positive().max(100_000_000),
  channel: z.enum(["MIDTRANS", "XENDIT"]).default("MIDTRANS"),
  orderId: z.string().min(4).max(100),
  transactionStatus: z.string().min(2).max(40),
});
