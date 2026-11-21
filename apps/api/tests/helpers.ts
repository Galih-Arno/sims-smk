import "./env.ts";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { RoleCode } from "@sims/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { REFRESH_COOKIE } from "../src/config.ts";
import { hashPassword } from "../src/lib/password.ts";

export { REFRESH_COOKIE };
import { ensureRoles, grantAssignment } from "../src/modules/access/assignments.ts";
import { buildApp } from "../src/app.ts";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type TestContext = {
  prisma: PrismaClient;
  app: FastifyInstance;
};

export function migrateTestDatabase(): void {
  execFileSync("npx prisma migrate deploy", {
    cwd: apiRoot,
    env: process.env,
    stdio: "inherit",
    shell: true,
  });
}

export async function createTestContext(): Promise<TestContext> {
  if (!process.env.DATABASE_URL?.includes("sims_smk_test")) {
    throw new Error("Pengujian ditolak di luar database sims_smk_test.");
  }
  const prisma = new PrismaClient();
  const app = await buildApp({ prisma });
  return { prisma, app };
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("sims_smk_test")) {
    throw new Error("Reset ditolak di luar database test.");
  }

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ReportCardEvent",
      "ReportCardWorkflow",
      "ReportCardSnapshot",
      "ReportReview",
      "StudentReportActivity",
      "HomeroomNoteCorrection",
      "HomeroomNote",
      "CompetencyDescriptionEntry",
      "CompetencyDescription",
      "AttendanceCalendarDay",
      "AttendanceCompletenessRule",
      "DailyAttendanceRecord",
      "DailyAttendanceCorrection",
      "DailyAttendance",
      "AttendanceRecord",
      "AttendanceCorrection",
      "AttendanceMeeting",
      "ClassScheduleSlot",
      "FormativeScore",
      "SummativeScore",
      "TermExamScore",
      "GradeFinalResult",
      "GradeComponentSubmission",
      "GradeSubmission",
      "FormativeAssessment",
      "SummativeAssessment",
      "LearningObjective",
      "MaterialScope",
      "CurriculumPlacement",
      "GradeReportPolicy",
      "Curriculum",
      "TeachingAssignment",
      "HomeroomAssignment",
      "Student",
      "SchoolClass",
      "Subject",
      "Teacher",
      "ExpertiseConcentration",
      "ExpertiseProgram",
      "ExpertiseField",
      "RefreshToken",
      "AuditLog",
      "UserRole",
      "AcademicPeriod",
      "AcademicYear",
      "User",
      "Role",
      "School"
    RESTART IDENTITY CASCADE
  `);
  await ensureRoles(prisma);
}

export async function createSchool(
  prisma: PrismaClient,
  input: { name: string; npsn: string },
): Promise<{ id: string; name: string }> {
  return prisma.school.create({
    data: {
      name: input.name,
      npsn: input.npsn,
      address: "Alamat uji",
      isActive: true,
    },
    select: { id: true, name: true },
  });
}

export async function createUser(
  prisma: PrismaClient,
  input: { email: string; name: string; password: string; isActive?: boolean },
): Promise<{ id: string; email: string }> {
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: await hashPassword(input.password),
      isActive: input.isActive ?? true,
    },
    select: { id: true, email: true },
  });
}

export async function assignRole(
  prisma: PrismaClient,
  input: { userId: string; roleCode: RoleCode; schoolId: string | null },
): Promise<void> {
  await grantAssignment(prisma, input);
}

export async function createPeriod(
  prisma: PrismaClient,
  input: { schoolId: string; name: string },
): Promise<void> {
  await prisma.academicPeriod.create({
    data: {
      schoolId: input.schoolId,
      name: input.name,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      isActive: true,
    },
  });
}

export function jsonBody<T>(response: LightMyRequestResponse): T {
  return JSON.parse(response.body) as T;
}

export function readRefreshCookie(response: LightMyRequestResponse): string | null {
  const header = response.headers["set-cookie"];
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const found = values.find((value) => value.startsWith(`${REFRESH_COOKIE}=`));
  if (!found) {
    return null;
  }
  const pair = found.split(";")[0] ?? "";
  const raw = pair.slice(REFRESH_COOKIE.length + 1);
  return raw ? decodeURIComponent(raw) : null;
}

export async function loginRequest(app: FastifyInstance, email: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
}

export function authHeader(accessToken: string): { authorization: string } {
  return { authorization: `Bearer ${accessToken}` };
}

export async function closeTestContext(context: TestContext): Promise<void> {
  await context.app.close();
  await context.prisma.$disconnect();
}
