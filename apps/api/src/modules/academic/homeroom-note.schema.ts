import { z } from "zod";

export const homeroomNoteQuerySchema = z.object({
  homeroomId: z.string().trim().min(1).optional(),
});

export const homeroomNoteSaveSchema = z.object({
  homeroomId: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
  text: z.string().trim().min(1, "Catatan wali kelas tidak boleh kosong.").max(2000),
});

export const homeroomNoteCorrectSchema = homeroomNoteSaveSchema.extend({
  reason: z.string().trim().min(10, "Alasan koreksi minimal 10 karakter.").max(500),
});
