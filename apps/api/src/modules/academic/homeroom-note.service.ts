import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { notFound, rethrowKnown } from "./common.ts";
import { readOfficialDescriptions } from "./competency-description.service.ts";
import { readOfficialFinalGrades } from "./grade-final.service.ts";
import { readFinalDailyAttendance, studentAttendance } from "./report-card/attendance.ts";
import type { ReportDescription, ReportHomeroomNote } from "./report-card/types.ts";

const homeroomInclude = {
  class: { select: { id: true, name: true } },
  academicPeriod: {
    select: {
      id: true,
      name: true,
      semesterKind: true,
      academicYearId: true,
      academicYear: { select: { name: true } },
    },
  },
  teacher: { select: { userId: true, name: true } },
} satisfies Prisma.HomeroomAssignmentInclude;

type HomeroomRow = Prisma.HomeroomAssignmentGetPayload<{ include: typeof homeroomInclude }>;
type NoteInput = { homeroomId: string; studentId: string; text: string };

const EMPTY_DESCRIPTION: ReportDescription = { status: "BELUM_TERSEDIA", text: null };

function hasWali(auth: AuthState, schoolId: string): boolean {
  return auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "WALI_KELAS");
}

function isEditor(auth: AuthState, schoolId: string, homeroom: HomeroomRow): boolean {
  return homeroom.teacher.userId === auth.userId && hasWali(auth, schoolId);
}

function semesterLabel(kind: string | null): string | null {
  if (kind === "GANJIL") return "Ganjil";
  if (kind === "GENAP") return "Genap";
  return null;
}

async function visibleHomerooms(prisma: PrismaClient, auth: AuthState, schoolId: string) {
  if (!auth.isSystemOwner && !hasWali(auth, schoolId)) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId, isActive: true },
    select: { id: true },
  });
  return prisma.homeroomAssignment.findMany({
    where: auth.isSystemOwner
      ? { schoolId, academicPeriod: { isActive: true } }
      : { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } },
    include: homeroomInclude,
    orderBy: { class: { name: "asc" } },
  });
}

async function selectedHomeroom(prisma: PrismaClient, auth: AuthState, schoolId: string, homeroomId: string | undefined) {
  const homerooms = await visibleHomerooms(prisma, auth, schoolId);
  const selected = homeroomId ? homerooms.find((item) => item.id === homeroomId) : homerooms[0];
  if (homeroomId && !selected) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  return { homerooms, selected: selected ?? null };
}

function assertEditor(auth: AuthState, schoolId: string, homeroom: HomeroomRow) {
  if (!isEditor(auth, schoolId, homeroom)) {
    throw new AppError(403, "FORBIDDEN", "Catatan wali kelas hanya dapat diubah oleh wali kelas yang berwenang.");
  }
}

async function buildSheet(prisma: PrismaClient, auth: AuthState, schoolId: string, homeroom: HomeroomRow) {
  const yearId = homeroom.academicPeriod.academicYearId;
  const [students, placements, assignments, notes] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, classId: homeroom.classId, isActive: true },
      select: { id: true, name: true, nis: true, nisn: true, gender: true },
      orderBy: [{ name: "asc" }, { nis: "asc" }],
    }),
    prisma.curriculumPlacement.findMany({
      where: { schoolId, classId: homeroom.classId, ...(yearId ? { curriculum: { academicYearId: yearId } } : {}) },
      include: { subject: { select: { id: true, code: true, name: true, category: true } } },
    }),
    prisma.teachingAssignment.findMany({
      where: { schoolId, classId: homeroom.classId, academicPeriodId: homeroom.academicPeriodId },
      select: { id: true, subjectId: true, teacher: { select: { name: true } } },
    }),
    prisma.homeroomNote.findMany({
      where: { schoolId, academicPeriodId: homeroom.academicPeriodId, classId: homeroom.classId },
      select: { studentId: true, text: true, status: true },
    }),
  ]);
  const grades = new Map<string, Map<string, { status: "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI"; score: number | null }>>();
  const descriptions = new Map<string, Map<string, ReportDescription>>();
  for (const assignment of assignments) {
    if (!placements.some((item) => item.subjectId === assignment.subjectId)) continue;
    const rows = await readOfficialFinalGrades(prisma, schoolId, assignment.id);
    grades.set(assignment.subjectId, new Map(rows.map((item) => [item.studentId, { status: item.status, score: item.score }])));
    descriptions.set(assignment.subjectId, await readOfficialDescriptions(prisma, schoolId, assignment.id, homeroom.classId));
  }
  const attendance = await readFinalDailyAttendance(
    prisma,
    schoolId,
    homeroom.id,
    homeroom.academicPeriod.id,
    students.map((student) => student.id),
  );
  const noteByStudent = new Map(notes.map((item) => [item.studentId, item]));
  const teacherBySubject = new Map(assignments.map((item) => [item.subjectId, item.teacher.name]));
  const subjects = [...placements].sort((left, right) => {
    if (left.subject.category !== right.subject.category) return left.subject.category === "UMUM" ? -1 : 1;
    return left.subject.name.localeCompare(right.subject.name, "id");
  });
  return {
    homeroomId: homeroom.id,
    className: homeroom.class.name,
    periodName: homeroom.academicPeriod.name,
    yearName: homeroom.academicPeriod.academicYear?.name ?? "",
    semester: semesterLabel(homeroom.academicPeriod.semesterKind),
    homeroomTeacher: homeroom.teacher.name,
    canEdit: isEditor(auth, schoolId, homeroom),
    students: students.map((student) => {
      const note = noteByStudent.get(student.id);
      const marks = studentAttendance(attendance, student.id);
      return {
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        nisn: student.nisn,
        gender: student.gender,
        note: {
          status: note?.status ?? "BELUM_ADA",
          text: note?.text ?? null,
          locked: note?.status === "FINAL",
        },
        subjects: subjects.map((item) => {
          const grade = grades.get(item.subjectId)?.get(student.id);
          const assigned = assignments.some((assignment) => assignment.subjectId === item.subjectId);
          return {
            subjectId: item.subject.id,
            code: item.subject.code,
            name: item.subject.name,
            teacherName: teacherBySubject.get(item.subjectId) ?? null,
            gradeStatus: !assigned ? "BELUM_DITUGASKAN" as const : grade?.status ?? "BELUM_DIKONFIGURASI",
            score: grade?.status === "SIAP" ? grade.score : null,
            description: descriptions.get(item.subjectId)?.get(student.id) ?? EMPTY_DESCRIPTION,
          };
        }),
        attendance: {
          dataStatus: marks.dataStatus,
          sakit: marks.sakit,
          izin: marks.izin,
          alpa: marks.alpa,
        },
      };
    }),
  };
}

export async function getHomeroomNotes(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const { homerooms, selected } = await selectedHomeroom(prisma, auth, schoolId, homeroomId);
  const listed = homerooms.map((item) => ({
    id: item.id,
    className: item.class.name,
    periodName: item.academicPeriod.name,
    yearName: item.academicPeriod.academicYear?.name ?? "",
  }));
  if (!selected) return { homerooms: listed, sheet: null };
  return { homerooms: listed, sheet: await buildSheet(prisma, auth, schoolId, selected) };
}

async function saveNote(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: NoteInput,
  mode: "DRAFT" | "FINAL",
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const { selected } = await selectedHomeroom(prisma, auth, schoolId, input.homeroomId);
  if (!selected) notFound();
  assertEditor(auth, schoolId, selected);
  const yearId = selected.academicPeriod.academicYearId;
  if (!yearId) throw new AppError(409, "CONFLICT", "Semester belum terikat tahun pelajaran.");
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId, classId: selected.classId, isActive: true },
    select: { id: true },
  });
  if (!student) throw new AppError(400, "INVALID_REFERENCE", "Siswa tidak termasuk kelas binaan ini.");
  const text = input.text.trim();
  if (!text) throw new AppError(400, "VALIDATION_ERROR", "Catatan wali kelas tidak boleh kosong.");
  const existing = await prisma.homeroomNote.findUnique({
    where: { studentId_academicPeriodId: { studentId: student.id, academicPeriodId: selected.academicPeriodId } },
  });
  if (existing && existing.schoolId !== schoolId) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (existing && existing.homeroomAssignmentId !== selected.id) {
    throw new AppError(409, "CONFLICT", "Catatan semester ini sudah tercatat pada kelas lain.");
  }
  if (existing?.status === "FINAL") throw new AppError(409, "CONFLICT", "Catatan final terkunci. Koreksi memerlukan alasan.");
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.homeroomNote.update({
            where: { id: existing.id },
            data: mode === "FINAL" ? { text, status: "FINAL", finalizedAt: now, finalizedById: auth.userId } : { text },
          })
        : await tx.homeroomNote.create({
            data: {
              schoolId,
              homeroomAssignmentId: selected.id,
              classId: selected.classId,
              studentId: student.id,
              academicYearId: yearId,
              academicPeriodId: selected.academicPeriodId,
              text,
              status: mode,
              finalizedAt: mode === "FINAL" ? now : null,
              finalizedById: mode === "FINAL" ? auth.userId : null,
              createdById: auth.userId,
            },
          });
      await writeAudit(tx, {
        schoolId,
        actorId: auth.userId,
        action: mode === "FINAL" ? "HOMEROOM_NOTE_FINALIZED" : "HOMEROOM_NOTE_DRAFT_SAVED",
        entityType: "HomeroomNote",
        entityId: saved.id,
        metadata: {
          studentId: student.id,
          classId: selected.classId,
          academicYearId: yearId,
          academicPeriodId: selected.academicPeriodId,
          status: mode,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
  } catch (error) {
    rethrowKnown(error, "Catatan siswa pada semester ini sudah ada.");
  }
  return { sheet: await buildSheet(prisma, auth, schoolId, selected) };
}

export function saveHomeroomNoteDraft(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: NoteInput,
  meta: RequestMeta,
) {
  return saveNote(prisma, auth, schoolId, input, "DRAFT", meta);
}

export function finalizeHomeroomNote(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: NoteInput,
  meta: RequestMeta,
) {
  return saveNote(prisma, auth, schoolId, input, "FINAL", meta);
}

export async function correctHomeroomNote(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: NoteInput & { reason: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const { selected } = await selectedHomeroom(prisma, auth, schoolId, input.homeroomId);
  if (!selected) notFound();
  assertEditor(auth, schoolId, selected);
  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId, classId: selected.classId, isActive: true },
    select: { id: true },
  });
  if (!student) throw new AppError(400, "INVALID_REFERENCE", "Siswa tidak termasuk kelas binaan ini.");
  const existing = await prisma.homeroomNote.findUnique({
    where: { studentId_academicPeriodId: { studentId: student.id, academicPeriodId: selected.academicPeriodId } },
  });
  if (!existing || existing.schoolId !== schoolId || existing.homeroomAssignmentId !== selected.id) notFound();
  if (existing.status !== "FINAL") throw new AppError(409, "CONFLICT", "Koreksi hanya untuk catatan yang sudah final.");
  const next = input.text.trim();
  const previous = existing.text.trim();
  if (!next) throw new AppError(400, "VALIDATION_ERROR", "Catatan wali kelas tidak boleh kosong.");
  if (next === previous) throw new AppError(400, "VALIDATION_ERROR", "Catatan koreksi sama dengan catatan final.");
  const reason = input.reason.trim();
  await prisma.$transaction(async (tx) => {
    await tx.homeroomNote.update({ where: { id: existing.id }, data: { text: next } });
    await tx.homeroomNoteCorrection.create({
      data: { schoolId, noteId: existing.id, reason, previousText: previous, nextText: next, actorId: auth.userId },
    });
    await writeAudit(tx, {
      schoolId,
      actorId: auth.userId,
      action: "HOMEROOM_NOTE_CORRECTED",
      entityType: "HomeroomNote",
      entityId: existing.id,
      metadata: {
        studentId: student.id,
        classId: selected.classId,
        academicPeriodId: selected.academicPeriodId,
        reason,
        previousText: previous,
        nextText: next,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
  return { sheet: await buildSheet(prisma, auth, schoolId, selected) };
}

export async function readOfficialHomeroomNotes(
  prisma: PrismaClient,
  schoolId: string,
  academicPeriodId: string,
  studentIds: string[],
): Promise<Map<string, ReportHomeroomNote>> {
  if (studentIds.length === 0) return new Map();
  const rows = await prisma.homeroomNote.findMany({
    where: { schoolId, academicPeriodId, studentId: { in: studentIds }, status: "FINAL" },
    select: { studentId: true, text: true },
  });
  const notes = new Map<string, ReportHomeroomNote>();
  for (const row of rows) {
    const text = row.text.trim();
    if (text) notes.set(row.studentId, { status: "SIAP", text });
  }
  return notes;
}
