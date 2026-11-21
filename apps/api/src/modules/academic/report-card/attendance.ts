import type { PrismaClient } from "@prisma/client";
import { toDateOnly } from "../common.ts";
import type { ReportAttendance, ReportAttendanceCompleteness, ReportAttendanceCoverage } from "./types.ts";

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA";

type StudentAttendance = Pick<ReportAttendance, "dataStatus" | "sakit" | "izin" | "alpa" | "completeness" | "unverifiedDays">;

export type DailyAttendanceRead = {
  coverage: ReportAttendanceCoverage;
  byStudent: Map<string, StudentAttendance>;
};

export async function readFinalDailyAttendance(
  prisma: PrismaClient,
  schoolId: string,
  homeroomId: string,
  academicPeriodId: string,
  studentIds: string[],
): Promise<DailyAttendanceRead> {
  const [days, rule] = await Promise.all([
    prisma.dailyAttendance.findMany({
      where: { schoolId, homeroomAssignmentId: homeroomId, status: "FINAL" },
      select: { attendanceDate: true, records: { select: { studentId: true, status: true } } },
      orderBy: { attendanceDate: "asc" },
    }),
    prisma.attendanceCompletenessRule.findFirst({
      where: { schoolId, academicPeriodId, status: "ACTIVE" },
      select: { days: { where: { kind: "PEMBELAJARAN" }, select: { date: true } } },
    }),
  ]);
  const dates = [...new Set(days.map((day) => toDateOnly(day.attendanceDate)))].sort();
  const requiredDates = rule
    ? [...new Set(rule.days.map((day) => toDateOnly(day.date)))].sort()
    : [];
  const configured = requiredDates.length > 0;
  const finalDates = new Set(dates);
  const finalRequiredDays = requiredDates.filter((date) => finalDates.has(date)).length;
  const byStudent = new Map<string, StudentAttendance>();
  for (const studentId of studentIds) {
    const counts: Record<Exclude<Mark, "HADIR">, number> = { SAKIT: 0, IZIN: 0, ALPA: 0 };
    const seen = new Set<string>();
    const marks = new Map<string, Mark>();
    for (const day of days) {
      const date = toDateOnly(day.attendanceDate);
      const status = day.records.find((record) => record.studentId === studentId)?.status ?? null;
      if (!status || seen.has(date)) continue;
      seen.add(date);
      marks.set(date, status);
      if (status !== "HADIR") counts[status] += 1;
    }
    const unverifiedDays = configured ? requiredDates.filter((date) => !marks.has(date)).length : null;
    byStudent.set(studentId, {
      ...(seen.size === 0
        ? { dataStatus: "BELUM_ADA_DATA" as const, sakit: null, izin: null, alpa: null }
        : { dataStatus: "TERSEDIA" as const, sakit: counts.SAKIT, izin: counts.IZIN, alpa: counts.ALPA }),
      completeness: studentCompleteness(configured, unverifiedDays),
      unverifiedDays,
    });
  }
  const students = [...byStudent.values()];
  const coverage: ReportAttendanceCoverage = {
    completeness: classCompleteness(configured, finalRequiredDays, requiredDates.length, students),
    finalDays: dates.length,
    verifiedFrom: dates[0] ?? null,
    verifiedTo: dates.at(-1) ?? null,
    requiredDays: configured ? requiredDates.length : null,
    finalRequiredDays,
    openRequiredDays: configured ? requiredDates.length - finalRequiredDays : null,
  };
  return { coverage, byStudent };
}

export function studentAttendance(read: DailyAttendanceRead, studentId: string): ReportAttendance {
  const row = read.byStudent.get(studentId) ?? {
    dataStatus: "BELUM_ADA_DATA" as const,
    sakit: null,
    izin: null,
    alpa: null,
    completeness: read.coverage.requiredDays === null ? "BELUM_DIKONFIGURASI" as const : "BELUM_LENGKAP" as const,
    unverifiedDays: read.coverage.requiredDays,
  };
  return { ...read.coverage, ...row };
}

function studentCompleteness(configured: boolean, unverifiedDays: number | null): ReportAttendanceCompleteness {
  if (!configured || unverifiedDays === null) return "BELUM_DIKONFIGURASI";
  return unverifiedDays === 0 ? "LENGKAP" : "BELUM_LENGKAP";
}

function classCompleteness(
  configured: boolean,
  finalRequiredDays: number,
  requiredDays: number,
  students: StudentAttendance[],
): ReportAttendanceCompleteness {
  if (!configured) return "BELUM_DIKONFIGURASI";
  const calendarClosed = finalRequiredDays === requiredDays;
  const studentsClosed = students.every((student) => student.completeness === "LENGKAP");
  return calendarClosed && studentsClosed ? "LENGKAP" : "BELUM_LENGKAP";
}
