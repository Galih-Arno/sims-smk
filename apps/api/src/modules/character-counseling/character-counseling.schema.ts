import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const counselingIdParamsSchema = z.object({
  schoolId: z.string().min(1),
  id: z.string().min(1),
});

export const characterRecordCreateSchema = z.object({
  studentId: z.string().min(1),
  recordType: z.enum(["PRESTASI", "PELANGGARAN"]),
  category: z.string().min(2).max(120),
  points: z.number().int().min(1).max(500),
  note: z.string().min(3).max(1000),
});

export const counselingCreateSchema = z.object({
  studentId: z.string().min(1).optional().nullable(),
  isAnonymous: z.boolean().default(false),
  subject: z.string().min(3).max(200),
  description: z.string().min(5).max(2000),
});

export const counselingUpdateSchema = z.object({
  status: z.enum(["BARU", "DIPROSES", "SELESAI"]),
  counselorNote: z.string().max(1000).optional().nullable(),
});
