import type { PageResult, StudentDto, TeacherDto } from "@sims/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import {
  auditChange,
  duplicate,
  emptyPage,
  inUse,
  ownedRow,
  pageWindow,
  parseDateOnly,
  rethrowKnown,
  toDateOnly,
  type PageQuery,
} from "./common.ts";
import type { DataScope } from "./scope.ts";

type TeacherInput = {
  nip: string | null;
  nuptk: string | null;
  name: string;
  gender: "LAKI_LAKI" | "PEREMPUAN";
  email: string | null;
  phone: string | null;
  userId: string | null;
  isActive: boolean;
};

type StudentInput = {
  nisn: string;
  nis: string | null;
  name: string;
  gender: "LAKI_LAKI" | "PEREMPUAN";
  birthPlace: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  classId: string | null;
  concentrationId: string | null;
  isActive: boolean;
};

function textSearch(q: string | undefined) {
  return q ? { contains: q, mode: "insensitive" as const } : undefined;
}

async function assertMember(prisma: PrismaClient, schoolId: string, userId: string | null, exceptTeacherId?: string) {
  if (!userId) return;
  const member = await prisma.userRole.findFirst({
    where: { schoolId, userId, isActive: true },
    select: { id: true },
  });
  if (!member) {
    throw new AppError(400, "INVALID_REFERENCE", "Akun pengguna tidak terdaftar di sekolah ini.");
  }
  const linked = await prisma.teacher.findFirst({
    where: { userId, ...(exceptTeacherId ? { id: { not: exceptTeacherId } } : {}) },
    select: { schoolId: true },
  });
  if (!linked) return;
  duplicate(
    linked.schoolId === schoolId
      ? "Akun ini sudah tertaut ke data guru. Guru yang sama dapat merangkap guru mapel dan wali kelas."
      : "Akun ini sudah tertaut ke guru di sekolah lain.",
  );
}

const TEACHER_ROLE_CODES = new Set(["GURU_MAPEL", "WALI_KELAS"]);

export function teacherUserInclude(schoolId: string) {
  return {
    user: {
      select: {
        name: true,
        email: true,
        assignments: {
          where: { isActive: true, schoolId },
          select: { role: { select: { code: true } } },
        },
      },
    },
  } satisfies Prisma.TeacherInclude;
}

function toTeacher(row: {
  id: string;
  schoolId: string;
  userId: string | null;
  nip: string | null;
  nuptk: string | null;
  name: string;
  gender: "LAKI_LAKI" | "PEREMPUAN";
  email: string | null;
  phone: string | null;
  isActive: boolean;
  user: { name: string; email: string; assignments: Array<{ role: { code: string } }> } | null;
}): TeacherDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    userId: row.userId,
    userName: row.user?.name ?? null,
    loginEmail: row.user?.email ?? null,
    roleCodes: (row.user?.assignments ?? [])
      .map((assignment) => assignment.role.code)
      .filter((code): code is "GURU_MAPEL" | "WALI_KELAS" => TEACHER_ROLE_CODES.has(code)),
    nip: row.nip,
    nuptk: row.nuptk,
    name: row.name,
    gender: row.gender,
    email: row.email,
    phone: row.phone,
    isActive: row.isActive,
  };
}

export async function findTeacherDto(prisma: PrismaClient, schoolId: string, id: string): Promise<TeacherDto> {
  const row = await ownedRow(
    prisma.teacher.findFirst({
      where: { id, schoolId },
      include: teacherUserInclude(schoolId),
    }),
    "Guru tidak ditemukan.",
  );
  return toTeacher(row);
}

export async function listTeachers(
  prisma: PrismaClient,
  schoolId: string,
  scope: DataScope,
  query: PageQuery,
): Promise<PageResult<TeacherDto>> {
  if (scope.kind === "assigned" && !scope.teacherId) return emptyPage(query);
  const where: Prisma.TeacherWhereInput = {
    schoolId,
    ...(scope.kind === "assigned" && scope.teacherId ? { id: scope.teacherId } : {}),
    ...(query.q
      ? { OR: [{ name: textSearch(query.q) }, { nip: textSearch(query.q) }, { nuptk: textSearch(query.q) }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.teacher.findMany({
      where,
      include: teacherUserInclude(schoolId),
      orderBy: { name: "asc" },
      ...pageWindow(query),
    }),
    prisma.teacher.count({ where }),
  ]);
  return { items: rows.map(toTeacher), total, page: query.page, pageSize: query.pageSize };
}

export async function assertUniqueNip(prisma: PrismaClient, schoolId: string, nip: string | null, exceptId?: string) {
  if (!nip) return;
  const existing = await prisma.teacher.findFirst({
    where: { schoolId, nip, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) duplicate("NIP sudah digunakan di sekolah ini.");
}

export async function createTeacher(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: TeacherInput,
  meta: RequestMeta,
) {
  await assertUniqueNip(prisma, schoolId, input.nip);
  await assertMember(prisma, schoolId, input.userId);
  try {
    const row = await prisma.teacher.create({
      data: { schoolId, ...input },
      include: teacherUserInclude(schoolId),
    });
    await auditChange(prisma, auth, meta, { schoolId, action: "TEACHER_CREATED", entityType: "Teacher", entityId: row.id });
    return toTeacher(row);
  } catch (error) {
    rethrowKnown(error, "NIP sudah digunakan, atau akun ini sudah tertaut ke guru. Gunakan data guru yang sama untuk merangkap mapel dan wali kelas.");
  }
}

export async function updateTeacher(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  id: string,
  input: TeacherInput,
  meta: RequestMeta,
) {
  const current = await ownedRow(
    prisma.teacher.findFirst({ where: { id, schoolId }, select: { id: true, userId: true } }),
    "Guru tidak ditemukan.",
  );
  await assertUniqueNip(prisma, schoolId, input.nip, id);
  await assertMember(prisma, schoolId, current.userId, id);
  try {
    const row = await prisma.teacher.update({
      where: { id },
      data: { ...input, userId: current.userId },
      include: teacherUserInclude(schoolId),
    });
    await auditChange(prisma, auth, meta, { schoolId, action: "TEACHER_UPDATED", entityType: "Teacher", entityId: id });
    return toTeacher(row);
  } catch (error) {
    rethrowKnown(error, "NIP sudah digunakan, atau akun ini sudah tertaut ke guru. Gunakan data guru yang sama untuk merangkap mapel dan wali kelas.");
  }
}

export async function deleteTeacher(prisma: PrismaClient, auth: AuthState, schoolId: string, id: string, meta: RequestMeta) {
  await ownedRow(prisma.teacher.findFirst({ where: { id, schoolId }, select: { id: true } }), "Guru tidak ditemukan.");
  const [teachings, homerooms] = await Promise.all([
    prisma.teachingAssignment.count({ where: { teacherId: id } }),
    prisma.homeroomAssignment.count({ where: { teacherId: id } }),
  ]);
  if (teachings + homerooms > 0) inUse("Guru masih memiliki penugasan mengajar atau wali kelas.");
  await prisma.teacher.delete({ where: { id } });
  await auditChange(prisma, auth, meta, { schoolId, action: "TEACHER_DELETED", entityType: "Teacher", entityId: id });
}

function toStudent(row: {
  id: string;
  schoolId: string;
  nisn: string;
  nis: string | null;
  name: string;
  gender: "LAKI_LAKI" | "PEREMPUAN";
  birthPlace: string | null;
  birthDate: Date | null;
  email: string | null;
  phone: string | null;
  classId: string | null;
  concentrationId: string | null;
  isActive: boolean;
  class: { name: string } | null;
  concentration: { name: string } | null;
}): StudentDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    nisn: row.nisn,
    nis: row.nis,
    name: row.name,
    gender: row.gender,
    birthPlace: row.birthPlace,
    birthDate: row.birthDate ? toDateOnly(row.birthDate) : null,
    email: row.email,
    phone: row.phone,
    classId: row.classId,
    className: row.class?.name ?? null,
    concentrationId: row.concentrationId,
    concentrationName: row.concentration?.name ?? null,
    isActive: row.isActive,
  };
}

export async function listStudents(
  prisma: PrismaClient,
  schoolId: string,
  scope: DataScope,
  query: PageQuery,
): Promise<PageResult<StudentDto>> {
  if (scope.kind === "assigned" && scope.classIds.length === 0) return emptyPage(query);
  const where: Prisma.StudentWhereInput = {
    schoolId,
    ...(scope.kind === "assigned" ? { classId: { in: scope.classIds } } : {}),
    ...(query.q
      ? { OR: [{ name: textSearch(query.q) }, { nisn: textSearch(query.q) }, { nis: textSearch(query.q) }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: { class: { select: { name: true } }, concentration: { select: { name: true } } },
      orderBy: { name: "asc" },
      ...pageWindow(query),
    }),
    prisma.student.count({ where }),
  ]);
  return { items: rows.map(toStudent), total, page: query.page, pageSize: query.pageSize };
}

async function assertStudentLinks(prisma: PrismaClient, schoolId: string, input: StudentInput) {
  if (input.classId) {
    await ownedRow(prisma.schoolClass.findFirst({ where: { id: input.classId, schoolId }, select: { id: true } }), "Kelas tidak ditemukan di sekolah ini.");
  }
  if (input.concentrationId) {
    await ownedRow(
      prisma.expertiseConcentration.findFirst({ where: { id: input.concentrationId, schoolId }, select: { id: true } }),
      "Konsentrasi keahlian tidak ditemukan di sekolah ini.",
    );
  }
}

async function assertUniqueStudent(prisma: PrismaClient, schoolId: string, input: StudentInput, exceptId?: string) {
  const nisn = await prisma.student.findFirst({
    where: { nisn: input.nisn, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (nisn) duplicate("NISN sudah digunakan.");
  if (input.nis) {
    const nis = await prisma.student.findFirst({
      where: { schoolId, nis: input.nis, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (nis) duplicate("NIS sudah digunakan di sekolah ini.");
  }
}

function studentData(input: StudentInput) {
  const nis = input.nis?.trim() ?? "";
  return {
    ...input,
    nis: nis.length > 0 ? nis : null,
    birthDate: input.birthDate ? parseDateOnly(input.birthDate) : null,
  };
}

export async function createStudent(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: StudentInput,
  meta: RequestMeta,
) {
  await assertStudentLinks(prisma, schoolId, input);
  await assertUniqueStudent(prisma, schoolId, input);
  try {
    const row = await prisma.student.create({
      data: { schoolId, ...studentData(input) },
      include: { class: { select: { name: true } }, concentration: { select: { name: true } } },
    });
    await auditChange(prisma, auth, meta, { schoolId, action: "STUDENT_CREATED", entityType: "Student", entityId: row.id });
    return toStudent(row);
  } catch (error) {
    rethrowKnown(error, "NISN atau NIS sudah digunakan.");
  }
}

export async function updateStudent(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  id: string,
  input: StudentInput,
  meta: RequestMeta,
) {
  await ownedRow(prisma.student.findFirst({ where: { id, schoolId }, select: { id: true } }), "Siswa tidak ditemukan.");
  await assertStudentLinks(prisma, schoolId, input);
  await assertUniqueStudent(prisma, schoolId, input, id);
  try {
    const row = await prisma.student.update({
      where: { id },
      data: studentData(input),
      include: { class: { select: { name: true } }, concentration: { select: { name: true } } },
    });
    await auditChange(prisma, auth, meta, { schoolId, action: "STUDENT_UPDATED", entityType: "Student", entityId: id });
    return toStudent(row);
  } catch (error) {
    rethrowKnown(error, "NISN atau NIS sudah digunakan.");
  }
}

export async function deleteStudent(prisma: PrismaClient, auth: AuthState, schoolId: string, id: string, meta: RequestMeta) {
  await ownedRow(prisma.student.findFirst({ where: { id, schoolId }, select: { id: true } }), "Siswa tidak ditemukan.");
  const [formative, summative, term] = await Promise.all([
    prisma.formativeScore.count({ where: { studentId: id } }),
    prisma.summativeScore.count({ where: { studentId: id } }),
    prisma.termExamScore.count({ where: { studentId: id } }),
  ]);
  if (formative + summative + term > 0) inUse("Siswa masih memiliki nilai.");
  await prisma.student.delete({ where: { id } });
  await auditChange(prisma, auth, meta, { schoolId, action: "STUDENT_DELETED", entityType: "Student", entityId: id });
}
