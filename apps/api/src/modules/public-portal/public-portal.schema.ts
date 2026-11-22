import { z } from "zod";

export const schoolParamsSchema = z.object({
  schoolId: z.string().min(1),
});

export const applicantParamsSchema = z.object({
  schoolId: z.string().min(1),
  applicantId: z.string().min(1),
});

export const reportParamsSchema = z.object({
  schoolId: z.string().min(1),
  reportId: z.string().min(1),
});

export const createPpdbSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  nisn: z.string().trim().max(20).optional(),
  originSchool: z.string().trim().min(2).max(160),
  chosenMajor: z.string().trim().min(2).max(120),
  parentPhone: z.string().trim().min(6).max(32),
  averageScore: z.number().min(0).max(100).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const updatePpdbStatusSchema = z.object({
  status: z.enum(["MENDAFTAR", "TERVERIFIKASI", "DITERIMA", "CADANGAN", "DITOLAK"]),
  notes: z.string().trim().max(300).optional(),
});

export const createWhistleblowerSchema = z.object({
  category: z.enum(["PERUNDUNGAN_BULLYING", "KEKERASAN_FISIK_VERBAL", "FASILITAS_KEAMANAN", "LAINNYA"]).default("PERUNDUNGAN_BULLYING"),
  incidentPlace: z.string().trim().max(160).optional(),
  description: z.string().trim().min(10).max(2000),
});

export const updateWhistleblowerSchema = z.object({
  status: z.enum(["BARU", "DITINDAKLANJUTI", "SELESAI"]),
  counselorReply: z.string().trim().max(1000).optional(),
});
