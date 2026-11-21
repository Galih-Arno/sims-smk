import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { parseDateOnly, toDateOnly } from "./common.ts";

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA";

export type AttendanceRecapSession = {
  meetingId: string;
  meetingDate: string;
  sessionNo: number;
  subjectId: string;
  subjectName: string;
  teacherName: string;
  status: Mark;
};

export type AttendanceRecapSubjectLine = {
  subjectId: string;
  name: string;
  teacherName: string;
  dataStatus: "TERSEDIA" | "BELUM_ADA_DATA";
  hadir: number | null;
  sakit: number | null;
  izin: number | null;
  alpa: number | null;
  sessions: AttendanceRecapSession[];
};

export type HomeroomAttendanceRecapDto = {
  homerooms: Array<{ id: string; className: string; periodName: string }>;
  recap: {
    homeroomId: string;
    className: string;
    periodName: string;
    subjects: Array<{ subjectId: string; code: string; name: string; teacherName: string; finalMeetings: number; dataStatus: "TERSEDIA" | "BELUM_ADA_DATA" }>;
    students: Array<{ studentId: string; name: string; nis: string | null; subjects: AttendanceRecapSubjectLine[] }>;
  } | null;
};

const homeroomInclude = {
  class: { select: { id: true, name: true } },
  academicPeriod: { select: { id: true, name: true } },
} satisfies Prisma.HomeroomAssignmentInclude;

export async function getHomeroomAttendanceRecap(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  range: { from?: string; to?: string },
  meta: RequestMeta,
): Promise<HomeroomAttendanceRecapDto> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!auth.isSystemOwner && !auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "WALI_KELAS")) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId, isActive: true },
    select: { id: true },
  });
  const homerooms = await prisma.homeroomAssignment.findMany({
    where: auth.isSystemOwner
      ? { schoolId, academicPeriod: { isActive: true } }
      : { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } },
    include: homeroomInclude,
    orderBy: { class: { name: "asc" } },
  });
  const listed = homerooms.map((item) => ({ id: item.id, className: item.class.name, periodName: item.academicPeriod.name }));
  const selected = homeroomId ? homerooms.find((item) => item.id === homeroomId) : homerooms[0];
  if (homeroomId && !selected) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (!selected) return { homerooms: listed, recap: null };

  const [students, assignments] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, classId: selected.classId, isActive: true },
      select: { id: true, name: true, nis: true },
      orderBy: [{ name: "asc" }, { nis: "asc" }],
    }),
    prisma.teachingAssignment.findMany({
      where: { schoolId, classId: selected.classId, academicPeriodId: selected.academicPeriod.id },
      select: { id: true, subject: { select: { id: true, code: true, name: true } }, teacher: { select: { name: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
  ]);
  const meetings = assignments.length === 0
    ? []
    : await prisma.attendanceMeeting.findMany({
        where: {
          schoolId,
          teachingAssignmentId: { in: assignments.map((item) => item.id) },
          status: "FINAL",
          ...dateFilter(range),
        },
        select: {
          id: true,
          teachingAssignmentId: true,
          meetingDate: true,
          sessionNo: true,
          records: { select: { studentId: true, status: true } },
        },
        orderBy: [{ meetingDate: "asc" }, { sessionNo: "asc" }],
      });
  const meetingsByAssignment = new Map<string, typeof meetings>();
  for (const meeting of meetings) {
    const rows = meetingsByAssignment.get(meeting.teachingAssignmentId) ?? [];
    rows.push(meeting);
    meetingsByAssignment.set(meeting.teachingAssignmentId, rows);
  }

  const subjects = assignments.map((assignment) => {
    const finalMeetings = meetingsByAssignment.get(assignment.id)?.length ?? 0;
    return {
      subjectId: assignment.subject.id,
      code: assignment.subject.code,
      name: assignment.subject.name,
      teacherName: assignment.teacher.name,
      finalMeetings,
      dataStatus: finalMeetings > 0 ? "TERSEDIA" as const : "BELUM_ADA_DATA" as const,
    };
  });
  const recapStudents = students.map((student) => ({
    studentId: student.id,
    name: student.name,
    nis: student.nis,
    subjects: assignments.map((assignment) => subjectLine(student.id, assignment, meetingsByAssignment.get(assignment.id) ?? [])),
  }));

  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "ATTENDANCE_RECAP_READ",
    entityType: "HomeroomAssignment",
    entityId: selected.id,
    metadata: {
      classId: selected.classId,
      academicPeriodId: selected.academicPeriod.id,
      students: students.length,
      finalMeetings: meetings.length,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    homerooms: listed,
    recap: {
      homeroomId: selected.id,
      className: selected.class.name,
      periodName: selected.academicPeriod.name,
      subjects,
      students: recapStudents,
    },
  };
}

function dateFilter(range: { from?: string; to?: string }): Prisma.AttendanceMeetingWhereInput {
  if (!range.from && !range.to) return {};
  return {
    meetingDate: {
      ...(range.from ? { gte: parseDateOnly(range.from) } : {}),
      ...(range.to ? { lte: parseDateOnly(range.to) } : {}),
    },
  };
}

function subjectLine(
  studentId: string,
  assignment: { subject: { id: string; name: string }; teacher: { name: string } },
  meetings: Array<{ id: string; meetingDate: Date; sessionNo: number; records: Array<{ studentId: string; status: Mark | null }> }>,
): AttendanceRecapSubjectLine {
  if (meetings.length === 0) {
    return {
      subjectId: assignment.subject.id,
      name: assignment.subject.name,
      teacherName: assignment.teacher.name,
      dataStatus: "BELUM_ADA_DATA",
      hadir: null,
      sakit: null,
      izin: null,
      alpa: null,
      sessions: [],
    };
  }
  const counts: Record<Mark, number> = { HADIR: 0, SAKIT: 0, IZIN: 0, ALPA: 0 };
  const sessions: AttendanceRecapSession[] = [];
  for (const meeting of meetings) {
    const status = meeting.records.find((record) => record.studentId === studentId)?.status ?? null;
    if (!status) continue;
    counts[status] += 1;
    sessions.push({
      meetingId: meeting.id,
      meetingDate: toDateOnly(meeting.meetingDate),
      sessionNo: meeting.sessionNo,
      subjectId: assignment.subject.id,
      subjectName: assignment.subject.name,
      teacherName: assignment.teacher.name,
      status,
    });
  }
  return {
    subjectId: assignment.subject.id,
    name: assignment.subject.name,
    teacherName: assignment.teacher.name,
    dataStatus: "TERSEDIA",
    hadir: counts.HADIR,
    sakit: counts.SAKIT,
    izin: counts.IZIN,
    alpa: counts.ALPA,
    sessions,
  };
}
