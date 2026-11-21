import { z } from "zod";

export const competencyDescriptionQuerySchema = z.object({
  assignmentId: z.string().trim().min(1).optional(),
});

export const competencyDescriptionSaveSchema = z.object({
  assignmentId: z.string().trim().min(1),
  students: z.array(z.object({
    studentId: z.string().trim().min(1),
    text: z.string().trim().max(2000),
  })).max(300),
});

export const competencyDescriptionSubmitSchema = z.object({
  assignmentId: z.string().trim().min(1),
});

export const competencyDescriptionRevisionSchema = z.object({
  assignmentId: z.string().trim().min(1),
  reason: z.string().trim().min(10, "Alasan revisi minimal 10 karakter.").max(500),
});

export const competencyDescriptionDecisionSchema = z.object({
  assignmentId: z.string().trim().min(1),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export const homeroomDescriptionQuerySchema = z.object({
  homeroomId: z.string().trim().min(1).optional(),
});
