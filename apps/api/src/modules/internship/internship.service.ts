import type { PrismaClient } from "@prisma/client";
import { writeAudit } from "../../lib/audit.ts";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import { assertSchoolAccess, assertSchoolRole, type RequestMeta } from "../../lib/tenant.ts";

const INTERNSHIP_SUPERVISOR_ROLES = ["ADMIN_SEKOLAH", "KEPALA_SEKOLAH", "WAKAKUR", "GURU_MAPEL", "WALI_KELAS", "TU"] as const;

export async function listInternshipPlacements(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const canManageAll =
    auth.isSystemOwner ||
    auth.assignments.some(
      (a) => a.schoolId === schoolId && INTERNSHIP_SUPERVISOR_ROLES.includes(a.roleCode as (typeof INTERNSHIP_SUPERVISOR_ROLES)[number]),
    );

  const linkedStudents = await prisma.parentStudentLink.findMany({
    where: { schoolId, parentUserId: auth.userId },
    select: { studentId: true },
  });
  const linkedIds = linkedStudents.map((l) => l.studentId);

  const placements = await prisma.internshipPlacement.findMany({
    where: {
      schoolId,
      ...(canManageAll ? {} : { studentId: { in: linkedIds.length > 0 ? linkedIds : ["__none__"] } }),
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          nisn: true,
          class: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 150,
  });

  return { canManageAll, placements };
}

export async function createInternshipPlacement(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: {
    studentId: string;
    companyName: string;
    companyAddress?: string | null;
    supervisorName?: string | null;
    startDate: string;
    endDate: string;
  },
  meta: RequestMeta,
) {
  await assertSchoolRole(prisma, auth, schoolId, INTERNSHIP_SUPERVISOR_ROLES, meta);

  const student = await prisma.student.findFirst({
    where: { id: input.studentId, schoolId },
    select: { id: true },
  });
  if (!student) {
    throw new AppError(404, "STUDENT_NOT_FOUND", "Siswa tidak ditemukan pada sekolah ini.");
  }

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T00:00:00.000Z`);
  if (end < start) {
    throw new AppError(400, "INVALID_DATE_RANGE", "Tanggal selesai PKL tidak boleh lebih awal dari tanggal mulai.");
  }

  const placement = await prisma.internshipPlacement.create({
    data: {
      schoolId,
      studentId: student.id,
      companyName: input.companyName.trim(),
      companyAddress: input.companyAddress?.trim() || null,
      supervisorName: input.supervisorName?.trim() || null,
      startDate: start,
      endDate: end,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          nisn: true,
          class: { select: { name: true } },
        },
      },
    },
  });

  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "INTERNSHIP_PLACEMENT_CREATED",
    entityType: "InternshipPlacement",
    entityId: placement.id,
    metadata: { studentId: student.id, companyName: placement.companyName },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { placement };
}

export async function listInternshipLogs(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const canVerify =
    auth.isSystemOwner ||
    auth.assignments.some(
      (a) => a.schoolId === schoolId && INTERNSHIP_SUPERVISOR_ROLES.includes(a.roleCode as (typeof INTERNSHIP_SUPERVISOR_ROLES)[number]),
    );

  const linkedStudents = await prisma.parentStudentLink.findMany({
    where: { schoolId, parentUserId: auth.userId },
    select: { studentId: true },
  });
  const linkedIds = linkedStudents.map((l) => l.studentId);

  const logs = await prisma.internshipLog.findMany({
    where: {
      schoolId,
      ...(canVerify ? {} : { studentId: { in: linkedIds.length > 0 ? linkedIds : ["__none__"] } }),
    },
    include: {
      placement: { select: { id: true, companyName: true } },
      student: { select: { id: true, name: true, class: { select: { name: true } } } },
      verifiedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
    take: 150,
  });

  return { canVerify, logs };
}

export async function createInternshipLog(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: {
    placementId: string;
    logDate: string;
    activity: string;
    locationNote?: string | null;
  },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);

  const placement = await prisma.internshipPlacement.findFirst({
    where: { id: input.placementId, schoolId },
  });
  if (!placement) {
    throw new AppError(404, "PLACEMENT_NOT_FOUND", "Penempatan PKL tidak ditemukan.");
  }

  const logDateObj = new Date(`${input.logDate}T00:00:00.000Z`);

  const log = await prisma.internshipLog.upsert({
    where: {
      placementId_logDate: {
        placementId: placement.id,
        logDate: logDateObj,
      },
    },
    update: {
      activity: input.activity.trim(),
      locationNote: input.locationNote?.trim() || null,
      status: "MENUNGGU",
    },
    create: {
      schoolId,
      placementId: placement.id,
      studentId: placement.studentId,
      logDate: logDateObj,
      activity: input.activity.trim(),
      locationNote: input.locationNote?.trim() || null,
    },
    include: {
      placement: { select: { id: true, companyName: true } },
      student: { select: { id: true, name: true, class: { select: { name: true } } } },
      verifiedBy: { select: { id: true, name: true } },
    },
  });

  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "INTERNSHIP_LOG_SAVED",
    entityType: "InternshipLog",
    entityId: log.id,
    metadata: { placementId: placement.id, logDate: input.logDate },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { log };
}

export async function verifyInternshipLog(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  logId: string,
  input: { status: "DISETUJUI" | "REVISI" },
  meta: RequestMeta,
) {
  await assertSchoolRole(prisma, auth, schoolId, INTERNSHIP_SUPERVISOR_ROLES, meta);

  const existing = await prisma.internshipLog.findFirst({
    where: { id: logId, schoolId },
  });
  if (!existing) {
    throw new AppError(404, "INTERNSHIP_LOG_NOT_FOUND", "Jurnal PKL tidak ditemukan.");
  }

  const log = await prisma.internshipLog.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      verifiedById: auth.userId,
      verifiedAt: new Date(),
    },
    include: {
      placement: { select: { id: true, companyName: true } },
      student: { select: { id: true, name: true, class: { select: { name: true } } } },
      verifiedBy: { select: { id: true, name: true } },
    },
  });

  return { log };
}
