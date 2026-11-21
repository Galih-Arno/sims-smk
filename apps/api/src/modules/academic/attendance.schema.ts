import { z } from "zod";

export const attendanceMeetingParamsSchema = z.object({
  schoolId: z.string().trim().min(1).max(64),
  meetingId: z.string().trim().min(1).max(64),
});

const dateText = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");
const mark = z.enum(["HADIR", "SAKIT", "IZIN", "ALPA"]);

export const attendanceListSchema = z.object({
  assignmentId: z.string().trim().min(1).optional(),
  q: z.string().trim().max(100).optional(),
  from: dateText.optional(),
  to: dateText.optional(),
  page: z.string().trim().optional(),
  pageSize: z.string().trim().optional(),
});

export const attendanceCreateSchema = z.object({
  assignmentId: z.string().trim().min(1),
  meetingDate: dateText,
  sessionNo: z.number().int().min(1).max(20).optional(),
  note: z.string().trim().max(200).nullable().optional(),
  marker: z.string().trim().max(40).nullable().optional(),
  scheduleSlotId: z.string().trim().min(1).nullable().optional(),
});

const recordsSchema = z.object({
  records: z.array(z.object({
    studentId: z.string().trim().min(1),
    status: mark.nullable(),
  })).max(300),
});

export const attendanceDraftSchema = recordsSchema;

export const attendanceCorrectSchema = recordsSchema.extend({
  reason: z.string().trim().min(5, "Alasan koreksi minimal 5 karakter.").max(500),
});

export const attendanceRecapQuerySchema = z.object({
  homeroomId: z.string().trim().min(1).optional(),
  from: dateText.optional(),
  to: dateText.optional(),
});

const dailyRecordsSchema = z.object({
  homeroomId: z.string().trim().min(1),
  attendanceDate: dateText,
  records: z.array(z.object({
    studentId: z.string().trim().min(1),
    status: mark.nullable(),
    note: z.string().trim().max(200).nullable(),
  })).max(300),
});

export const dailyAttendanceQuerySchema = z.object({
  homeroomId: z.string().trim().min(1).optional(),
  date: dateText.optional(),
});

export const dailyAttendanceDraftSchema = dailyRecordsSchema;

export const dailyAttendanceCorrectSchema = dailyRecordsSchema.extend({
  reason: z.string().trim().min(5, "Alasan koreksi minimal 5 karakter.").max(500),
});

export const attendanceCompletenessSaveSchema = z.object({
  days: z.array(z.object({
    date: dateText,
    kind: z.enum(["PEMBELAJARAN", "LIBUR", "TIDAK_WAJIB"]),
    note: z.string().trim().max(200).nullable().optional(),
  })).max(400),
});
