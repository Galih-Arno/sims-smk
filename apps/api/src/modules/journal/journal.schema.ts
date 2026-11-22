import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const journalListQuerySchema = z.object({
  teachingAssignmentId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const journalUpsertSchema = z.object({
  teachingAssignmentId: z.string().min(1),
  attendanceMeetingId: z.string().min(1).optional().nullable(),
  learningObjectiveId: z.string().min(1).optional().nullable(),
  journalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionNo: z.number().int().min(1).max(12).default(1),
  topic: z.string().min(3).max(300),
  activities: z.string().min(5).max(2000),
  studentNotes: z.string().max(1000).optional().nullable(),
  photoUrl: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});
