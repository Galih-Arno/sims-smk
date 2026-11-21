import type { RoleCode } from "@sims/shared";
import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";

const SCHOOL_READ_ROLES: readonly RoleCode[] = ["ADMIN_SEKOLAH", "WAKAKUR", "KEPALA_SEKOLAH", "TU"];

export type DataScope =
  | { kind: "all" }
  | {
      kind: "assigned";
      teacherId: string | null;
      classIds: string[];
      subjectIds: string[];
      homeroomClassIds: string[];
    };

export async function assertCanManage(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<void> {
  if (auth.isSystemOwner) {
    await assertSchoolAccess(prisma, auth, schoolId, meta);
    return;
  }

  const isAdmin = auth.assignments.some(
    (assignment) => assignment.schoolId === schoolId && assignment.roleCode === "ADMIN_SEKOLAH",
  );
  if (isAdmin) return;

  const inSchool = auth.assignments.some((assignment) => assignment.schoolId === schoolId);
  if (!inSchool) {
    await assertSchoolAccess(prisma, auth, schoolId, meta);
  }
  throw new AppError(403, "FORBIDDEN", MSG.forbidden);
}

export async function loadScope(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<DataScope> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (
    auth.isSystemOwner ||
    auth.assignments.some(
      (assignment) => assignment.schoolId === schoolId && SCHOOL_READ_ROLES.includes(assignment.roleCode),
    )
  ) {
    return { kind: "all" };
  }

  const canViewAssigned = auth.assignments.some(
    (assignment) =>
      assignment.schoolId === schoolId &&
      (assignment.roleCode === "GURU_MAPEL" || assignment.roleCode === "WALI_KELAS"),
  );
  if (!canViewAssigned) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }

  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId },
    select: { id: true },
  });
  if (!teacher) {
    return { kind: "assigned", teacherId: null, classIds: [], subjectIds: [], homeroomClassIds: [] };
  }

  const [teachings, homerooms] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: { schoolId, teacherId: teacher.id },
      select: { classId: true, subjectId: true },
    }),
    prisma.homeroomAssignment.findMany({
      where: { schoolId, teacherId: teacher.id },
      select: { classId: true },
    }),
  ]);
  const homeroomClassIds = [...new Set(homerooms.map((item) => item.classId))];
  const classIds = [...new Set([...teachings.map((item) => item.classId), ...homeroomClassIds])];
  const subjectIds = new Set(teachings.map((item) => item.subjectId));
  if (homeroomClassIds.length > 0) {
    const classTeachings = await prisma.teachingAssignment.findMany({
      where: { schoolId, classId: { in: homeroomClassIds } },
      select: { subjectId: true },
    });
    for (const item of classTeachings) subjectIds.add(item.subjectId);
  }

  return {
    kind: "assigned",
    teacherId: teacher.id,
    classIds,
    subjectIds: [...subjectIds],
    homeroomClassIds,
  };
}

const COORDINATE_ROLES: readonly RoleCode[] = ["ADMIN_SEKOLAH", "WAKAKUR"];
const MONITOR_ROLES: readonly RoleCode[] = ["KEPALA_SEKOLAH", "TU"];

export type PlanAccess = {
  writeAll: boolean;
  readAll: boolean;
  teacherId: string | null;
  homeroomClassIds: string[];
};

export async function assertCanCoordinate(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<void> {
  if (auth.isSystemOwner) {
    await assertSchoolAccess(prisma, auth, schoolId, meta);
    return;
  }
  const allowed = auth.assignments.some(
    (assignment) => assignment.schoolId === schoolId && COORDINATE_ROLES.includes(assignment.roleCode),
  );
  if (allowed) return;
  const inSchool = auth.assignments.some((assignment) => assignment.schoolId === schoolId);
  if (!inSchool) await assertSchoolAccess(prisma, auth, schoolId, meta);
  throw new AppError(403, "FORBIDDEN", MSG.forbidden);
}

export async function loadPlanAccess(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<PlanAccess> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const writeAll =
    auth.isSystemOwner ||
    auth.assignments.some(
      (assignment) => assignment.schoolId === schoolId && COORDINATE_ROLES.includes(assignment.roleCode),
    );
  const monitor = auth.assignments.some(
    (assignment) => assignment.schoolId === schoolId && MONITOR_ROLES.includes(assignment.roleCode),
  );
  const teacherRole = auth.assignments.some(
    (assignment) =>
      assignment.schoolId === schoolId &&
      (assignment.roleCode === "GURU_MAPEL" || assignment.roleCode === "WALI_KELAS"),
  );
  if (!writeAll && !monitor && !teacherRole) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  if (!teacherRole) {
    return { writeAll, readAll: true, teacherId: null, homeroomClassIds: [] };
  }
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId },
    select: { id: true },
  });
  const homerooms = teacher
    ? await prisma.homeroomAssignment.findMany({
        where: { schoolId, teacherId: teacher.id },
        select: { classId: true },
      })
    : [];
  return {
    writeAll,
    readAll: writeAll || monitor,
    teacherId: teacher?.id ?? null,
    homeroomClassIds: [...new Set(homerooms.map((item) => item.classId))],
  };
}
