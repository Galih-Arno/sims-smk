import type { AcademicPeriodDto, AuditLogDto, SchoolAccessStatus, SchoolDto } from "@sims/shared";
import { AUDIT_READER_ROLES } from "@sims/shared";
import { Prisma, type AcademicPeriod, type PrismaClient, type School } from "@prisma/client";
import { assignedSchoolIds, type AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolOperational } from "../../lib/school-access.ts";
import { assertSchoolAccess, assertSchoolRole, type RequestMeta } from "../../lib/tenant.ts";

export type SchoolWriteInput = {
  name: string;
  npsn: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  accreditation: string | null;
  principalName: string | null;
  stsEnabled?: boolean;
  sasEnabled?: boolean;
  requireUh?: boolean;
  requireT1?: boolean;
  requireT2?: boolean;
  requireT3?: boolean;
  requireSummative?: boolean;
  requireSts?: boolean;
  requireSas?: boolean;
  isActive?: boolean;
};

function toSchoolDto(school: School): SchoolDto {
  return {
    id: school.id,
    name: school.name,
    npsn: school.npsn,
    address: school.address,
    phone: school.phone,
    email: school.email,
    city: school.city,
    province: school.province,
    postalCode: school.postalCode,
    website: school.website,
    accreditation: school.accreditation,
    principalName: school.principalName,
    stsEnabled: school.stsEnabled,
    sasEnabled: school.sasEnabled,
    requireUh: school.requireUh,
    requireT1: school.requireT1,
    requireT2: school.requireT2,
    requireT3: school.requireT3,
    requireSummative: school.requireSummative,
    requireSts: school.requireSts,
    requireSas: school.requireSas,
    isActive: school.accessStatus === "AKTIF",
    accessStatus: school.accessStatus,
  };
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toPeriodDto(period: AcademicPeriod & { academicYear?: { name: string } | null }): AcademicPeriodDto {
  return {
    id: period.id,
    schoolId: period.schoolId,
    academicYearId: period.academicYearId,
    academicYearName: period.academicYear?.name ?? null,
    name: period.name,
    semesterKind: period.semesterKind,
    startDate: toDateOnly(period.startDate),
    endDate: toDateOnly(period.endDate),
    isActive: period.isActive,
  };
}

type AuditRow = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { id: true; name: true; email: true } } };
}>;

function toAuditDto(log: AuditRow): AuditLogDto {
  return {
    id: log.id,
    schoolId: log.schoolId,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    metadata: log.metadata,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
    actor: log.actor,
  };
}

export async function listSchools(prisma: PrismaClient, auth: AuthState): Promise<SchoolDto[]> {
  const schools = auth.isSystemOwner
    ? await prisma.school.findMany({ orderBy: { name: "asc" } })
    : await prisma.school.findMany({
        where: { id: { in: assignedSchoolIds(auth) }, accessStatus: "AKTIF" },
        orderBy: { name: "asc" },
      });

  return schools.map(toSchoolDto);
}

export async function getSchool(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<SchoolDto> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    throw new AppError(404, "SCHOOL_NOT_FOUND", MSG.schoolNotFound);
  }
  return toSchoolDto(school);
}

function schoolData(input: SchoolWriteInput) {
  return {
    name: input.name,
    npsn: input.npsn,
    address: input.address,
    city: input.city,
    province: input.province,
    postalCode: input.postalCode,
    phone: input.phone,
    email: input.email,
    website: input.website,
    accreditation: input.accreditation,
    principalName: input.principalName,
    ...(input.stsEnabled !== undefined ? { stsEnabled: input.stsEnabled } : {}),
    ...(input.sasEnabled !== undefined ? { sasEnabled: input.sasEnabled } : {}),
    ...(input.requireUh !== undefined ? { requireUh: input.requireUh } : {}),
    ...(input.requireT1 !== undefined ? { requireT1: input.requireT1 } : {}),
    ...(input.requireT2 !== undefined ? { requireT2: input.requireT2 } : {}),
    ...(input.requireT3 !== undefined ? { requireT3: input.requireT3 } : {}),
    ...(input.requireSummative !== undefined ? { requireSummative: input.requireSummative } : {}),
    ...(input.requireSts !== undefined ? { requireSts: input.requireSts } : {}),
    ...(input.requireSas !== undefined ? { requireSas: input.requireSas } : {}),
  };
}

export async function createSchool(
  prisma: PrismaClient,
  auth: AuthState,
  input: SchoolWriteInput,
  meta: RequestMeta,
): Promise<SchoolDto> {
  if (!auth.isSystemOwner) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }

  try {
    const school = await prisma.school.create({
      data: { ...schoolData(input), isActive: true, accessStatus: "AKTIF" },
    });
    await writeAudit(prisma, {
      actorId: auth.userId,
      action: "SCHOOL_CREATED",
      entityType: "School",
      entityId: school.id,
      metadata: { npsn: school.npsn },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return toSchoolDto(school);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "DUPLICATE", "NPSN sudah digunakan.");
    }
    throw error;
  }
}

export async function updateSchool(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: SchoolWriteInput,
  meta: RequestMeta,
): Promise<SchoolDto> {
  await assertSchoolRole(prisma, auth, schoolId, ["ADMIN_SEKOLAH"], meta);
  try {
    const school = await prisma.school.update({
      where: { id: schoolId },
      data: schoolData(input),
    });
    await writeAudit(prisma, {
      schoolId,
      actorId: auth.userId,
      action: "SCHOOL_UPDATED",
      entityType: "School",
      entityId: school.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return toSchoolDto(school);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "DUPLICATE", "NPSN sudah digunakan.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AppError(404, "SCHOOL_NOT_FOUND", MSG.schoolNotFound);
    }
    throw error;
  }
}

export async function setSchoolAccessStatus(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: { status: SchoolAccessStatus; reason?: string },
  meta: RequestMeta,
): Promise<SchoolDto> {
  if (!auth.isSystemOwner) {
    throw new AppError(403, "FORBIDDEN", "Hanya pemilik sistem yang dapat mengubah status sekolah.");
  }
  const reason = input.reason?.trim() || null;
  const school = await prisma.$transaction(async (tx) => {
    const current = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, accessStatus: true },
    });
    if (!current) throw new AppError(404, "SCHOOL_NOT_FOUND", MSG.schoolNotFound);
    if (current.accessStatus === input.status) {
      throw new AppError(409, "CONFLICT", "Status sekolah sudah sesuai.");
    }
    const saved = await tx.school.update({
      where: { id: schoolId },
      data: { accessStatus: input.status, isActive: input.status === "AKTIF" },
    });
    await writeAudit(tx, {
      schoolId,
      actorId: auth.userId,
      action: "SCHOOL_ACCESS_STATUS_CHANGED",
      entityType: "School",
      entityId: schoolId,
      metadata: { before: current.accessStatus, after: input.status, reason },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return saved;
  });
  return toSchoolDto(school);
}

export async function deleteSchool(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<void> {
  if (!auth.isSystemOwner) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const [years, teachers, students] = await Promise.all([
    prisma.academicYear.count({ where: { schoolId } }),
    prisma.teacher.count({ where: { schoolId } }),
    prisma.student.count({ where: { schoolId } }),
  ]);
  if (years + teachers + students > 0) {
    throw new AppError(409, "IN_USE", "Sekolah masih memiliki data. Nonaktifkan sekolah bila tidak digunakan.");
  }
  await prisma.school.delete({ where: { id: schoolId } });
  await writeAudit(prisma, {
    actorId: auth.userId,
    action: "SCHOOL_DELETED",
    entityType: "School",
    entityId: schoolId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function listAcademicPeriods(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<AcademicPeriodDto[]> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const periods = await prisma.academicPeriod.findMany({
    where: { schoolId },
    include: { academicYear: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });
  return periods.map(toPeriodDto);
}

export async function listAuditLogs(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string | undefined,
  meta: RequestMeta,
): Promise<AuditLogDto[]> {
  const where: Prisma.AuditLogWhereInput = {};

  if (auth.isSystemOwner) {
    if (schoolId) {
      await assertSchoolAccess(prisma, auth, schoolId, meta);
      where.schoolId = schoolId;
    }
  } else {
    if (!schoolId) {
      throw new AppError(400, "VALIDATION_ERROR", "Parameter sekolah wajib diisi.");
    }
    await assertSchoolRole(prisma, auth, schoolId, AUDIT_READER_ROLES, meta);
    await assertSchoolOperational(prisma, auth, schoolId, "GET");
    where.schoolId = schoolId;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  return logs.map(toAuditDto);
}
