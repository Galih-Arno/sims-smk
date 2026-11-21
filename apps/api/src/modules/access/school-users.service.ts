import type { LinkableTeacherDto, RoleCode, SchoolUserDto, SchoolUserWriteResult } from "@sims/shared";
import { ROLE_DEFINITIONS } from "@sims/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { generateTemporaryPassword, hashPassword } from "../../lib/password.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import { assertCanManage } from "../academic/scope.ts";
import { grantAssignment } from "./assignments.ts";
import { ASSIGNABLE_ROLE_CODES, type SchoolUserCreateInput, type SchoolUserRolesInput } from "./school-users.schema.ts";

const TEACHER_ROLES = new Set<RoleCode>(["GURU_MAPEL", "WALI_KELAS"]);

const userInclude = {
  teacher: { select: { id: true, schoolId: true, name: true } },
  assignments: { include: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function roleName(code: string): string {
  return ROLE_DEFINITIONS.find((role) => role.code === code)?.name ?? code;
}

function uniqueRoles(roles: readonly string[]): RoleCode[] {
  return [...new Set(roles)] as RoleCode[];
}

function present(user: UserRow, schoolId: string): SchoolUserDto {
  const teacher = user.teacher?.schoolId === schoolId ? user.teacher : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    teacherId: teacher?.id ?? null,
    teacherName: teacher?.name ?? null,
    roles: user.assignments
      .filter((assignment) => assignment.schoolId === schoolId && assignment.isActive)
      .map((assignment) => ({ code: assignment.role.code as RoleCode, name: assignment.role.name || roleName(assignment.role.code) }))
      .sort((left, right) => left.name.localeCompare(right.name, "id")),
  };
}

function isOwner(user: UserRow): boolean {
  return user.assignments.some((assignment) => assignment.isActive && assignment.role.code === "SYSTEM_OWNER");
}

function hasForeignSchool(user: UserRow, schoolId: string): boolean {
  return user.assignments.some((assignment) => assignment.schoolId && assignment.schoolId !== schoolId);
}

function belongsToSchool(user: UserRow, schoolId: string): boolean {
  return user.assignments.some((assignment) => assignment.schoolId === schoolId);
}

function rejectOwner(): never {
  throw new AppError(409, "CONFLICT", "Akun pemilik sistem tidak dapat diubah.");
}

function rejectForeign(): never {
  throw new AppError(409, "CONFLICT", "Akun sekolah lain tidak dapat diubah.");
}

async function loadUser(prisma: PrismaClient, userId: string): Promise<UserRow | null> {
  return prisma.user.findUnique({ where: { id: userId }, include: userInclude });
}

async function schoolMember(prisma: PrismaClient, schoolId: string, userId: string): Promise<UserRow> {
  const user = await loadUser(prisma, userId);
  if (!user || !belongsToSchool(user, schoolId)) {
    throw new AppError(404, "NOT_FOUND", "Pengguna tidak ditemukan di sekolah ini.");
  }
  if (isOwner(user)) rejectOwner();
  return user;
}

async function teacherInSchool(prisma: PrismaClient, schoolId: string, teacherId: string) {
  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, schoolId },
    select: { id: true, name: true, userId: true, email: true },
  });
  if (!teacher) throw new AppError(404, "NOT_FOUND", "Data guru tidak ditemukan di sekolah ini.");
  return teacher;
}

async function assertWaliReady(prisma: PrismaClient, schoolId: string, teacherId: string): Promise<void> {
  const active = await prisma.homeroomAssignment.findFirst({
    where: { schoolId, teacherId, academicPeriod: { isActive: true } },
    select: { id: true },
  });
  if (!active) {
    throw new AppError(409, "CONFLICT", "Peran wali kelas memerlukan penugasan wali kelas pada semester aktif.");
  }
}

async function prepareTeacherLink(prisma: PrismaClient, schoolId: string, roles: RoleCode[], teacherId: string | null | undefined, userId: string | null) {
  const needsTeacher = roles.some((role) => TEACHER_ROLES.has(role));
  if (!needsTeacher) {
    if (teacherId) throw new AppError(400, "VALIDATION_ERROR", "Tautan guru hanya untuk peran guru mapel atau wali kelas.");
    return null;
  }
  if (!teacherId) throw new AppError(400, "VALIDATION_ERROR", "Peran guru memerlukan tautan data guru yang sudah ada.");
  const teacher = await teacherInSchool(prisma, schoolId, teacherId);
  if (teacher.userId && teacher.userId !== userId) {
    throw new AppError(409, "CONFLICT", "Data guru ini sudah tertaut ke akun lain. Gunakan akun tersebut, jangan membuat akun ganda.");
  }
  if (roles.includes("WALI_KELAS")) await assertWaliReady(prisma, schoolId, teacher.id);
  return teacher;
}

async function applyRoles(prisma: Prisma.TransactionClient, userId: string, schoolId: string, roles: RoleCode[]) {
  await prisma.userRole.updateMany({
    where: { userId, schoolId, isActive: true, role: { code: { notIn: roles } } },
    data: { isActive: false },
  });
  for (const roleCode of roles) {
    await grantAssignment(prisma, { userId, roleCode, schoolId });
  }
}

export async function listSchoolUsers(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  query: { q?: string; role?: string; status?: "active" | "inactive"; page: number; pageSize: 10 | 25 | 50 },
  meta: RequestMeta,
): Promise<{ items: SchoolUserDto[]; page: number; pageSize: number; total: number }> {
  await assertCanManage(prisma, auth, schoolId, meta);
  if (query.role && !ASSIGNABLE_ROLE_CODES.includes(query.role as RoleCode)) {
    throw new AppError(400, "VALIDATION_ERROR", "Peran tidak dikenal.");
  }
  const where: Prisma.UserWhereInput = {
    assignments: {
      some: {
        schoolId,
        isActive: true,
        role: { code: query.role ? (query.role as RoleCode) : { not: "SYSTEM_OWNER" } },
      },
    },
    ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: [{ name: "asc" }, { email: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);
  return { items: rows.map((row) => present(row, schoolId)), page: query.page, pageSize: query.pageSize, total };
}

export async function listLinkableTeachers(prisma: PrismaClient, auth: AuthState, schoolId: string, meta: RequestMeta): Promise<{ items: LinkableTeacherDto[] }> {
  await assertCanManage(prisma, auth, schoolId, meta);
  const rows = await prisma.teacher.findMany({
    where: { schoolId, isActive: true },
    select: { id: true, name: true, email: true, userId: true, user: { select: { email: true } } },
    orderBy: { name: "asc" },
    take: 200,
  });
  return {
    items: rows.map((row) => ({ id: row.id, name: row.name, email: row.email, userId: row.userId, userEmail: row.user?.email ?? null })),
  };
}

export async function createSchoolUser(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: SchoolUserCreateInput,
  meta: RequestMeta,
): Promise<SchoolUserWriteResult> {
  await assertCanManage(prisma, auth, schoolId, meta);
  const roles = uniqueRoles(input.roles);
  const existing = await prisma.user.findUnique({ where: { email: input.email }, include: userInclude });
  if (!existing && roles.some((role) => TEACHER_ROLES.has(role))) {
    throw new AppError(409, "USE_TEACHER_FORM", "Akun Guru Mata Pelajaran dan Wali Kelas baru dibuat dari menu Guru.");
  }
  if (existing && isOwner(existing)) rejectOwner();
  if (existing && hasForeignSchool(existing, schoolId)) rejectForeign();
  const teacher = await prepareTeacherLink(prisma, schoolId, roles, input.teacherId, existing?.id ?? null);
  if (teacher?.userId && existing && teacher.userId !== existing.id) {
    throw new AppError(409, "CONFLICT", "Data guru ini sudah tertaut ke akun lain. Gunakan akun tersebut, jangan membuat akun ganda.");
  }
  if (teacher?.userId && !existing) {
    const linked = await loadUser(prisma, teacher.userId);
    if (!linked) throw new AppError(409, "CONFLICT", "Data guru ini sudah tertaut ke akun lain.");
    if (linked.email !== input.email) {
      throw new AppError(409, "CONFLICT", "Guru ini sudah memiliki akun. Gunakan email akun tersebut.");
    }
  }
  if (existing && !existing.isActive) {
    throw new AppError(409, "CONFLICT", "Akun dengan email ini nonaktif. Aktifkan dari daftar pengguna sekolah ini.");
  }

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await applyRoles(tx, existing.id, schoolId, [...new Set([...present(existing, schoolId).roles.map((role) => role.code), ...roles])]);
      if (teacher && !teacher.userId) {
        await tx.teacher.update({ where: { id: teacher.id }, data: { userId: existing.id } });
      }
    });
    await writeAudit(prisma, {
      schoolId,
      actorId: auth.userId,
      action: "SCHOOL_USER_ROLES_UPDATED",
      entityType: "User",
      entityId: existing.id,
      metadata: { roles, linkedExisting: true },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    const saved = await loadUser(prisma, existing.id);
    if (!saved) throw new AppError(404, "NOT_FOUND", MSG.notFound);
    return { item: present(saved, schoolId), created: false, temporaryPassword: null };
  }

  const temporaryPassword = generateTemporaryPassword();
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        isActive: true,
      },
    });
    await applyRoles(tx, user.id, schoolId, roles);
    if (teacher && !teacher.userId) {
      await tx.teacher.update({ where: { id: teacher.id }, data: { userId: user.id } });
    }
    return user;
  });
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "SCHOOL_USER_CREATED",
    entityType: "User",
    entityId: created.id,
    metadata: { roles, teacherId: teacher?.id ?? null },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  const saved = await loadUser(prisma, created.id);
  if (!saved) throw new AppError(404, "NOT_FOUND", MSG.notFound);
  return { item: present(saved, schoolId), created: true, temporaryPassword };
}

export async function updateSchoolUserRoles(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  userId: string,
  input: SchoolUserRolesInput,
  meta: RequestMeta,
): Promise<SchoolUserWriteResult> {
  await assertCanManage(prisma, auth, schoolId, meta);
  if (userId === auth.userId) throw new AppError(409, "CONFLICT", "Peran akun Anda sendiri tidak diubah dari halaman ini.");
  const current = await schoolMember(prisma, schoolId, userId);
  if (hasForeignSchool(current, schoolId)) rejectForeign();
  const roles = uniqueRoles(input.roles);
  const linkedTeacherId = current.teacher?.schoolId === schoolId ? current.teacher.id : null;
  const teacherId = roles.some((role) => TEACHER_ROLES.has(role)) ? input.teacherId ?? linkedTeacherId : null;
  const teacher = await prepareTeacherLink(prisma, schoolId, roles, teacherId, current.id);
  if (roles.includes("WALI_KELAS") === false && current.teacher?.schoolId === schoolId) {
    const active = await prisma.homeroomAssignment.findFirst({
      where: { schoolId, teacherId: current.teacher.id, academicPeriod: { isActive: true } },
      select: { id: true },
    });
    const hadWali = current.assignments.some((assignment) => assignment.schoolId === schoolId && assignment.isActive && assignment.role.code === "WALI_KELAS");
    if (hadWali && active) {
      throw new AppError(409, "CONFLICT", "Peran wali kelas tidak dicabut selama penugasan wali kelas semester aktif masih ada.");
    }
  }
  await prisma.$transaction(async (tx) => {
    await applyRoles(tx, current.id, schoolId, roles);
    if (teacher && !teacher.userId) {
      await tx.teacher.update({ where: { id: teacher.id }, data: { userId: current.id } });
    }
  });
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "SCHOOL_USER_ROLES_UPDATED",
    entityType: "User",
    entityId: current.id,
    metadata: { previous: present(current, schoolId).roles.map((role) => role.code), roles },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  const saved = await loadUser(prisma, current.id);
  if (!saved) throw new AppError(404, "NOT_FOUND", MSG.notFound);
  return { item: present(saved, schoolId), created: false, temporaryPassword: null };
}

export async function resetSchoolUserPassword(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  userId: string,
  meta: RequestMeta,
): Promise<SchoolUserWriteResult> {
  await assertCanManage(prisma, auth, schoolId, meta);
  if (userId === auth.userId) throw new AppError(409, "CONFLICT", "Gunakan ubah kata sandi untuk akun Anda sendiri.");
  const current = await schoolMember(prisma, schoolId, userId);
  if (hasForeignSchool(current, schoolId)) rejectForeign();
  const temporaryPassword = generateTemporaryPassword();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: current.id },
      data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
    });
    await tx.refreshToken.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "SCHOOL_USER_PASSWORD_RESET",
    entityType: "User",
    entityId: current.id,
    metadata: { email: current.email },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return { item: present(current, schoolId), created: false, temporaryPassword };
}

export async function setSchoolUserStatus(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  userId: string,
  isActive: boolean,
  meta: RequestMeta,
): Promise<SchoolUserWriteResult> {
  await assertCanManage(prisma, auth, schoolId, meta);
  if (userId === auth.userId) throw new AppError(409, "CONFLICT", "Status akun Anda sendiri tidak diubah dari halaman ini.");
  const current = await schoolMember(prisma, schoolId, userId);
  if (hasForeignSchool(current, schoolId)) rejectForeign();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: current.id }, data: { isActive } });
    if (!isActive) {
      await tx.refreshToken.updateMany({ where: { userId: current.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  });
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "SCHOOL_USER_STATUS_CHANGED",
    entityType: "User",
    entityId: current.id,
    metadata: { previous: current.isActive, isActive },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  const saved = await loadUser(prisma, current.id);
  if (!saved) throw new AppError(404, "NOT_FOUND", MSG.notFound);
  return { item: present(saved, schoolId), created: false, temporaryPassword: null };
}
