import type { ZodType } from "zod";
import { AppError } from "./errors.ts";
import { MSG } from "./messages.ts";

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      MSG.validation,
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
