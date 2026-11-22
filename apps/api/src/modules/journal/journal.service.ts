import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";

export async function listTeachingJournals(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  filters: { teachingAssignmentId?: string; date?: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);

  const isLeadership =
    auth.isSystemOwner ||
    auth.assignments.some(
      (a) =>
        a.schoolId === schoolId &&
        ["ADMIN_SEKOLAH", "KEPALA_SEKOLAH", "WAKAKUR", "TU"].includes(a.roleCode),
    );

  const journals = await prisma.teachingJournal.findMany({
    where: {
      schoolId,
      ...(isLeadership ? {} : { teacherUserId: auth.userId }),
      ...(filters.teachingAssignmentId ? { teachingAssignmentId: filters.teachingAssignmentId } : {}),
      ...(filters.date ? { journalDate: new Date(`${filters.date}T00:00:00.000Z`) } : {}),
    },
    include: {
      teachingAssignment: {
        include: {
          class: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, name: true } },
        },
      },
      learningObjective: { select: { id: true, code: true, description: true } },
    },
    orderBy: [{ journalDate: "desc" }, { sessionNo: "desc" }],
    take: 100,
  });

  return { journals };
}

export async function upsertTeachingJournal(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: {
    teachingAssignmentId: string;
    attendanceMeetingId?: string | null;
    learningObjectiveId?: string | null;
    journalDate: string;
    sessionNo?: number;
    topic: string;
    activities: string;
    studentNotes?: string | null;
    photoUrl?: string | null;
    idempotencyKey?: string;
  },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);

  if (input.idempotencyKey) {
    const existingByKey = await prisma.teachingJournal.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingByKey) {
      return { journal: existingByKey, deduplicated: true };
    }
  }

  const assignment = await prisma.teachingAssignment.findFirst({
    where: { id: input.teachingAssignmentId, schoolId },
    include: { teacher: { select: { userId: true } } },
  });
  if (!assignment) {
    throw new AppError(404, "ASSIGNMENT_NOT_FOUND", "Penugasan mengajar tidak ditemukan.");
  }

  const isStaff =
    auth.isSystemOwner ||
    auth.assignments.some(
      (a) => a.schoolId === schoolId && ["ADMIN_SEKOLAH", "WAKAKUR"].includes(a.roleCode),
    );
  if (!isStaff && assignment.teacher.userId !== auth.userId) {
    throw new AppError(403, "JOURNAL_FORBIDDEN", "Anda hanya dapat mengisi jurnal untuk kelas yang Anda ampu.");
  }

  const journalDate = new Date(`${input.journalDate}T00:00:00.000Z`);
  const journal = await prisma.teachingJournal.upsert({
    where: {
      teachingAssignmentId_journalDate_sessionNo: {
        teachingAssignmentId: input.teachingAssignmentId,
        journalDate,
        sessionNo: (input.sessionNo ?? 1),
      },
    },
    update: {
      attendanceMeetingId: input.attendanceMeetingId ?? null,
      learningObjectiveId: input.learningObjectiveId ?? null,
      topic: input.topic,
      activities: input.activities,
      studentNotes: input.studentNotes ?? null,
      photoUrl: input.photoUrl ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
    create: {
      schoolId,
      teachingAssignmentId: input.teachingAssignmentId,
      attendanceMeetingId: input.attendanceMeetingId ?? null,
      learningObjectiveId: input.learningObjectiveId ?? null,
      teacherUserId: auth.userId,
      journalDate,
      sessionNo: (input.sessionNo ?? 1),
      topic: input.topic,
      activities: input.activities,
      studentNotes: input.studentNotes ?? null,
      photoUrl: input.photoUrl ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });

  return { journal, deduplicated: false };
}
