import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "../../../lib/auth-state.ts";
import { writeAudit } from "../../../lib/audit.ts";
import { AppError } from "../../../lib/errors.ts";
import { MSG } from "../../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../../lib/tenant.ts";
import { notFound } from "../common.ts";
import { presentOfficialSnapshot, type ReportPrintDocument } from "./print-document.ts";
import { renderReportPdf } from "./pdf.ts";
import { printNotReadyMessage } from "./print-source.ts";

export async function readOfficialReportPrint(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  studentId: string,
  academicPeriodId: string,
  meta: RequestMeta,
): Promise<ReportPrintDocument> {
  const loaded = await loadOfficial(prisma, auth, schoolId, studentId, academicPeriodId, meta);
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "REPORT_CARD_PRINTED",
    entityType: "ReportCardSnapshot",
    entityId: loaded.snapshotId,
    metadata: { studentId, academicPeriodId, version: loaded.document.version, intent: "OFFICIAL_BROWSER" },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return loaded.document;
}

export async function readOfficialReportPdf(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  studentId: string,
  academicPeriodId: string,
  meta: RequestMeta,
): Promise<{ filename: string; body: Buffer }> {
  const loaded = await loadOfficial(prisma, auth, schoolId, studentId, academicPeriodId, meta);
  const body = await renderReportPdf(loaded.document);
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "REPORT_CARD_PDF_DOWNLOADED",
    entityType: "ReportCardSnapshot",
    entityId: loaded.snapshotId,
    metadata: { studentId, academicPeriodId, version: loaded.document.version, intent: "OFFICIAL_PDF" },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  const nis = loaded.document.nis.replace(/[^A-Za-z0-9_-]/g, "") || "siswa";
  return { filename: `rapor-${nis}-v${loaded.document.version ?? 1}.pdf`, body };
}

async function loadOfficial(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  studentId: string,
  academicPeriodId: string,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { classId: true } });
  if (!student?.classId) notFound();
  const workflow = await prisma.reportCardWorkflow.findUnique({
    where: { studentId_academicPeriodId: { studentId, academicPeriodId } },
    include: { activeSnapshot: true, homeroom: { select: { teacher: { select: { userId: true } } } } },
  });
  if (workflow && workflow.schoolId !== schoolId) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const homeroom = workflow ? null : await prisma.homeroomAssignment.findFirst({
    where: { schoolId, classId: student.classId, academicPeriodId },
    select: { teacher: { select: { userId: true } } },
  });
  const assigned = workflow?.homeroom.teacher.userId ?? homeroom?.teacher.userId;
  const wali = assigned === auth.userId && hasRole(auth, schoolId, "WALI_KELAS");
  const staff = auth.isSystemOwner || hasRole(auth, schoolId, "WAKAKUR") || hasRole(auth, schoolId, "KEPALA_SEKOLAH");
  if (!wali && !staff) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const snapshot = workflow?.status === "DISAHKAN" ? workflow.activeSnapshot : null;
  if (!snapshot) throw new AppError(409, "CONFLICT", printNotReadyMessage("OFFICIAL_PDF"));
  let document: ReportPrintDocument;
  try {
    document = presentOfficialSnapshot(snapshot.payload, { version: snapshot.version, endorsedAt: snapshot.endorsedAt });
  } catch {
    throw new AppError(409, "CONFLICT", "Snapshot rapor resmi tidak dapat dicetak.");
  }
  return { snapshotId: snapshot.id, document };
}

function hasRole(auth: AuthState, schoolId: string, code: string): boolean {
  return auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === code);
}
