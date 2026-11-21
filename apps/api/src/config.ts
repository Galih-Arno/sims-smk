import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: resolve(packageRoot, ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Konfigurasi environment tidak valid. ${details}`);
}

if (parsed.data.NODE_ENV === "test" && !parsed.data.DATABASE_URL.includes("sims_smk_test")) {
  throw new Error("NODE_ENV=test wajib memakai database sims_smk_test.");
}

if (parsed.data.NODE_ENV === "production" && parsed.data.COOKIE_SECURE !== "true") {
  throw new Error("COOKIE_SECURE harus true di production.");
}

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  apiPort: parsed.data.API_PORT,
  webOrigin: parsed.data.WEB_ORIGIN,
  cookieSecure: parsed.data.COOKIE_SECURE === "true",
  databaseUrl: parsed.data.DATABASE_URL,
  testDatabaseUrl: parsed.data.TEST_DATABASE_URL ?? null,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  jwtAccessTtlSeconds: parsed.data.JWT_ACCESS_TTL_SECONDS,
  jwtRefreshTtlDays: parsed.data.JWT_REFRESH_TTL_DAYS,
  loginMaxAttempts: parsed.data.LOGIN_MAX_ATTEMPTS,
  loginLockMinutes: parsed.data.LOGIN_LOCK_MINUTES,
  jwtIssuer: "sims-smk",
  jwtAudience: "sims-api",
  packageRoot,
};

export const AUTH_COOKIE_PATH = "/api/v1/auth";
export const REFRESH_COOKIE = "sims_refresh";
