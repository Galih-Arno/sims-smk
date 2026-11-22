import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const logVerifyParamsSchema = z.object({
  schoolId: z.string().min(1),
  logId: z.string().min(1),
});

export const placementCreateSchema = z.object({
  studentId: z.string().min(1),
  companyName: z.string().min(2).max(200),
  companyAddress: z.string().max(400).optional().nullable(),
  supervisorName: z.string().max(120).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const internshipLogCreateSchema = z.object({
  placementId: z.string().min(1),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activity: z.string().min(3).max(2000),
  locationNote: z.string().max(300).optional().nullable(),
});

export const internshipLogVerifySchema = z.object({
  status: z.enum(["DISETUJUI", "REVISI"]),
});
