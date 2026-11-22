import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const attendanceSettingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(15).max(5000),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  lateToleranceMin: z.number().int().min(0).max(180),
  workEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  requireLiveness: z.boolean(),
});

export const staffPunchSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(5000).optional(),
  photoUrl: z.string().max(500).optional(),
  isOutsideDuty: z.boolean().optional().default(false),
  note: z.string().max(300).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export const recapQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
