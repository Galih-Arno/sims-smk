import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "../../../lib/auth-state.ts";
import type { RequestMeta } from "../../../lib/tenant.ts";
import { getHomeroomReportPrep, readHomeroomPrep } from "./report-card.service.ts";
import { buildReportPreview, type ReportPreviewDto } from "./preview.ts";
import type { PrintSection } from "./print-readiness.ts";
import type { HomeroomReportPrepDto } from "./types.ts";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export async function getHomeroomReportPreview(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  meta: RequestMeta,
) {
  const prepared = await getHomeroomReportPrep(prisma, auth, schoolId, homeroomId, meta, "REPORT_PREVIEW_READ");
  return { homerooms: prepared.homerooms, preview: prepared.prep ? await withOfficialAvailability(prisma, schoolId, await enrichPrep(prisma, schoolId, prepared.prep)) : null };
}

async function withOfficialAvailability(prisma: PrismaClient, schoolId: string, preview: NonNullable<ReportPreviewDto["preview"]>) {
  const homeroom = await prisma.homeroomAssignment.findFirst({
    where: { id: preview.homeroomId, schoolId },
    select: { academicPeriodId: true },
  });
  const workflows = homeroom
    ? await prisma.reportCardWorkflow.findMany({
        where: {
          schoolId,
          academicPeriodId: homeroom.academicPeriodId,
          status: "DISAHKAN",
          activeSnapshotId: { not: null },
          studentId: { in: preview.students.map((student) => student.studentId) },
        },
        select: { studentId: true, activeSnapshot: { select: { version: true, endorsedAt: true } } },
      })
    : [];
  const official = new Map<string, { version: number; endorsedAt: string }>();
  for (const item of workflows) {
    if (item.activeSnapshot) official.set(item.studentId, { version: item.activeSnapshot.version, endorsedAt: item.activeSnapshot.endorsedAt.toISOString() });
  }
  return {
    ...preview,
    academicPeriodId: homeroom?.academicPeriodId ?? null,
    students: preview.students.map((student) => ({ ...student, official: official.get(student.studentId) ?? null })),
  };
}

export async function readEnrichedHomeroomPreview(prisma: PrismaClient, schoolId: string, homeroomId: string) {
  const prep = await readHomeroomPrep(prisma, schoolId, homeroomId);
  if (!prep) return null;
  return enrichPrep(prisma, schoolId, prep);
}

async function enrichPrep(prisma: PrismaClient, schoolId: string, prep: NonNullable<HomeroomReportPrepDto["prep"]>) {
  const homeroom = await prisma.homeroomAssignment.findFirst({
    where: { id: prep.homeroomId, schoolId },
    select: { academicPeriodId: true, academicPeriod: { select: { reportDate: true } } },
  });
  const studentIds = prep.students.map((student) => student.studentId);
  const activities = homeroom
    ? await prisma.studentReportActivity.findMany({
        where: { schoolId, academicPeriodId: homeroom.academicPeriodId, studentId: { in: studentIds } },
        select: { studentId: true, pklText: true, extracurricularText: true },
      })
    : [];
  const reportDate = formatDate(homeroom?.academicPeriod.reportDate ?? null);
  const byStudent = new Map(activities.map((item) => [item.studentId, item]));
  const sections = new Map<string, PrintSection[]>(studentIds.map((studentId) => {
    const activity = byStudent.get(studentId);
    return [studentId, [
      sourced("pkl", "PKL", activity?.pklText),
      sourced("extracurricular", "Ekstrakurikuler", activity?.extracurricularText),
      sourced("reportDate", "Tanggal rapor", reportDate),
    ]];
  }));
  return buildReportPreview(prep, sections);
}

function sourced(key: string, label: string, value: string | null | undefined): PrintSection {
  const text = value?.trim() ?? "";
  if (!text) return { key, label, status: "BELUM_TERSEDIA", value: null };
  return { key, label, status: "SIAP", value: text };
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}
