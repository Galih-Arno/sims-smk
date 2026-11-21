import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { notFound, parseDateOnly, rethrowKnown, toDateOnly } from "./common.ts";

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA";
type RecordInput = { studentId: string; status: Mark | null; note: string | null };

const CORRECTION_ROLES = ["ADMIN_SEKOLAH", "WAKAKUR"] as const;

const homeroomInclude = {
  class: { select: { id: true, name: true } },
  academicPeriod: { select: { id: true, name: true, startDate: true, endDate: true, isActive: true } },
  teacher: { select: { userId: true, name: true } },
} satisfies Prisma.HomeroomAssignmentInclude;

type HomeroomRow = Prisma.HomeroomAssignmentGetPayload<{ include: typeof homeroomInclude }>;

function hasSchoolRole(auth: AuthState, schoolId: string, roles: readonly string[]): boolean {
  return auth.assignments.some((item) => item.schoolId === schoolId && roles.includes(item.roleCode));
}

function canCorrect(auth: AuthState, schoolId: string): boolean {
  return auth.isSystemOwner || hasSchoolRole(auth, schoolId, CORRECTION_ROLES);
}

function isEditor(auth: AuthState, schoolId: string, homeroom: HomeroomRow): boolean {
  return homeroom.teacher.userId === auth.userId && hasSchoolRole(auth, schoolId, ["WALI_KELAS"]);
}

function assertInPeriod(date: string, homeroom: HomeroomRow) {
  const start = toDateOnly(homeroom.academicPeriod.startDate);
  const end = toDateOnly(homeroom.academicPeriod.endDate);
  if (date < start || date > end) throw new AppError(400, "VALIDATION_ERROR", "Tanggal di luar periode akademik kelas binaan.");
}

function defaultDate(homeroom: HomeroomRow): string {
  const start = toDateOnly(homeroom.academicPeriod.startDate);
  const end = toDateOnly(homeroom.academicPeriod.endDate);
  const today = new Date().toISOString().slice(0, 10);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

async function visibleHomerooms(prisma: PrismaClient, auth: AuthState, schoolId: string) {
  const wali = hasSchoolRole(auth, schoolId, ["WALI_KELAS"]);
  const corrector = canCorrect(auth, schoolId);
  if (!auth.isSystemOwner && !wali && !corrector) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId, isActive: true },
    select: { id: true },
  });
  const ownClasses = wali && !auth.isSystemOwner && !corrector;
  return prisma.homeroomAssignment.findMany({
    where: ownClasses
      ? { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } }
      : { schoolId, academicPeriod: { isActive: true } },
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

function assertRecords(students: Array<{ studentId: string }>, records: RecordInput[]) {
  const ids = new Set(students.map((item) => item.studentId));
  const seen = new Set<string>();
  for (const record of records) {
    if (!ids.has(record.studentId)) throw new AppError(400, "INVALID_REFERENCE", "Siswa tidak termasuk kelas binaan ini.");
    if (seen.has(record.studentId)) throw new AppError(400, "BAD_REQUEST", "Status kehadiran siswa terduplikasi.");
    seen.add(record.studentId);
  }
}

async function assertComplete(students: Array<{ studentId: string }>, marks: Map<string, Mark | null>) {
  if (students.length === 0) throw new AppError(409, "CONFLICT", "Kelas tidak memiliki siswa aktif.");
  const missing = students.filter((student) => marks.get(student.studentId) == null);
  if (missing.length > 0) throw new AppError(409, "CONFLICT", "Finalisasi hanya dapat dilakukan setelah seluruh siswa aktif memiliki status harian.");
}

async function writeRecords(prisma: Prisma.TransactionClient, schoolId: string, dailyAttendanceId: string, records: RecordInput[]) {
  for (const record of records) {
    if (record.status === null) {
      await prisma.dailyAttendanceRecord.deleteMany({ where: { dailyAttendanceId, studentId: record.studentId } });
      continue;
    }
    const note = record.note?.trim() || null;
    await prisma.dailyAttendanceRecord.upsert({
      where: { dailyAttendanceId_studentId: { dailyAttendanceId, studentId: record.studentId } },
      create: { schoolId, dailyAttendanceId, studentId: record.studentId, status: record.status, note },
      update: { status: record.status, note },
    });
  }
}

export async function getDailyAttendance(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  date: string | undefined,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const { homerooms, selected } = await selectedHomeroom(prisma, auth, schoolId, homeroomId);
  const listed = homerooms.map((item) => ({ id: item.id, className: item.class.name, periodName: item.academicPeriod.name }));
  if (!selected) return { homerooms: listed, sheet: null };
  const attendanceDate = date ?? defaultDate(selected);
  assertInPeriod(attendanceDate, selected);
  const sheet = await buildSheet(prisma, auth, schoolId, selected, attendanceDate);
  return { homerooms: listed, sheet };
}

async function buildSheet(prisma: PrismaClient, auth: AuthState, schoolId: string, homeroom: HomeroomRow, attendanceDate: string) {
  const dayDate = parseDateOnly(attendanceDate);
  const [students, day, meetings, finals] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, classId: homeroom.classId, isActive: true },
      select: { id: true, name: true, nis: true },
      orderBy: [{ name: "asc" }, { nis: "asc" }],
    }),
    prisma.dailyAttendance.findUnique({
      where: { homeroomAssignmentId_attendanceDate: { homeroomAssignmentId: homeroom.id, attendanceDate: dayDate } },
      include: { records: { select: { studentId: true, status: true, note: true } } },
    }),
    prisma.attendanceMeeting.findMany({
      where: {
        schoolId,
        status: "FINAL",
        meetingDate: dayDate,
        teachingAssignment: { schoolId, classId: homeroom.classId, academicPeriodId: homeroom.academicPeriod.id },
      },
      select: {
        id: true,
        sessionNo: true,
        teachingAssignment: { select: { subject: { select: { name: true } }, teacher: { select: { name: true } } } },
        records: { select: { studentId: true, status: true } },
      },
      orderBy: [{ sessionNo: "asc" }, { id: "asc" }],
    }),
    prisma.dailyAttendance.findMany({
      where: { schoolId, homeroomAssignmentId: homeroom.id, status: "FINAL" },
      select: { id: true, records: { select: { studentId: true, status: true } } },
    }),
  ]);
  const saved = new Map((day?.records ?? []).map((record) => [record.studentId, record]));
  const editor = isEditor(auth, schoolId, homeroom);
  const corrector = canCorrect(auth, schoolId);
  const locked = day?.status === "FINAL";
  return {
    homeroomId: homeroom.id,
    className: homeroom.class.name,
    periodName: homeroom.academicPeriod.name,
    periodStart: toDateOnly(homeroom.academicPeriod.startDate),
    periodEnd: toDateOnly(homeroom.academicPeriod.endDate),
    attendanceDate,
    dayStatus: day?.status ?? null,
    finalDays: finals.length,
    canEdit: editor && !locked,
    canFinalize: editor && !locked,
    canCorrect: corrector && locked,
    students: students.map((student) => {
      const sessions = meetings.flatMap((meeting) => {
        const status = meeting.records.find((record) => record.studentId === student.id)?.status ?? null;
        if (!status) return [];
        return [{
          meetingId: meeting.id,
          subjectName: meeting.teachingAssignment.subject.name,
          sessionNo: meeting.sessionNo,
          teacherName: meeting.teachingAssignment.teacher.name,
          status,
        }];
      });
      const distinct = new Set(sessions.map((session) => session.status));
      const current = saved.get(student.id);
      return {
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        status: current?.status ?? null,
        note: current?.note ?? null,
        reference: {
          dataStatus: sessions.length > 0 ? "TERSEDIA" as const : "BELUM_ADA_DATA" as const,
          conflict: distinct.size > 1,
          sessions,
        },
      };
    }),
    recap: students.map((student) => {
      const counts = { SAKIT: 0, IZIN: 0, ALPA: 0 };
      let seen = false;
      for (const finalDay of finals) {
        const status = finalDay.records.find((record) => record.studentId === student.id)?.status ?? null;
        if (!status) continue;
        seen = true;
        if (status === "SAKIT" || status === "IZIN" || status === "ALPA") counts[status] += 1;
      }
      return {
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        dataStatus: seen ? "TERSEDIA" as const : "BELUM_ADA_DATA" as const,
        sakit: seen ? counts.SAKIT : null,
        izin: seen ? counts.IZIN : null,
        alpa: seen ? counts.ALPA : null,
      };
    }),
  };
}

async function editableDay(prisma: PrismaClient, auth: AuthState, schoolId: string, homeroomId: string, attendanceDate: string) {
  const { selected } = await selectedHomeroom(prisma, auth, schoolId, homeroomId);
  if (!selected) notFound();
  if (!isEditor(auth, schoolId, selected)) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  assertInPeriod(attendanceDate, selected);
  const students = await prisma.student.findMany({
    where: { schoolId, classId: selected.classId, isActive: true },
    select: { id: true },
  });
  const day = await prisma.dailyAttendance.findUnique({
    where: { homeroomAssignmentId_attendanceDate: { homeroomAssignmentId: selected.id, attendanceDate: parseDateOnly(attendanceDate) } },
    select: { id: true, status: true },
  });
  if (day?.status === "FINAL") throw new AppError(409, "CONFLICT", "Absensi harian final terkunci.");
  return { homeroom: selected, students: students.map((student) => ({ studentId: student.id })), day };
}

export async function saveDailyAttendance(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { homeroomId: string; attendanceDate: string; records: RecordInput[] },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const current = await editableDay(prisma, auth, schoolId, input.homeroomId, input.attendanceDate);
  assertRecords(current.students, input.records);
  try {
    await prisma.$transaction(async (tx) => {
      const day = current.day ?? await tx.dailyAttendance.create({
        data: {
          schoolId,
          homeroomAssignmentId: current.homeroom.id,
          attendanceDate: parseDateOnly(input.attendanceDate),
          status: "DRAFT",
          createdById: auth.userId,
        },
        select: { id: true },
      });
      await writeRecords(tx, schoolId, day.id, input.records);
      await writeAudit(tx, {
        schoolId,
        actorId: auth.userId,
        action: "DAILY_ATTENDANCE_DRAFT_SAVED",
        entityType: "DailyAttendance",
        entityId: day.id,
        metadata: { homeroomId: current.homeroom.id, attendanceDate: input.attendanceDate, records: input.records },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
  } catch (error) {
    rethrowKnown(error, "Absensi harian pada tanggal ini sudah ada.");
  }
  return { sheet: await buildSheet(prisma, auth, schoolId, current.homeroom, input.attendanceDate) };
}

export async function finalizeDailyAttendance(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { homeroomId: string; attendanceDate: string; records: RecordInput[] },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const current = await editableDay(prisma, auth, schoolId, input.homeroomId, input.attendanceDate);
  assertRecords(current.students, input.records);
  const existingRecords = current.day
    ? await prisma.dailyAttendanceRecord.findMany({ where: { dailyAttendanceId: current.day.id }, select: { studentId: true, status: true } })
    : [];
  const marks = new Map<string, Mark | null>(existingRecords.map((record) => [record.studentId, record.status]));
  for (const record of input.records) marks.set(record.studentId, record.status);
  await assertComplete(current.students, marks);
  try {
    await prisma.$transaction(async (tx) => {
      const day = current.day
        ? await tx.dailyAttendance.update({
            where: { id: current.day.id },
            data: { status: "FINAL", finalizedAt: new Date(), finalizedById: auth.userId },
            select: { id: true },
          })
        : await tx.dailyAttendance.create({
            data: {
              schoolId,
              homeroomAssignmentId: current.homeroom.id,
              attendanceDate: parseDateOnly(input.attendanceDate),
              status: "FINAL",
              finalizedAt: new Date(),
              finalizedById: auth.userId,
              createdById: auth.userId,
            },
            select: { id: true },
          });
      await writeRecords(tx, schoolId, day.id, input.records);
      await writeAudit(tx, {
        schoolId,
        actorId: auth.userId,
        action: "DAILY_ATTENDANCE_FINALIZED",
        entityType: "DailyAttendance",
        entityId: day.id,
        metadata: { homeroomId: current.homeroom.id, attendanceDate: input.attendanceDate, records: input.records },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
  } catch (error) {
    rethrowKnown(error, "Absensi harian pada tanggal ini sudah ada.");
  }
  return { sheet: await buildSheet(prisma, auth, schoolId, current.homeroom, input.attendanceDate) };
}

export async function correctDailyAttendance(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { homeroomId: string; attendanceDate: string; reason: string; records: RecordInput[] },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!canCorrect(auth, schoolId)) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  const { selected } = await selectedHomeroom(prisma, auth, schoolId, input.homeroomId);
  if (!selected) notFound();
  assertInPeriod(input.attendanceDate, selected);
  const day = await prisma.dailyAttendance.findUnique({
    where: { homeroomAssignmentId_attendanceDate: { homeroomAssignmentId: selected.id, attendanceDate: parseDateOnly(input.attendanceDate) } },
    include: { records: { select: { studentId: true, status: true, note: true } } },
  });
  if (!day) notFound();
  if (day.status !== "FINAL") throw new AppError(409, "CONFLICT", "Koreksi hanya untuk absensi harian yang sudah final.");
  const students = await prisma.student.findMany({
    where: { schoolId, classId: selected.classId, isActive: true },
    select: { id: true },
  });
  const listed = students.map((student) => ({ studentId: student.id }));
  assertRecords(listed, input.records);
  const marks = new Map<string, Mark | null>(day.records.map((record) => [record.studentId, record.status]));
  for (const record of input.records) marks.set(record.studentId, record.status);
  await assertComplete(listed, marks);
  const previous = day.records.map((record) => ({ studentId: record.studentId, status: record.status, note: record.note }));
  await prisma.$transaction(async (tx) => {
    await writeRecords(tx, schoolId, day.id, input.records);
    await tx.dailyAttendanceCorrection.create({
      data: { schoolId, dailyAttendanceId: day.id, reason: input.reason.trim(), actorId: auth.userId },
    });
    await writeAudit(tx, {
      schoolId,
      actorId: auth.userId,
      action: "DAILY_ATTENDANCE_CORRECTED",
      entityType: "DailyAttendance",
      entityId: day.id,
      metadata: { reason: input.reason.trim(), attendanceDate: input.attendanceDate, previous, next: input.records },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
  return { sheet: await buildSheet(prisma, auth, schoolId, selected, input.attendanceDate) };
}
