import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const periodParamsSchema = z.object({
  schoolId: z.string().min(1),
  periodId: z.string().min(1),
});

export const slipParamsSchema = z.object({
  schoolId: z.string().min(1),
  slipId: z.string().min(1),
});

export const createPayrollPeriodSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  title: z.string().trim().min(3).max(120).optional(),
  ratePerJtm: z.number().int().min(0).max(10000000).default(35000),
  ratePerHadir: z.number().int().min(0).max(10000000).default(25000),
  notes: z.string().trim().max(500).optional(),
});

export const updatePayrollSlipSchema = z.object({
  positionBonus: z.number().int().min(0).max(100000000).optional(),
  deductionAmount: z.number().int().min(0).max(100000000).optional(),
  deductionNote: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["DRAFT", "DITERBITKAN", "DIBAYAR"]).optional(),
});
