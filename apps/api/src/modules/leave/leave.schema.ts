import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const leaveIdParamsSchema = z.object({
  schoolId: z.string().min(1),
  id: z.string().min(1),
});

export const leaveCreateSchema = z.object({
  leaveType: z.enum(["CUTI", "IZIN", "SAKIT", "DINAS_LUAR_SPD"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(3).max(1000),
  attachmentUrl: z.string().max(500).optional().nullable(),
});

export const leaveReviewSchema = z.object({
  status: z.enum(["DISETUJUI", "DITOLAK"]),
  reviewNote: z.string().max(500).optional().nullable(),
});
