import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { duplicate, notFound, pageWindow, parseDateOnly, rethrowKnown, toDateOnly, type PageQuery } from "./common.ts";

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA" | null;
type RecordInput = { studentId: string; status: Mark };

const CORRECTION_ROLES = ["ADMIN_SEKOLAH", "WAKAKUR"] as const;

const assignmentSelect = {
  id: true,
  schoolId: true,
  classId: true,
  teacher: { select: { id: true, userId: true, name: true } },
  class: { select: { name: true } },
  subject: { select: { name: true } },
  academicPeriod: { select: { name: true, isActive: true } },
} satisfies Prisma.TeachingAssignmentSelect;

type AssignmentRow = Prisma.TeachingAssignmentGetPayload<{ select: typeof assignmentSelect }>;

function hasSchoolRole(auth: AuthState, schoolId: string, roles: readonly string[]): boolean {
  return auth.assignments.some((item) => item.schoolId === schoolId && roles.includes(item.roleCode));
}

function canCorrect(auth: AuthState, schoolId: string): boolean {
  return auth.isSystemOwner || hasSchoolRole(auth, schoolId, CORRECTION_ROLES);
}

function pageQuery(page: string | undefined, pageSize: string | undefined): PageQuery {
  const size = pageSize === "25" || pageSize === "50" ? Number(pageSize) : 10;
  const current = Number(page);
  return { page: Number.isInteger(current) && current > 0 ? current : 1, pageSize: size as 10 | 25 | 50 };
}

async function ownedAssignment(prisma: PrismaClient, auth: AuthState, schoolId: string, assignmentId: string): Promise<AssignmentRow> {
  const row = await prisma.teachingAssignment.findFirst({
    where: { id: assignmentId, schoolId, academicPeriod: { isActive: true } },
    select: assignmentSelect,
  });
  if (!row) notFound();
  if (row.teacher.userId !== auth.userId || !hasSchoolRole(auth, schoolId, ["GURU_MAPEL"])) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  return row;
}

async function activeStudents(prisma: PrismaClient, schoolId: string, classId: string) {
  return prisma.student.findMany({
    where: { schoolId, classId, isActive: true },
    select: { id: true, name: true, nis: true },
    orderBy: [{ name: "asc" }, { nis: "asc" }],
  });
}

function assertRecords(students: Array<{ studentId: string }>, records: RecordInput[]) {
  const ids = new Set(students.map((item) => item.studentId));
  const seen = new Set<string>();
  for (const record of records) {
    if (!ids.has(record.studentId)) throw new AppError(400, "INVALID_REFERENCE", "Siswa tidak termasuk kelas pada penugasan ini.");
    if (seen.has(record.studentId)) throw new AppError(400, "BAD_REQUEST", "Status kehadiran siswa terduplikasi.");
    seen.add(record.studentId);
  }
}

async function writeRecords(prisma: Prisma.TransactionClient, schoolId: string, meetingId: string, records: RecordInput[]) {
  for (const record of records) {
    if (record.status === null) {
      await prisma.attendanceRecord.deleteMany({ where: { meetingId, studentId: record.studentId } });
      continue;
    }
    await prisma.attendanceRecord.upsert({
      where: { meetingId_studentId: { meetingId, studentId: record.studentId } },
      create: { schoolId, meetingId, studentId: record.studentId, status: record.status },
      update: { status: record.status },
    });
  }
}

async function meetingSheet(prisma: PrismaClient, schoolId: string, meetingId: string, auth: AuthState) {
  const meeting = await prisma.attendanceMeeting.findFirst({
    where: { id: meetingId, schoolId },
    include: {
      teachingAssignment: { select: assignmentSelect },
      records: { select: { studentId: true, status: true } },
      scheduleSlot: { select: { id: true, label: true } },
    },
  });
  if (!meeting || !meeting.teachingAssignment.academicPeriod.isActive) notFound();
  const teacher = meeting.teachingAssignment.teacher.userId === auth.userId && hasSchoolRole(auth, schoolId, ["GURU_MAPEL"]);
  const corrector = canCorrect(auth, schoolId);
  if (!teacher && !corrector) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const students = await activeStudents(prisma, schoolId, meeting.teachingAssignment.classId);
  const marks = new Map(meeting.records.map((item) => [item.studentId, item.status]));
  return {
    meeting: {
      id: meeting.id,
      assignmentId: meeting.teachingAssignmentId,
      meetingDate: toDateOnly(meeting.meetingDate),
      sessionNo: meeting.sessionNo,
      note: meeting.note,
      marker: meeting.marker,
      status: meeting.status,
      className: meeting.teachingAssignment.class.name,
      subjectName: meeting.teachingAssignment.subject.name,
      teacherName: meeting.teachingAssignment.teacher.name,
      scheduleSlotId: meeting.scheduleSlot?.id ?? null,
      scheduleLabel: meeting.scheduleSlot?.label ?? null,
      canEdit: teacher && meeting.status === "DRAFT",
      canFinalize: teacher && meeting.status === "DRAFT",
      canCorrect: corrector && meeting.status === "FINAL",
    },
    students: students.map((student) => ({
      studentId: student.id,
      name: student.name,
      nis: student.nis,
      status: marks.get(student.id) ?? null,
    })),
  };
}

export async function getAttendanceBoard(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  query: { assignmentId?: string; q?: string; from?: string; to?: string; page?: string; pageSize?: string },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!auth.isSystemOwner && !hasSchoolRole(auth, schoolId, ["GURU_MAPEL"])) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId, isActive: true },
    select: { id: true },
  });
  const assignments = await prisma.teachingAssignment.findMany({
    where: { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } },
    select: { id: true, classId: true, class: { select: { name: true } }, subject: { select: { name: true } }, academicPeriod: { select: { name: true } } },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  const selected = query.assignmentId ? assignments.find((item) => item.id === query.assignmentId) : assignments[0];
  if (query.assignmentId && !selected) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const paging = pageQuery(query.page, query.pageSize);
  if (!selected) {
    return {
      assignments: [],
      assignmentId: null,
      summary: { finalMeetings: 0, draftMeetings: 0, students: [] },
      meetings: { items: [], page: paging.page, pageSize: paging.pageSize, total: 0 },
    };
  }
  const needle = query.q?.trim();
  const where: Prisma.AttendanceMeetingWhereInput = {
    schoolId,
    teachingAssignmentId: selected.id,
    ...(query.from || query.to
      ? { meetingDate: { ...(query.from ? { gte: parseDateOnly(query.from) } : {}), ...(query.to ? { lte: parseDateOnly(query.to) } : {}) } }
      : {}),
    ...(needle
      ? {
          OR: [
            { note: { contains: needle, mode: "insensitive" } },
            { marker: { contains: needle, mode: "insensitive" } },
            ...( /^\d+$/.test(needle) ? [{ sessionNo: Number(needle) }] : []),
            ...( /^\d{4}-\d{2}-\d{2}$/.test(needle) ? [{ meetingDate: parseDateOnly(needle) }] : []),
          ],
        }
      : {}),
  };
  const [total, rows, students, counted] = await Promise.all([
    prisma.attendanceMeeting.count({ where }),
    prisma.attendanceMeeting.findMany({
      where,
      orderBy: [{ meetingDate: "desc" }, { sessionNo: "desc" }],
      ...pageWindow(paging),
      include: { records: { select: { status: true } } },
    }),
    activeStudents(prisma, schoolId, selected.classId),
    prisma.attendanceRecord.findMany({
      where: { schoolId, meeting: { teachingAssignmentId: selected.id, status: "FINAL" }, status: { not: null } },
      select: { studentId: true, status: true },
    }),
  ]);
  const totals = new Map<string, { hadir: number; sakit: number; izin: number; alpa: number }>();
  for (const row of counted) {
    const current = totals.get(row.studentId) ?? { hadir: 0, sakit: 0, izin: 0, alpa: 0 };
    if (row.status === "HADIR") current.hadir += 1;
    if (row.status === "SAKIT") current.sakit += 1;
    if (row.status === "IZIN") current.izin += 1;
    if (row.status === "ALPA") current.alpa += 1;
    totals.set(row.studentId, current);
  }
  const [finalMeetings, draftMeetings] = await Promise.all([
    prisma.attendanceMeeting.count({ where: { schoolId, teachingAssignmentId: selected.id, status: "FINAL" } }),
    prisma.attendanceMeeting.count({ where: { schoolId, teachingAssignmentId: selected.id, status: "DRAFT" } }),
  ]);
  return {
    assignments: assignments.map((item) => ({
      id: item.id,
      className: item.class.name,
      subjectName: item.subject.name,
      periodName: item.academicPeriod.name,
    })),
    assignmentId: selected.id,
    summary: {
      finalMeetings,
      draftMeetings,
      students: students.map((student) => ({
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        ...(totals.get(student.id) ?? { hadir: 0, sakit: 0, izin: 0, alpa: 0 }),
      })),
    },
    meetings: {
      items: rows.map((item) => ({
        id: item.id,
        meetingDate: toDateOnly(item.meetingDate),
        sessionNo: item.sessionNo,
        note: item.note,
        marker: item.marker,
        status: item.status,
        filled: item.records.filter((record) => record.status !== null).length,
        students: students.length,
      })),
      page: paging.page,
      pageSize: paging.pageSize,
      total,
    },
  };
}

export async function createAttendanceMeeting(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { assignmentId: string; meetingDate: string; sessionNo?: number; note?: string | null; marker?: string | null; scheduleSlotId?: string | null },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const assignment = await ownedAssignment(prisma, auth, schoolId, input.assignmentId);
  if (input.scheduleSlotId) {
    const slot = await prisma.classScheduleSlot.findFirst({
      where: { id: input.scheduleSlotId, schoolId, teachingAssignmentId: assignment.id },
      select: { id: true },
    });
    if (!slot) throw new AppError(404, "NOT_FOUND", "Jadwal pelajaran tidak ditemukan pada penugasan ini.");
  }
  const meetingDate = parseDateOnly(input.meetingDate);
  let sessionNo = input.sessionNo;
  if (!sessionNo) {
    const last = await prisma.attendanceMeeting.aggregate({
      where: { teachingAssignmentId: assignment.id, meetingDate },
      _max: { sessionNo: true },
    });
    sessionNo = (last._max.sessionNo ?? 0) + 1;
    if (sessionNo > 20) throw new AppError(409, "CONFLICT", "Jumlah sesi pada tanggal ini sudah mencapai batas.");
  }
  try {
    const meeting = await prisma.attendanceMeeting.create({
      data: {
        schoolId,
        teachingAssignmentId: assignment.id,
        meetingDate,
        sessionNo,
        note: input.note?.trim() || null,
        marker: input.marker?.trim() || null,
        scheduleSlotId: input.scheduleSlotId ?? null,
        createdById: auth.userId,
      },
    });
    await writeAudit(prisma, {
      schoolId,
      actorId: auth.userId,
      action: "ATTENDANCE_MEETING_CREATED",
      entityType: "AttendanceMeeting",
      entityId: meeting.id,
      metadata: { assignmentId: assignment.id, meetingDate: input.meetingDate, sessionNo, marker: meeting.marker },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return meetingSheet(prisma, schoolId, meeting.id, auth);
  } catch (error) {
    rethrowKnown(error, "Pertemuan dengan tanggal dan sesi yang sama sudah ada.");
  }
}

export async function getAttendanceMeeting(prisma: PrismaClient, auth: AuthState, schoolId: string, meetingId: string, meta: RequestMeta) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  return meetingSheet(prisma, schoolId, meetingId, auth);
}

export async function saveAttendanceDraft(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meetingId: string,
  records: RecordInput[],
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const current = await meetingSheet(prisma, schoolId, meetingId, auth);
  if (!current.meeting.canEdit) throw new AppError(409, "CONFLICT", "Pertemuan final terkunci.");
  assertRecords(current.students, records);
  await prisma.$transaction(async (tx) => {
    await writeRecords(tx, schoolId, meetingId, records);
    await writeAudit(tx, {
      schoolId,
      actorId: auth.userId,
      action: "ATTENDANCE_DRAFT_SAVED",
      entityType: "AttendanceMeeting",
      entityId: meetingId,
      metadata: { records: records.map((item) => ({ studentId: item.studentId, status: item.status })) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
  return meetingSheet(prisma, schoolId, meetingId, auth);
}

async function assertComplete(students: Array<{ studentId: string }>, marks: Map<string, Mark>) {
  if (students.length === 0) throw new AppError(409, "CONFLICT", "Kelas tidak memiliki siswa aktif.");
  const missing = students.filter((student) => marks.get(student.studentId) == null);
  if (missing.length > 0) throw new AppError(409, "CONFLICT", "Finalisasi hanya dapat dilakukan setelah seluruh siswa aktif memiliki status kehadiran.");
}

export async function finalizeAttendanceMeeting(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meetingId: string,
  records: RecordInput[],
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const current = await meetingSheet(prisma, schoolId, meetingId, auth);
  if (!current.meeting.canFinalize) throw new AppError(409, "CONFLICT", "Pertemuan final terkunci.");
  assertRecords(current.students, records);
  const marks = new Map(current.students.map((student) => [student.studentId, student.status as Mark]));
  for (const record of records) marks.set(record.studentId, record.status);
  await assertComplete(current.students, marks);
  await prisma.$transaction(async (tx) => {
    await writeRecords(tx, schoolId, meetingId, records);
    await tx.attendanceMeeting.update({
      where: { id: meetingId },
      data: { status: "FINAL", finalizedAt: new Date(), finalizedById: auth.userId },
    });
    await writeAudit(tx, {
      schoolId,
      actorId: auth.userId,
      action: "ATTENDANCE_FINALIZED",
      entityType: "AttendanceMeeting",
      entityId: meetingId,
      metadata: { records: records.map((item) => ({ studentId: item.studentId, status: item.status })) },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
  return meetingSheet(prisma, schoolId, meetingId, auth);
}

export async function correctAttendanceMeeting(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meetingId: string,
  input: { reason: string; records: RecordInput[] },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!canCorrect(auth, schoolId)) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const current = await meetingSheet(prisma, schoolId, meetingId, auth);
  if (current.meeting.status !== "FINAL") throw new AppError(409, "CONFLICT", "Koreksi hanya untuk pertemuan yang sudah final.");
  assertRecords(current.students, input.records);
  const marks = new Map(current.students.map((student) => [student.studentId, student.status as Mark]));
  for (const record of input.records) marks.set(record.studentId, record.status);
  await assertComplete(current.students, marks);
  const previous = current.students.map((student) => ({ studentId: student.studentId, status: student.status }));
  await prisma.$transaction(async (tx) => {
    await writeRecords(tx, schoolId, meetingId, input.records);
    await tx.attendanceCorrection.create({
      data: { schoolId, meetingId, reason: input.reason.trim(), actorId: auth.userId },
    });
    await writeAudit(tx, {
      schoolId,
      actorId: auth.userId,
      action: "ATTENDANCE_CORRECTED",
      entityType: "AttendanceMeeting",
      entityId: meetingId,
      metadata: { reason: input.reason.trim(), previous, next: input.records },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
  return meetingSheet(prisma, schoolId, meetingId, auth);
}
