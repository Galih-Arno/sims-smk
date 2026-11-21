import { z } from "zod";

export const reportExaminationQuerySchema = z.object({
  homeroomId: z.string().trim().min(1).optional(),
  studentId: z.string().trim().min(1).optional(),
});

export const reportReviewSchema = z.object({
  homeroomId: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
});

export const reportDecisionSchema = z.object({
  studentId: z.string().trim().min(1),
  academicPeriodId: z.string().trim().min(1),
  decision: z.enum(["approve", "return", "endorse"]),
  reason: z.string().trim().max(500).optional(),
});

export const reportRevisionSchema = z.object({
  studentId: z.string().trim().min(1),
  academicPeriodId: z.string().trim().min(1),
  reason: z.string().trim().min(10, "Alasan revisi minimal 10 karakter.").max(500),
});

export const reportQueueQuerySchema = z.object({
  view: z.enum(["queue", "endorsed"]).optional(),
});

export const reportPrintQuerySchema = z.object({
  studentId: z.string().trim().min(1),
  academicPeriodId: z.string().trim().min(1),
});

export const reportDossierQuerySchema = z.object({
  studentId: z.string().trim().min(1),
  academicPeriodId: z.string().trim().min(1),
});
