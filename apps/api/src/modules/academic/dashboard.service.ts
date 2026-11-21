import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";

export type SchoolDashboardView = "admin" | "kepala" | "wakakur" | "guru" | "wali";

type AttendanceSummary = {
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
};

type ReportSummary = {
  draf: number;
  diajukan: number;
  disetujui: number;
  dikembalikan: number;
  disahkan: number;
};

type GradeStatus = "NONE" | "DRAFT" | "SUBMITTED" | "REVISION_REQUESTED";

type AssignmentRow = {
  id: string;
  classId: string;
  className: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  teacherUserId: string | null;
  status: GradeStatus;
};

const EMPTY_ATTENDANCE: AttendanceSummary = { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
const EMPTY_REPORTS: ReportSummary = { draf: 0, diajukan: 0, disetujui: 0, dikembalikan: 0, disahkan: 0 };

export async function ownerDashboard(prisma: PrismaClient, auth: AuthState) {
  if (!auth.isSystemOwner) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  const [schools, users, teachers, students] = await Promise.all([
    prisma.school.groupBy({ by: ["accessStatus"], _count: { _all: true } }),
    prisma.user.count(),
    prisma.teacher.count(),
    prisma.student.count(),
  ]);
  const count = (status: "AKTIF" | "NONAKTIF" | "DITANGGUHKAN") =>
    schools.find((row) => row.accessStatus === status)?._count._all ?? 0;
  return {
    view: "owner" as const,
    schools: schools.reduce((sum, row) => sum + row._count._all, 0),
    active: count("AKTIF"),
    inactive: count("NONAKTIF"),
    suspended: count("DITANGGUHKAN"),
    users,
    teachers,
    students,
  };
}

export async function schoolDashboard(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  view: SchoolDashboardView,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  await assertView(auth, schoolId, view);
  const period = await prisma.academicPeriod.findFirst({
    where: { schoolId, isActive: true },
    select: { id: true, name: true, academicYearId: true },
  });
  if (view === "admin") return adminDashboard(prisma, schoolId, period);
  if (view === "kepala") return kepalaDashboard(prisma, schoolId, period);
  if (view === "wakakur") return wakakurDashboard(prisma, schoolId, period);
  if (view === "guru") return guruDashboard(prisma, auth.userId, schoolId, period);
  return waliDashboard(prisma, auth.userId, schoolId, period);
}

function assertView(auth: AuthState, schoolId: string, view: SchoolDashboardView) {
  const required =
    view === "admin" ? (["ADMIN_SEKOLAH", "TU"] as const)
    : view === "kepala" ? (["KEPALA_SEKOLAH"] as const)
    : view === "wakakur" ? (["WAKAKUR"] as const)
    : view === "guru" ? (["GURU_MAPEL"] as const)
    : (["WALI_KELAS"] as const);
  if (view !== "guru" && view !== "wali" && auth.isSystemOwner) return;
  const allowed = auth.assignments.some(
    (assignment) => assignment.schoolId === schoolId && (required as readonly string[]).includes(assignment.roleCode),
  );
  if (!allowed) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
}

async function adminDashboard(
  prisma: PrismaClient,
  schoolId: string,
  period: { id: string; name: string; academicYearId: string | null } | null,
) {
  const yearFilter = period?.academicYearId ? { academicYearId: period.academicYearId } : {};
  const [teachers, students, classes, subjects, studentsWithoutClass, teachersWithoutAccount, activeClasses, homerooms] = await Promise.all([
    prisma.teacher.count({ where: { schoolId, isActive: true } }),
    prisma.student.count({ where: { schoolId, isActive: true } }),
    prisma.schoolClass.count({ where: { schoolId, isActive: true, ...yearFilter } }),
    prisma.subject.count({ where: { schoolId, isActive: true } }),
    prisma.student.count({ where: { schoolId, isActive: true, classId: null } }),
    prisma.teacher.count({ where: { schoolId, isActive: true, userId: null } }),
    prisma.schoolClass.findMany({ where: { schoolId, isActive: true, ...yearFilter }, select: { id: true } }),
    period
      ? prisma.homeroomAssignment.findMany({ where: { schoolId, academicPeriodId: period.id }, select: { classId: true } })
      : Promise.resolve([]),
  ]);
  const covered = new Set(homerooms.map((item) => item.classId));
  return {
    view: "admin" as const,
    periodName: period?.name ?? null,
    teachers,
    students,
    classes,
    subjects,
    studentsWithoutClass,
    teachersWithoutAccount,
    classesWithoutHomeroom: period ? activeClasses.filter((item) => !covered.has(item.id)).length : null,
  };
}

async function kepalaDashboard(
  prisma: PrismaClient,
  schoolId: string,
  period: { id: string; name: string; academicYearId: string | null } | null,
) {
  const yearFilter = period?.academicYearId ? { academicYearId: period.academicYearId } : {};
  const [teachers, students, classes, assignments, reports, attendance] = await Promise.all([
    prisma.teacher.count({ where: { schoolId, isActive: true } }),
    prisma.student.count({ where: { schoolId, isActive: true } }),
    prisma.schoolClass.count({ where: { schoolId, isActive: true, ...yearFilter } }),
    loadAssignments(prisma, schoolId, period?.id ?? null),
    reportCounts(prisma, schoolId, period?.id ?? null),
    attendanceSummary(prisma, schoolId, period?.id ?? null),
  ]);
  const submitted = assignments.filter((item) => item.status === "SUBMITTED").length;
  return {
    view: "kepala" as const,
    periodName: period?.name ?? null,
    teachers,
    students,
    classes,
    gradeSubmitted: submitted,
    gradeTotal: assignments.length,
    reportsPending: reports.disetujui,
    reportsApproved: reports.disahkan,
    attendance,
  };
}

async function wakakurDashboard(
  prisma: PrismaClient,
  schoolId: string,
  period: { id: string; name: string; academicYearId: string | null } | null,
) {
  const [assignments, reports, curriculum] = await Promise.all([
    loadAssignments(prisma, schoolId, period?.id ?? null),
    reportCounts(prisma, schoolId, period?.id ?? null),
    curriculumSummary(prisma, schoolId, period?.academicYearId ?? null),
  ]);
  const byClass = new Map<string, { name: string; submitted: number; total: number }>();
  const pendingTeachers = new Map<string, { name: string; pending: number }>();
  for (const item of assignments) {
    const row = byClass.get(item.classId) ?? { name: item.className, submitted: 0, total: 0 };
    row.total += 1;
    if (item.status === "SUBMITTED") row.submitted += 1;
    byClass.set(item.classId, row);
    if (item.status !== "SUBMITTED") {
      const teacher = pendingTeachers.get(item.teacherId) ?? { name: item.teacherName, pending: 0 };
      teacher.pending += 1;
      pendingTeachers.set(item.teacherId, teacher);
    }
  }
  return {
    view: "wakakur" as const,
    periodName: period?.name ?? null,
    classes: [...byClass.values()].sort((left, right) => left.name.localeCompare(right.name, "id")),
    pendingTeachers: [...pendingTeachers.values()].sort((left, right) => right.pending - left.pending || left.name.localeCompare(right.name, "id")),
    curricula: curriculum.curricula,
    classesWithoutCurriculum: curriculum.classesWithoutCurriculum,
    reportsPending: reports.diajukan,
  };
}

async function guruDashboard(
  prisma: PrismaClient,
  userId: string,
  schoolId: string,
  period: { id: string; name: string; academicYearId: string | null } | null,
) {
  const assignments = (await loadAssignments(prisma, schoolId, period?.id ?? null)).filter((item) => item.teacherUserId === userId);
  return {
    view: "guru" as const,
    periodName: period?.name ?? null,
    linked: assignments.length > 0 || Boolean(await prisma.teacher.findFirst({ where: { schoolId, userId }, select: { id: true } })),
    items: assignments.map((item) => ({
      id: item.id,
      className: item.className,
      subjectName: item.subjectName,
      status: item.status,
    })),
    submitted: assignments.filter((item) => item.status === "SUBMITTED").length,
    total: assignments.length,
    draft: assignments.filter((item) => item.status === "NONE" || item.status === "DRAFT").length,
    revision: assignments.filter((item) => item.status === "REVISION_REQUESTED").length,
  };
}

async function waliDashboard(
  prisma: PrismaClient,
  userId: string,
  schoolId: string,
  period: { id: string; name: string; academicYearId: string | null } | null,
) {
  const teacher = await prisma.teacher.findFirst({ where: { schoolId, userId }, select: { id: true } });
  if (!teacher || !period) {
    return {
      view: "wali" as const,
      periodName: period?.name ?? null,
      classes: [],
      students: 0,
      gradeSubmitted: 0,
      gradeTotal: 0,
      attendance: EMPTY_ATTENDANCE,
      reports: EMPTY_REPORTS,
    };
  }
  const homerooms = await prisma.homeroomAssignment.findMany({
    where: { schoolId, teacherId: teacher.id, academicPeriodId: period.id },
    select: {
      classId: true,
      class: { select: { name: true, _count: { select: { students: { where: { isActive: true, schoolId } } } } } },
    },
  });
  const classIds = homerooms.map((item) => item.classId);
  const assignments = (await loadAssignments(prisma, schoolId, period.id)).filter((item) => classIds.includes(item.classId));
  const [attendance, reports] = await Promise.all([
    attendanceSummary(prisma, schoolId, period.id, classIds),
    reportCounts(prisma, schoolId, period.id, classIds),
  ]);
  return {
    view: "wali" as const,
    periodName: period.name,
    classes: homerooms.map((item) => ({ name: item.class.name, students: item.class._count.students })),
    students: homerooms.reduce((sum, item) => sum + item.class._count.students, 0),
    gradeSubmitted: assignments.filter((item) => item.status === "SUBMITTED").length,
    gradeTotal: assignments.length,
    attendance,
    reports,
  };
}

async function loadAssignments(prisma: PrismaClient, schoolId: string, periodId: string | null): Promise<AssignmentRow[]> {
  if (!periodId) return [];
  const rows = await prisma.teachingAssignment.findMany({
    where: { schoolId, academicPeriodId: periodId },
    select: {
      id: true,
      classId: true,
      class: { select: { name: true } },
      subject: { select: { name: true } },
      teacher: { select: { id: true, name: true, userId: true } },
      gradeSubmission: { select: { status: true } },
    },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  return rows.map((row) => ({
    id: row.id,
    classId: row.classId,
    className: row.class.name,
    subjectName: row.subject.name,
    teacherId: row.teacher.id,
    teacherName: row.teacher.name,
    teacherUserId: row.teacher.userId,
    status: row.gradeSubmission?.status ?? "NONE",
  }));
}

async function curriculumSummary(prisma: PrismaClient, schoolId: string, yearId: string | null) {
  if (!yearId) return { curricula: 0, classesWithoutCurriculum: 0 };
  const [curricula, classes] = await Promise.all([
    prisma.curriculum.count({ where: { schoolId, academicYearId: yearId, isActive: true } }),
    prisma.schoolClass.findMany({ where: { schoolId, academicYearId: yearId, isActive: true }, select: { id: true } }),
  ]);
  if (classes.length === 0) return { curricula, classesWithoutCurriculum: 0 };
  const placed = await prisma.curriculumPlacement.findMany({
    where: { schoolId, classId: { in: classes.map((item) => item.id) } },
    select: { classId: true },
    distinct: ["classId"],
  });
  const covered = new Set(placed.map((item) => item.classId));
  return { curricula, classesWithoutCurriculum: classes.filter((item) => !covered.has(item.id)).length };
}

async function reportCounts(prisma: PrismaClient, schoolId: string, periodId: string | null, classIds?: string[]): Promise<ReportSummary> {
  if (!periodId || (classIds && classIds.length === 0)) return EMPTY_REPORTS;
  const rows = await prisma.reportCardWorkflow.groupBy({
    by: ["status"],
    where: { schoolId, academicPeriodId: periodId, ...(classIds ? { classId: { in: classIds } } : {}) },
    _count: { _all: true },
  });
  const summary = { ...EMPTY_REPORTS };
  for (const row of rows) {
    const count = row._count._all;
    if (row.status === "DRAF") summary.draf = count;
    if (row.status === "DIAJUKAN") summary.diajukan = count;
    if (row.status === "DISETUJUI_WAKAKUR") summary.disetujui = count;
    if (row.status === "DIKEMBALIKAN") summary.dikembalikan = count;
    if (row.status === "DISAHKAN") summary.disahkan = count;
  }
  return summary;
}

async function attendanceSummary(prisma: PrismaClient, schoolId: string, periodId: string | null, classIds?: string[]): Promise<AttendanceSummary> {
  if (!periodId || (classIds && classIds.length === 0)) return EMPTY_ATTENDANCE;
  const rows = await prisma.dailyAttendanceRecord.groupBy({
    by: ["status"],
    where: {
      schoolId,
      status: { not: null },
      dailyAttendance: {
        homeroom: {
          academicPeriodId: periodId,
          ...(classIds ? { classId: { in: classIds } } : {}),
        },
      },
    },
    _count: { _all: true },
  });
  const summary = { ...EMPTY_ATTENDANCE };
  for (const row of rows) {
    const count = row._count._all;
    if (row.status === "HADIR") summary.hadir = count;
    if (row.status === "SAKIT") summary.sakit = count;
    if (row.status === "IZIN") summary.izin = count;
    if (row.status === "ALPA") summary.alpa = count;
    summary.total += count;
  }
  return summary;
}
