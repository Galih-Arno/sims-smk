import { z } from "zod";
import { ROLE_DEFINITIONS, type RoleCode } from "@sims/shared";

export const ASSIGNABLE_ROLE_CODES = ROLE_DEFINITIONS.filter((role) => role.scope === "SCHOOL").map((role) => role.code);

const roleCode = z.string().trim().superRefine((value, context) => {
  if (value === "SYSTEM_OWNER") {
    context.addIssue({ code: "custom", message: "Peran pemilik sistem tidak dapat diberikan oleh admin sekolah." });
    return;
  }
  if (!ASSIGNABLE_ROLE_CODES.includes(value as RoleCode)) {
    context.addIssue({ code: "custom", message: "Peran tidak dikenal." });
  }
});

export const schoolParamsSchema = z.object({
  schoolId: z.string().trim().min(1),
});

export const schoolUserParamsSchema = schoolParamsSchema.extend({
  id: z.string().trim().min(1),
});

export const schoolUserListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.string().trim().min(1).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  page: z.preprocess((value) => (value === undefined || value === "" ? "1" : value), z.coerce.number().int().positive()),
  pageSize: z.preprocess(
    (value) => (value === undefined || value === "" ? "10" : value),
    z.enum(["10", "25", "50"]),
  ),
});

export const schoolUserCreateSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120, "Nama maksimal 120 karakter."),
  email: z.string().trim().email("Email tidak valid.").max(254).transform((value) => value.toLowerCase()),
  roles: z.array(roleCode).min(1, "Pilih minimal satu peran.").max(ASSIGNABLE_ROLE_CODES.length),
  teacherId: z.string().trim().min(1).nullable().optional(),
});

export const schoolUserRolesSchema = z.object({
  roles: z.array(roleCode).min(1, "Pengguna wajib memiliki minimal satu peran.").max(ASSIGNABLE_ROLE_CODES.length),
  teacherId: z.string().trim().min(1).nullable().optional(),
});

export const schoolUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export type SchoolUserCreateInput = z.infer<typeof schoolUserCreateSchema>;
export type SchoolUserRolesInput = z.infer<typeof schoolUserRolesSchema>;
