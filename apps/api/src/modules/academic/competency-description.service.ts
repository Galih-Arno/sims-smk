import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { readOfficialFinalGrades } from "./grade-final.service.ts";
import { suggestDescription } from "./competency-description.suggest.ts";
import type { ReportDescription } from "./report-card/types.ts";

type WorkflowStatus = "DRAFT" | "SUBMITTED" | "REVISION_REQUESTED";
type FinalStatus = "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI";

type EvidenceStudent = {
  studentId: string;
  finalStatus: FinalStatus;
  finalScore: number | null;
  objectives: Array<{ id: string; uh: number | null; t1: number | null; t2: number | null; t3: number | null; remedial: number | null }>;
  scopes: Array<{ id: string; score: number | null; remedial: number | null }>;
  sts: number | null;
  sas: number | null;
};

type Evidence = { students: EvidenceStudent[] };

const EMPTY_DESCRIPTION: ReportDescription = { status: "BELUM_TERSEDIA", text: null };

export async function getCompetencyDescriptions(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string | undefined,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const teacher = await assignedTeacher(prisma, auth, schoolId);
  const assignments = await prisma.teachingAssignment.findMany({
    where: { schoolId, teacherId: teacher.id, academicPeriod: { isActive: true } },
    select: { id: true, class: { select: { name: true } }, subject: { select: { name: true } }, academicPeriod: { select: { name: true } } },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  const listed = assignments.map((item) => ({
    id: item.id,
    className: item.class.name,
    subjectName: item.subject.name,
    periodName: item.academicPeriod.name,
  }));
  const selectedId = assignmentId ?? assignments[0]?.id;
  if (assignmentId && !assignments.some((item) => item.id === assignmentId)) {
    throw new AppError(403, "FORBIDDEN", "Deskripsi capaian hanya tersedia pada penugasan aktif guru ini.");
  }
  if (!selectedId) return { assignments: listed, sheet: null };
  return { assignments: listed, sheet: await buildSheet(prisma, schoolId, selectedId) };
}

export async function saveCompetencyDescriptionDraft(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  students: Array<{ studentId: string; text: string }>,
  meta: RequestMeta,
) {
  const teacher = await ownedAssignment(prisma, auth, schoolId, assignmentId, meta);
  const current = await prisma.competencyDescription.findUnique({ where: { teachingAssignmentId: assignmentId } });
  if (current && current.status !== "DRAFT") {
    throw new AppError(409, "GRADE_LOCKED", "Deskripsi yang sudah dikirim terkunci. Ajukan revisi kepada wali kelas.");
  }
  const activeIds = new Set((await activeStudents(prisma, schoolId, teacher.classId)).map((item) => item.id));
  const rows = students.filter((item) => activeIds.has(item.studentId) && item.text.trim());
  const saved = await prisma.$transaction(async (tx) => {
    const description = current ?? await tx.competencyDescription.create({
      data: { schoolId, teachingAssignmentId: assignmentId, status: "DRAFT" },
    });
    for (const row of rows) {
      await tx.competencyDescriptionEntry.upsert({
        where: { descriptionId_studentId: { descriptionId: description.id, studentId: row.studentId } },
        create: { schoolId, descriptionId: description.id, studentId: row.studentId, text: row.text.trim() },
        update: { text: row.text.trim() },
      });
    }
    const keep = rows.map((item) => item.studentId);
    await tx.competencyDescriptionEntry.deleteMany({
      where: { descriptionId: description.id, ...(keep.length > 0 ? { studentId: { notIn: keep } } : {}) },
    });
    return description;
  });
  await audit(prisma, auth, meta, schoolId, saved.id, "COMPETENCY_DESCRIPTION_DRAFT_SAVED", {
    teachingAssignmentId: assignmentId,
    students: rows.length,
    status: "DRAFT",
  });
  return { sheet: await buildSheet(prisma, schoolId, assignmentId) };
}

export async function submitCompetencyDescription(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  meta: RequestMeta,
) {
  const teacher = await ownedAssignment(prisma, auth, schoolId, assignmentId, meta);
  const evidence = await loadEvidence(prisma, schoolId, assignmentId, teacher.classId);
  const blocked = evidence.students.flatMap((student) => studentView(student, evidence.plan).warnings);
  if (blocked.length > 0) {
    throw new AppError(400, "INCOMPLETE_GRADES", "Deskripsi belum dapat dikirim karena nilai atau TP/LM belum lengkap.");
  }
  const current = await prisma.competencyDescription.findUnique({
    where: { teachingAssignmentId: assignmentId },
    include: { entries: { select: { studentId: true, text: true } } },
  });
  if (current && current.status !== "DRAFT") {
    throw new AppError(409, "GRADE_LOCKED", "Deskripsi ini sudah dikirim atau sedang menunggu keputusan revisi.");
  }
  const texts = new Map(current?.entries.map((item) => [item.studentId, item.text.trim()]) ?? []);
  if (evidence.students.some((student) => !texts.get(student.studentId))) {
    throw new AppError(400, "INCOMPLETE_GRADES", "Setiap siswa aktif harus memiliki deskripsi sebelum dikirim.");
  }
  const homeroom = await prisma.homeroomAssignment.findFirst({
    where: { schoolId, classId: teacher.classId, academicPeriodId: teacher.academicPeriodId, teacher: { isActive: true } },
    select: { teacherId: true },
  });
  if (!homeroom) throw new AppError(409, "SUBMISSION_HELD", "Pengiriman ditahan karena kelas belum memiliki wali kelas aktif.");
  const now = new Date();
  const saved = current
    ? await prisma.competencyDescription.update({
        where: { id: current.id },
        data: {
          status: "SUBMITTED",
          submittedAt: now,
          submittedById: auth.userId,
          recipientTeacherId: homeroom.teacherId,
          evidenceSnapshot: evidence.snapshot as Prisma.InputJsonValue,
          revisionReason: null,
          revisionRequestedAt: null,
          decidedAt: null,
          decidedById: null,
          decisionNote: null,
        },
      })
    : await prisma.competencyDescription.create({
        data: {
          schoolId,
          teachingAssignmentId: assignmentId,
          status: "SUBMITTED",
          submittedAt: now,
          submittedById: auth.userId,
          recipientTeacherId: homeroom.teacherId,
          evidenceSnapshot: evidence.snapshot as Prisma.InputJsonValue,
        },
      });
  await audit(prisma, auth, meta, schoolId, saved.id, "COMPETENCY_DESCRIPTION_SUBMITTED", {
    teachingAssignmentId: assignmentId,
    previous: current?.status ?? null,
    next: "SUBMITTED",
    recipientTeacherId: homeroom.teacherId,
  });
  return { sheet: await buildSheet(prisma, schoolId, assignmentId) };
}

export async function requestCompetencyDescriptionRevision(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  reason: string,
  meta: RequestMeta,
) {
  await ownedAssignment(prisma, auth, schoolId, assignmentId, meta);
  const current = await prisma.competencyDescription.findUnique({ where: { teachingAssignmentId: assignmentId } });
  if (!current || current.status !== "SUBMITTED") {
    throw new AppError(409, "GRADE_LOCKED", "Revisi hanya dapat diajukan untuk deskripsi yang sudah dikirim.");
  }
  await prisma.competencyDescription.update({
    where: { id: current.id },
    data: { status: "REVISION_REQUESTED", revisionReason: reason, revisionRequestedAt: new Date(), decidedAt: null, decidedById: null, decisionNote: null },
  });
  await audit(prisma, auth, meta, schoolId, current.id, "COMPETENCY_DESCRIPTION_REVISION_REQUESTED", {
    teachingAssignmentId: assignmentId,
    previous: "SUBMITTED",
    next: "REVISION_REQUESTED",
    reason,
  });
  return { sheet: await buildSheet(prisma, schoolId, assignmentId) };
}

export async function decideCompetencyDescriptionRevision(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  decision: "approve" | "reject",
  note: string | undefined,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const assignment = await prisma.teachingAssignment.findFirst({
    where: { id: assignmentId, schoolId, academicPeriod: { isActive: true } },
    select: { id: true, classId: true, academicPeriodId: true },
  });
  if (!assignment) throw new AppError(404, "NOT_FOUND", "Penugasan mengajar tidak ditemukan.");
  const homeroom = await prisma.homeroomAssignment.findFirst({
    where: { schoolId, classId: assignment.classId, academicPeriodId: assignment.academicPeriodId, teacher: { isActive: true } },
    select: { teacher: { select: { userId: true } } },
  });
  const wali = homeroom?.teacher.userId === auth.userId
    && auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "WALI_KELAS");
  if (!auth.isSystemOwner && !wali) {
    throw new AppError(403, "FORBIDDEN", "Keputusan revisi hanya dapat dilakukan oleh wali kelas aktif pada kelas dan semester ini.");
  }
  const current = await prisma.competencyDescription.findUnique({ where: { teachingAssignmentId: assignment.id } });
  if (!current || current.status !== "REVISION_REQUESTED") {
    throw new AppError(409, "GRADE_LOCKED", "Tidak ada permintaan revisi pada deskripsi ini.");
  }
  const approved = decision === "approve";
  const next: WorkflowStatus = approved ? "DRAFT" : "SUBMITTED";
  await prisma.competencyDescription.update({
    where: { id: current.id },
    data: {
      status: next,
      decidedAt: new Date(),
      decidedById: auth.userId,
      decisionNote: note?.trim() ? note.trim() : null,
      ...(approved ? { evidenceSnapshot: Prisma.DbNull } : {}),
    },
  });
  await audit(prisma, auth, meta, schoolId, current.id, approved ? "COMPETENCY_DESCRIPTION_REVISION_APPROVED" : "COMPETENCY_DESCRIPTION_REVISION_REJECTED", {
    teachingAssignmentId: assignment.id,
    previous: "REVISION_REQUESTED",
    next,
    note: note ?? null,
  });
  return { sheet: await buildSheet(prisma, schoolId, assignment.id) };
}

export async function getHomeroomCompetencyDescriptions(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!auth.isSystemOwner && !auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "WALI_KELAS")) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  const teacher = await prisma.teacher.findFirst({ where: { schoolId, userId: auth.userId, isActive: true }, select: { id: true } });
  const homerooms = await prisma.homeroomAssignment.findMany({
    where: auth.isSystemOwner
      ? { schoolId, academicPeriod: { isActive: true } }
      : { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } },
    select: { id: true, classId: true, academicPeriodId: true, class: { select: { name: true } }, academicPeriod: { select: { name: true } } },
    orderBy: { class: { name: "asc" } },
  });
  const listed = homerooms.map((item) => ({ id: item.id, className: item.class.name, periodName: item.academicPeriod.name }));
  const selected = homeroomId ? homerooms.find((item) => item.id === homeroomId) : homerooms[0];
  if (homeroomId && !selected) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (!selected) return { homerooms: listed, view: null };
  const assignments = await prisma.teachingAssignment.findMany({
    where: { schoolId, classId: selected.classId, academicPeriodId: selected.academicPeriodId },
    select: { id: true, subject: { select: { name: true } }, teacher: { select: { name: true } } },
    orderBy: { subject: { name: "asc" } },
  });
  const subjects = [];
  for (const assignment of assignments) {
    const row = await officialRow(prisma, schoolId, assignment.id);
    if (!row || row.status === "DRAFT") continue;
    const evidence = await loadEvidence(prisma, schoolId, assignment.id, selected.classId);
    const needsReview = reviewNeeded(row.status, row.evidenceSnapshot, evidence.snapshot);
    subjects.push({
      assignmentId: assignment.id,
      subjectName: assignment.subject.name,
      teacherName: assignment.teacher.name,
      status: row.status,
      needsReview,
      revisionReason: row.revisionReason,
      students: evidence.students.map((student) => ({
        studentId: student.studentId,
        name: evidence.names.get(student.studentId) ?? "",
        nis: evidence.nis.get(student.studentId) ?? null,
        text: row.texts.get(student.studentId) ?? null,
        reviewStatus: needsReview ? "PERLU_DITINJAU" as const : "TERSEDIA" as const,
        finalStatus: student.finalStatus,
        finalScore: student.finalScore,
      })),
    });
  }
  return {
    homerooms: listed,
    view: { homeroomId: selected.id, className: selected.class.name, periodName: selected.academicPeriod.name, subjects },
  };
}

export async function readOfficialDescriptions(
  prisma: PrismaClient,
  schoolId: string,
  assignmentId: string,
  classId: string,
): Promise<Map<string, ReportDescription>> {
  const row = await officialRow(prisma, schoolId, assignmentId);
  if (!row || row.status !== "SUBMITTED") return new Map();
  const evidence = await loadEvidence(prisma, schoolId, assignmentId, classId);
  if (reviewNeeded(row.status, row.evidenceSnapshot, evidence.snapshot)) {
    return new Map(evidence.students.map((student) => [student.studentId, { status: "PERLU_DITINJAU", text: null }]));
  }
  return new Map(evidence.students.map((student) => {
    const text = row.texts.get(student.studentId)?.trim() ?? "";
    return [student.studentId, text ? { status: "SIAP" as const, text } : EMPTY_DESCRIPTION];
  }));
}

async function buildSheet(prisma: PrismaClient, schoolId: string, assignmentId: string) {
  const assignment = await prisma.teachingAssignment.findFirstOrThrow({
    where: { id: assignmentId, schoolId },
    select: {
      id: true,
      classId: true,
      class: { select: { name: true } },
      subject: { select: { name: true } },
      academicPeriod: { select: { name: true } },
    },
  });
  const [row, evidence] = await Promise.all([
    officialRow(prisma, schoolId, assignment.id),
    loadEvidence(prisma, schoolId, assignment.id, assignment.classId),
  ]);
  const status = row?.status ?? null;
  const needsReview = reviewNeeded(status, row?.evidenceSnapshot ?? null, evidence.snapshot);
  const students = evidence.students.map((student) => {
    const view = studentView(student, evidence.plan);
    return {
      studentId: student.studentId,
      name: evidence.names.get(student.studentId) ?? "",
      nis: evidence.nis.get(student.studentId) ?? null,
      finalStatus: student.finalStatus,
      finalScore: student.finalScore,
      objectives: view.objectives,
      scopes: view.scopes,
      suggestion: view.suggestion,
      warnings: view.warnings,
      text: row?.texts.get(student.studentId) ?? "",
    };
  });
  return {
    assignmentId: assignment.id,
    className: assignment.class.name,
    subjectName: assignment.subject.name,
    periodName: assignment.academicPeriod.name,
    status,
    locked: status === "SUBMITTED" || status === "REVISION_REQUESTED",
    needsReview,
    revisionReason: row?.revisionReason ?? null,
    decisionNote: row?.decisionNote ?? null,
    students,
  };
}

async function officialRow(prisma: PrismaClient, schoolId: string, assignmentId: string) {
  const row = await prisma.competencyDescription.findFirst({
    where: { schoolId, teachingAssignmentId: assignmentId },
    select: {
      id: true,
      status: true,
      revisionReason: true,
      decisionNote: true,
      evidenceSnapshot: true,
      entries: { select: { studentId: true, text: true } },
    },
  });
  if (!row) return null;
  return { ...row, texts: new Map(row.entries.map((item) => [item.studentId, item.text])) };
}

async function loadEvidence(prisma: PrismaClient, schoolId: string, assignmentId: string, classId: string) {
  const [students, objectives, scopes, terms, finals] = await Promise.all([
    activeStudents(prisma, schoolId, classId),
    prisma.learningObjective.findMany({
      where: { schoolId, teachingAssignmentId: assignmentId },
      orderBy: { sequence: "asc" },
      select: {
        id: true,
        code: true,
        description: true,
        formativeAssessment: { select: { scores: { select: { studentId: true, uh: true, t1: true, t2: true, t3: true, remedial: true } } } },
      },
    }),
    prisma.materialScope.findMany({
      where: { schoolId, teachingAssignmentId: assignmentId },
      orderBy: { sequence: "asc" },
      select: {
        id: true,
        code: true,
        description: true,
        summativeAssessment: { select: { scores: { select: { studentId: true, score: true, remedial: true } } } },
      },
    }),
    prisma.termExamScore.findMany({ where: { schoolId, teachingAssignmentId: assignmentId }, select: { studentId: true, sts: true, sas: true } }),
    readOfficialFinalGrades(prisma, schoolId, assignmentId),
  ]);
  const finalByStudent = new Map(finals.map((item) => [item.studentId, item]));
  const termByStudent = new Map(terms.map((item) => [item.studentId, item]));
  const snapshot: Evidence = {
    students: students.map((student) => ({
      studentId: student.id,
      finalStatus: normalizeFinal(finalByStudent.get(student.id)?.status),
      finalScore: num(finalByStudent.get(student.id)?.score),
      objectives: objectives.map((item) => {
        const score = item.formativeAssessment?.scores.find((row) => row.studentId === student.id);
        return { id: item.id, uh: num(score?.uh), t1: num(score?.t1), t2: num(score?.t2), t3: num(score?.t3), remedial: num(score?.remedial) };
      }),
      scopes: scopes.map((item) => {
        const score = item.summativeAssessment?.scores.find((row) => row.studentId === student.id);
        return { id: item.id, score: num(score?.score), remedial: num(score?.remedial) };
      }),
      sts: num(termByStudent.get(student.id)?.sts),
      sas: num(termByStudent.get(student.id)?.sas),
    })),
  };
  return {
    snapshot,
    students: snapshot.students,
    names: new Map(students.map((item) => [item.id, item.name])),
    nis: new Map(students.map((item) => [item.id, item.nis])),
    plan: {
      objectives: objectives.map((item) => ({ id: item.id, label: labelOf(item.code, item.description) })),
      scopes: scopes.map((item) => ({ id: item.id, label: labelOf(item.code, item.description) })),
    },
  };
}

function studentView(student: EvidenceStudent, plan: { objectives: Array<{ id: string; label: string }>; scopes: Array<{ id: string; label: string }> }) {
  const objectives = plan.objectives.map((item) => {
    const score = student.objectives.find((row) => row.id === item.id);
    return { label: item.label, uh: score?.uh ?? null, t1: score?.t1 ?? null, t2: score?.t2 ?? null, t3: score?.t3 ?? null };
  });
  const scopes = plan.scopes.map((item) => ({ label: item.label, score: student.scopes.find((row) => row.id === item.id)?.score ?? null }));
  const suggestion = suggestDescription({ finalStatus: student.finalStatus, finalScore: student.finalScore, objectives, scopes });
  return {
    objectives: objectives.map((item) => ({ label: item.label, mean: meanOf([item.uh, item.t1, item.t2, item.t3]) })),
    scopes: scopes.map((item) => ({ label: item.label, score: item.score })),
    suggestion: suggestion.text,
    warnings: suggestion.warnings,
  };
}

function reviewNeeded(status: WorkflowStatus | null, stored: Prisma.JsonValue | null | undefined, current: Evidence): boolean {
  if (status !== "SUBMITTED" && status !== "REVISION_REQUESTED") return false;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return true;
  return canonical(current) !== canonical(stored as Evidence);
}

function canonical(evidence: Evidence): string {
  const students = [...evidence.students]
    .sort((left, right) => left.studentId.localeCompare(right.studentId))
    .map((student) => ({
      studentId: student.studentId,
      finalStatus: student.finalStatus,
      finalScore: num(student.finalScore),
      objectives: [...student.objectives]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((item) => ({ id: item.id, uh: num(item.uh), t1: num(item.t1), t2: num(item.t2), t3: num(item.t3), remedial: num(item.remedial) })),
      scopes: [...student.scopes]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((item) => ({ id: item.id, score: num(item.score), remedial: num(item.remedial) })),
      sts: num(student.sts),
      sas: num(student.sas),
    }));
  return JSON.stringify({ students });
}

async function ownedAssignment(prisma: PrismaClient, auth: AuthState, schoolId: string, assignmentId: string, meta: RequestMeta) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const guru = auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "GURU_MAPEL");
  if (!guru) throw new AppError(403, "FORBIDDEN", "Deskripsi capaian hanya dapat diubah oleh guru mata pelajaran pada penugasannya.");
  const assignment = await prisma.teachingAssignment.findFirst({
    where: { id: assignmentId, schoolId },
    select: { id: true, classId: true, academicPeriodId: true, academicPeriod: { select: { isActive: true } }, teacher: { select: { userId: true } } },
  });
  if (!assignment) throw new AppError(404, "NOT_FOUND", "Penugasan mengajar tidak ditemukan.");
  if (assignment.teacher.userId !== auth.userId || !assignment.academicPeriod.isActive) {
    throw new AppError(403, "FORBIDDEN", "Deskripsi capaian hanya tersedia pada penugasan aktif guru ini.");
  }
  return assignment;
}

async function assignedTeacher(prisma: PrismaClient, auth: AuthState, schoolId: string) {
  const guru = auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "GURU_MAPEL");
  if (!guru) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const teacher = await prisma.teacher.findFirst({ where: { schoolId, userId: auth.userId, isActive: true }, select: { id: true } });
  if (!teacher) throw new AppError(403, "FORBIDDEN", "Akun guru belum tertaut ke data guru.");
  return teacher;
}

function activeStudents(prisma: PrismaClient, schoolId: string, classId: string) {
  return prisma.student.findMany({
    where: { schoolId, classId, isActive: true },
    select: { id: true, name: true, nis: true },
    orderBy: [{ name: "asc" }, { nis: "asc" }],
  });
}

function normalizeFinal(status: string | undefined): FinalStatus {
  if (status === "SIAP" || status === "BELUM_DIKONFIGURASI") return status;
  return "BELUM_LENGKAP";
}

function labelOf(code: string, description: string): string {
  const text = description.trim().slice(0, 120);
  return text ? `${code} ${text}` : code;
}

function meanOf(values: Array<number | null>): number | null {
  const present = values.filter((item): item is number => item !== null);
  if (present.length === 0) return null;
  return Math.round((present.reduce((total, item) => total + item, 0) / present.length) * 100) / 100;
}

function num(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : value.toNumber();
  return Math.round(parsed * 100) / 100;
}

async function audit(
  prisma: PrismaClient,
  auth: AuthState,
  meta: RequestMeta,
  schoolId: string,
  entityId: string,
  action: string,
  metadata: Prisma.InputJsonValue,
) {
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action,
    entityType: "CompetencyDescription",
    entityId,
    metadata,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}
