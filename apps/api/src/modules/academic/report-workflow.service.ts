import { Prisma, type PrismaClient, type ReportCardStatus } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { notFound } from "./common.ts";
import { reportFingerprint, snapshotPayload, type PreviewContext, type PreviewStudent } from "./report-card/fingerprint.ts";
import { readEnrichedHomeroomPreview } from "./report-card/preview.service.ts";

type Loaded = { context: PreviewContext; student: PreviewStudent; fingerprint: string };

function role(auth: AuthState, schoolId: string, code: string): boolean {
  return auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === code);
}

function canStage(auth: AuthState, schoolId: string, code: string): boolean {
  return auth.isSystemOwner || role(auth, schoolId, code);
}

function requireReason(reason: string | undefined): string {
  const text = reason?.trim() ?? "";
  if (text.length < 10) throw new AppError(400, "VALIDATION_ERROR", "Alasan minimal 10 karakter.");
  return text;
}

async function waliHomerooms(prisma: PrismaClient, auth: AuthState, schoolId: string) {
  if (!role(auth, schoolId, "WALI_KELAS")) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const teacher = await prisma.teacher.findFirst({ where: { schoolId, userId: auth.userId, isActive: true }, select: { id: true } });
  return prisma.homeroomAssignment.findMany({
    where: { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } },
    select: { id: true, classId: true, academicPeriodId: true, class: { select: { name: true } }, academicPeriod: { select: { name: true, academicYearId: true } } },
    orderBy: { class: { name: "asc" } },
  });
}

async function loadStudent(prisma: PrismaClient, schoolId: string, homeroomId: string, studentId: string): Promise<Loaded> {
  const preview = await readEnrichedHomeroomPreview(prisma, schoolId, homeroomId);
  const student = preview?.students.find((item) => item.studentId === studentId);
  if (!preview || !student) throw new AppError(400, "INVALID_REFERENCE", "Siswa tidak termasuk kelas binaan pada semester aktif.");
  return { context: preview, student, fingerprint: reportFingerprint(preview, student) };
}

function effectiveReview(latest: { fingerprint: string; reviewedAt: Date } | null, current: string, resetAt: Date | null): "SUDAH_DIPERIKSA" | "BELUM_DIPERIKSA" {
  if (!latest || latest.fingerprint !== current) return "BELUM_DIPERIKSA";
  if (resetAt && latest.reviewedAt <= resetAt) return "BELUM_DIPERIKSA";
  return "SUDAH_DIPERIKSA";
}

async function latestReview(prisma: PrismaClient, schoolId: string, studentId: string, academicPeriodId: string) {
  return prisma.reportReview.findFirst({
    where: { schoolId, studentId, academicPeriodId },
    orderBy: { reviewedAt: "desc" },
    select: { fingerprint: true, reviewedAt: true, reviewedById: true },
  });
}

export async function getReportExaminations(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const homerooms = await waliHomerooms(prisma, auth, schoolId);
  const selected = homeroomId ? homerooms.find((item) => item.id === homeroomId) : homerooms[0];
  if (homeroomId && !selected) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const listed = homerooms.map((item) => ({ id: item.id, className: item.class.name, periodName: item.academicPeriod.name }));
  if (!selected) return { homerooms: listed, summary: emptySummary(), rows: [] };
  const preview = await readEnrichedHomeroomPreview(prisma, schoolId, selected.id);
  if (!preview) return { homerooms: listed, summary: emptySummary(), rows: [] };
  const studentIds = preview.students.map((student) => student.studentId);
  const [reviews, workflows] = await Promise.all([
    prisma.reportReview.findMany({
      where: { schoolId, academicPeriodId: selected.academicPeriodId, studentId: { in: studentIds } },
      orderBy: { reviewedAt: "desc" },
      select: { studentId: true, fingerprint: true, reviewedAt: true },
    }),
    prisma.reportCardWorkflow.findMany({
      where: { schoolId, academicPeriodId: selected.academicPeriodId, studentId: { in: studentIds } },
      select: { studentId: true, status: true, fingerprint: true, reviewResetAt: true },
    }),
  ]);
  const reviewByStudent = new Map<string, { fingerprint: string; reviewedAt: Date }>();
  for (const review of reviews) if (!reviewByStudent.has(review.studentId)) reviewByStudent.set(review.studentId, review);
  const workflowByStudent = new Map(workflows.map((item) => [item.studentId, item]));
  const rows = preview.students.map((student) => {
    const fingerprint = reportFingerprint(preview, student);
    const workflow = workflowByStudent.get(student.studentId);
    const reviewStatus = effectiveReview(reviewByStudent.get(student.studentId) ?? null, fingerprint, workflow?.reviewResetAt ?? null);
    return {
      studentId: student.studentId,
      name: student.name,
      nis: student.nis,
      nisn: student.fields.find((field) => field.key === "nisn")?.value ?? null,
      dataStatus: student.dataStatus,
      printStatus: student.printStatus,
      printLabel: student.printLabel,
      reviewStatus,
      workflowStatus: workflow?.status ?? "DRAF" as ReportCardStatus,
      stale: Boolean(workflow?.fingerprint && workflow.fingerprint !== fingerprint && workflow.status !== "DRAF" && workflow.status !== "DIKEMBALIKAN"),
      blockers: student.blockers,
    };
  });
  return {
    homerooms: listed,
    homeroomId: selected.id,
    academicPeriodId: selected.academicPeriodId,
    summary: summarize(rows),
    rows,
  };
}

export async function reviewReportCard(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { homeroomId: string; studentId: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const homerooms = await waliHomerooms(prisma, auth, schoolId);
  const selected = homerooms.find((item) => item.id === input.homeroomId);
  if (!selected) throw new AppError(403, "FORBIDDEN", "Pemeriksaan rapor hanya dapat dilakukan oleh wali kelas yang berwenang.");
  const loaded = await loadStudent(prisma, schoolId, selected.id, input.studentId);
  const review = await prisma.reportReview.create({
    data: {
      schoolId,
      studentId: input.studentId,
      classId: selected.classId,
      homeroomAssignmentId: selected.id,
      academicPeriodId: selected.academicPeriodId,
      fingerprint: loaded.fingerprint,
      reviewedById: auth.userId,
    },
  });
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "REPORT_CARD_REVIEWED",
    entityType: "ReportReview",
    entityId: review.id,
    metadata: { studentId: input.studentId, academicPeriodId: selected.academicPeriodId, fingerprint: loaded.fingerprint },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return { reviewStatus: "SUDAH_DIPERIKSA" as const, reviewedAt: review.reviewedAt, fingerprint: loaded.fingerprint };
}

export async function submitReportCard(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { homeroomId: string; studentId: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const homerooms = await waliHomerooms(prisma, auth, schoolId);
  const selected = homerooms.find((item) => item.id === input.homeroomId);
  if (!selected || !role(auth, schoolId, "WALI_KELAS")) throw new AppError(403, "FORBIDDEN", "Pengajuan rapor hanya dapat dilakukan oleh wali kelas yang berwenang.");
  const loaded = await loadStudent(prisma, schoolId, selected.id, input.studentId);
  if (loaded.student.printStatus !== "SIAP_CETAK") throw new AppError(409, "CONFLICT", "Rapor belum lengkap dan tidak dapat diajukan.");
  const yearId = selected.academicPeriod.academicYearId;
  if (!yearId) throw new AppError(409, "CONFLICT", "Semester belum terikat tahun pelajaran.");
  const [review, workflow] = await Promise.all([
    latestReview(prisma, schoolId, input.studentId, selected.academicPeriodId),
    prisma.reportCardWorkflow.findUnique({ where: { studentId_academicPeriodId: { studentId: input.studentId, academicPeriodId: selected.academicPeriodId } } }),
  ]);
  if (workflow && workflow.schoolId !== schoolId) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (effectiveReview(review, loaded.fingerprint, workflow?.reviewResetAt ?? null) !== "SUDAH_DIPERIKSA") {
    throw new AppError(409, "CONFLICT", "Rapor harus diperiksa ulang sebelum diajukan.");
  }
  if (workflow && (workflow.status === "DIAJUKAN" || workflow.status === "DISETUJUI_WAKAKUR" || workflow.status === "DISAHKAN")) {
    throw new AppError(409, "CONFLICT", "Rapor ini sedang dalam proses pengesahan.");
  }
  const saved = await prisma.$transaction(async (tx) => {
    const next = workflow
      ? await tx.reportCardWorkflow.update({
          where: { id: workflow.id },
          data: {
            status: "DIAJUKAN",
            fingerprint: loaded.fingerprint,
            submittedAt: new Date(),
            submittedById: auth.userId,
            classId: selected.classId,
            homeroomAssignmentId: selected.id,
            wakakurDecidedAt: null,
            wakakurDecidedById: null,
            wakakurReason: null,
            principalReason: null,
          },
        })
      : await tx.reportCardWorkflow.create({
          data: {
            schoolId,
            studentId: input.studentId,
            classId: selected.classId,
            homeroomAssignmentId: selected.id,
            academicYearId: yearId,
            academicPeriodId: selected.academicPeriodId,
            status: "DIAJUKAN",
            fingerprint: loaded.fingerprint,
            submittedAt: new Date(),
            submittedById: auth.userId,
          },
        });
    await recordEvent(tx, schoolId, next.id, "REPORT_CARD_SUBMITTED", workflow?.status ?? null, "DIAJUKAN", auth.userId, null, loaded.fingerprint);
    await audit(tx, auth, meta, schoolId, next.id, "REPORT_CARD_SUBMITTED", { studentId: input.studentId, fingerprint: loaded.fingerprint });
    return next;
  });
  return { status: saved.status, fingerprint: saved.fingerprint };
}

export async function getReportQueue(prisma: PrismaClient, auth: AuthState, schoolId: string, stage: "DIAJUKAN" | "DISETUJUI_WAKAKUR" | "DISAHKAN", meta: RequestMeta) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (stage === "DIAJUKAN" && !canStage(auth, schoolId, "WAKAKUR")) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (stage !== "DIAJUKAN" && !canStage(auth, schoolId, "KEPALA_SEKOLAH")) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const workflows = await prisma.reportCardWorkflow.findMany({
    where: { schoolId, status: stage, academicPeriod: { isActive: true } },
    include: { student: { select: { name: true, nis: true, nisn: true } }, class: { select: { name: true } }, academicPeriod: { select: { name: true } } },
    orderBy: [{ class: { name: "asc" } }, { student: { name: "asc" } }],
  });
  const rows = [];
  for (const workflow of workflows) {
    const loaded = await loadStudent(prisma, schoolId, workflow.homeroomAssignmentId, workflow.studentId).catch(() => null);
    rows.push({
      studentId: workflow.studentId,
      academicPeriodId: workflow.academicPeriodId,
      name: workflow.student.name,
      nis: workflow.student.nis,
      nisn: workflow.student.nisn,
      className: workflow.class.name,
      periodName: workflow.academicPeriod.name,
      status: workflow.status,
      stale: !loaded || loaded.fingerprint !== workflow.fingerprint || loaded.student.printStatus !== "SIAP_CETAK",
      printStatus: loaded?.student.printStatus ?? "DRAF",
    });
  }
  return { rows };
}

export async function decideReportValidation(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { studentId: string; academicPeriodId: string; decision: "approve" | "return" | "endorse"; reason?: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!canStage(auth, schoolId, "WAKAKUR")) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (input.decision === "endorse") throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  return transition(prisma, auth, schoolId, input, "DIAJUKAN", input.decision === "approve" ? "DISETUJUI_WAKAKUR" : "DIKEMBALIKAN", meta);
}

export async function decideReportEndorsement(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { studentId: string; academicPeriodId: string; decision: "approve" | "return" | "endorse"; reason?: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!canStage(auth, schoolId, "KEPALA_SEKOLAH")) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (input.decision === "approve") throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  return transition(prisma, auth, schoolId, input, "DISETUJUI_WAKAKUR", input.decision === "endorse" ? "DISAHKAN" : "DIKEMBALIKAN", meta);
}

export async function openReportRevision(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { studentId: string; academicPeriodId: string; reason: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!canStage(auth, schoolId, "WAKAKUR") && !canStage(auth, schoolId, "KEPALA_SEKOLAH")) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const reason = input.reason.trim();
  const workflow = await ownedWorkflow(prisma, schoolId, input.studentId, input.academicPeriodId);
  if (workflow.status !== "DISAHKAN") throw new AppError(409, "CONFLICT", "Revisi hanya untuk rapor yang sudah disahkan.");
  await prisma.$transaction(async (tx) => {
    await tx.reportCardWorkflow.update({
      where: { id: workflow.id },
      data: { status: "DIKEMBALIKAN", activeSnapshotId: null, reviewResetAt: new Date(), principalReason: reason, fingerprint: null },
    });
    await recordEvent(tx, schoolId, workflow.id, "REPORT_CARD_REVISION_OPENED", "DISAHKAN", "DIKEMBALIKAN", auth.userId, reason, null);
    await audit(tx, auth, meta, schoolId, workflow.id, "REPORT_CARD_REVISION_OPENED", { studentId: input.studentId, reason });
  });
  return { status: "DIKEMBALIKAN" as const };
}

export async function getReportDossier(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  studentId: string,
  academicPeriodId: string,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const workflow = await prisma.reportCardWorkflow.findUnique({
    where: { studentId_academicPeriodId: { studentId, academicPeriodId } },
    include: { events: { orderBy: { createdAt: "asc" } } },
  });
  const homeroom = workflow
    ? await prisma.homeroomAssignment.findFirst({ where: { id: workflow.homeroomAssignmentId, schoolId }, select: { id: true, teacher: { select: { userId: true } } } })
    : await prisma.homeroomAssignment.findFirst({
        where: { schoolId, academicPeriodId, academicPeriod: { isActive: true }, class: { students: { some: { id: studentId, isActive: true } } } },
        select: { id: true, teacher: { select: { userId: true } } },
      });
  if (!homeroom) notFound();
  const wali = homeroom.teacher.userId === auth.userId && role(auth, schoolId, "WALI_KELAS");
  const staff = canStage(auth, schoolId, "WAKAKUR") || canStage(auth, schoolId, "KEPALA_SEKOLAH");
  if (!wali && !staff) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const loaded = await loadStudent(prisma, schoolId, homeroom.id, studentId);
  const reviews = await prisma.reportReview.findMany({
    where: { schoolId, studentId, academicPeriodId },
    orderBy: { reviewedAt: "desc" },
    select: { id: true, fingerprint: true, reviewedAt: true, reviewedById: true },
  });
  const reviewStatus = effectiveReview(reviews[0] ?? null, loaded.fingerprint, workflow?.reviewResetAt ?? null);
  return {
    context: { className: loaded.context.className, yearName: loaded.context.yearName, periodName: loaded.context.periodName, curriculumLabel: loaded.context.curriculumLabel, homeroomId: homeroom.id, academicPeriodId },
    student: loaded.student,
    fingerprint: loaded.fingerprint,
    reviewStatus,
    reviews,
    workflow: workflow ? { status: workflow.status, fingerprint: workflow.fingerprint, version: workflow.version, activeSnapshotId: workflow.activeSnapshotId, wakakurReason: workflow.wakakurReason, principalReason: workflow.principalReason } : null,
    events: workflow?.events ?? [],
  };
}

async function transition(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { studentId: string; academicPeriodId: string; reason?: string },
  from: ReportCardStatus,
  to: ReportCardStatus,
  meta: RequestMeta,
) {
  const workflow = await ownedWorkflow(prisma, schoolId, input.studentId, input.academicPeriodId);
  if (workflow.status !== from) throw new AppError(409, "CONFLICT", "Status rapor tidak sesuai untuk keputusan ini.");
  const loaded = await loadStudent(prisma, schoolId, workflow.homeroomAssignmentId, input.studentId);
  const returning = to === "DIKEMBALIKAN";
  if (!returning && (loaded.fingerprint !== workflow.fingerprint || loaded.student.printStatus !== "SIAP_CETAK")) {
    throw new AppError(409, "CONFLICT", "Data rapor berubah setelah pengajuan. Keputusan tidak dapat memakai data lama.");
  }
  const reason = returning ? requireReason(input.reason) : null;
  await prisma.$transaction(async (tx) => {
    if (to === "DISAHKAN") {
      const version = workflow.version + 1;
      const endorsedAt = new Date();
      const snapshot = await tx.reportCardSnapshot.create({
        data: {
          schoolId,
          workflowId: workflow.id,
          studentId: workflow.studentId,
          academicPeriodId: workflow.academicPeriodId,
          version,
          fingerprint: loaded.fingerprint,
          payload: snapshotPayload(loaded.context, loaded.student, { version, endorsedAt: endorsedAt.toISOString(), endorsedById: auth.userId }) as Prisma.InputJsonValue,
          endorsedById: auth.userId,
          endorsedAt,
        },
      });
      await tx.reportCardWorkflow.update({
        where: { id: workflow.id },
        data: { status: "DISAHKAN", version, activeSnapshotId: snapshot.id, endorsedAt, endorsedById: auth.userId, principalReason: null },
      });
    } else {
      await tx.reportCardWorkflow.update({
        where: { id: workflow.id },
        data: returning
          ? { status: to, reviewResetAt: new Date(), ...(from === "DIAJUKAN" ? { wakakurReason: reason, wakakurDecidedAt: new Date(), wakakurDecidedById: auth.userId } : { principalReason: reason }) }
          : { status: to, wakakurDecidedAt: new Date(), wakakurDecidedById: auth.userId, wakakurReason: null },
      });
    }
    const action = to === "DISAHKAN" ? "REPORT_CARD_ENDORSED" : to === "DISETUJUI_WAKAKUR" ? "REPORT_CARD_APPROVED" : "REPORT_CARD_RETURNED";
    await recordEvent(tx, schoolId, workflow.id, action, from, to, auth.userId, reason, loaded.fingerprint);
    await audit(tx, auth, meta, schoolId, workflow.id, action, { studentId: input.studentId, fingerprint: loaded.fingerprint, reason });
  });
  return { status: to };
}

async function ownedWorkflow(prisma: PrismaClient, schoolId: string, studentId: string, academicPeriodId: string) {
  const workflow = await prisma.reportCardWorkflow.findUnique({ where: { studentId_academicPeriodId: { studentId, academicPeriodId } } });
  if (!workflow || workflow.schoolId !== schoolId) notFound();
  return workflow;
}

async function recordEvent(tx: Prisma.TransactionClient, schoolId: string, workflowId: string, action: string, fromStatus: ReportCardStatus | null, toStatus: ReportCardStatus, actorId: string, reason: string | null, fingerprint: string | null) {
  await tx.reportCardEvent.create({ data: { schoolId, workflowId, action, fromStatus, toStatus, actorId, reason, fingerprint } });
}

async function audit(tx: Prisma.TransactionClient, auth: AuthState, meta: RequestMeta, schoolId: string, entityId: string, action: string, metadata: Prisma.InputJsonValue) {
  await writeAudit(tx, { schoolId, actorId: auth.userId, action, entityType: "ReportCardWorkflow", entityId, metadata, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
}

function emptySummary() {
  return { total: 0, lengkap: 0, diperiksa: 0, menungguWakakur: 0, menungguKepala: 0, disahkan: 0 };
}

function summarize(rows: Array<{ printStatus: string; reviewStatus: string; workflowStatus: ReportCardStatus }>) {
  return {
    total: rows.length,
    lengkap: rows.filter((row) => row.printStatus === "SIAP_CETAK").length,
    diperiksa: rows.filter((row) => row.reviewStatus === "SUDAH_DIPERIKSA").length,
    menungguWakakur: rows.filter((row) => row.workflowStatus === "DIAJUKAN").length,
    menungguKepala: rows.filter((row) => row.workflowStatus === "DISETUJUI_WAKAKUR").length,
    disahkan: rows.filter((row) => row.workflowStatus === "DISAHKAN").length,
  };
}
