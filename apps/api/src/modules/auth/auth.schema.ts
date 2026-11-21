import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email wajib diisi." })
    .trim()
    .min(1, "Email wajib diisi.")
    .max(254, "Email terlalu panjang.")
    .email("Email tidak valid.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ required_error: "Kata sandi wajib diisi." })
    .min(1, "Kata sandi wajib diisi.")
    .max(128, "Kata sandi terlalu panjang."),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(512).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Kata sandi saat ini wajib diisi.").max(128, "Kata sandi terlalu panjang."),
  newPassword: z
    .string()
    .min(10, "Kata sandi baru minimal 10 karakter.")
    .max(128, "Kata sandi terlalu panjang."),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
