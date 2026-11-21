import type { HomeroomAssignmentDto, PageResult, TeachingAssignmentDto } from "@sims/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import { auditChange, duplicate, emptyPage, inUse, ownedRow, pageWindow, rethrowKnown, type PageQuery } from "./common.ts";
import type { DataScope } from "./scope.ts";

type TeachingInput = { teacherId: string; subjectId: string; classId: string; academicPeriodId: string };
type HomeroomInput = { teacherId: string; classId: string; academicPeriodId: string };

async function assertTeachingRefs(prisma: PrismaClient, schoolId: string, input: TeachingInput) {
  await ownedRow(prisma.teacher.findFirst({ where: { id: input.teacherId, schoolId }, select: { id: true } }), "Guru tidak ditemukan di sekolah ini.");
  await ownedRow(prisma.subject.findFirst({ where: { id: input.subjectId, schoolId }, select: { id: true } }), "Mata pelajaran tidak ditemukan di sekolah ini.");
  await ownedRow(prisma.schoolClass.findFirst({ where: { id: input.classId, schoolId }, select: { id: true } }), "Kelas tidak ditemukan di sekolah ini.");
  await ownedRow(
    prisma.academicPeriod.findFirst({ where: { id: input.academicPeriodId, schoolId }, select: { id: true } }),
    "Semester tidak ditemukan di sekolah ini.",
  );
}

export async function listTeachings(
  prisma: PrismaClient,
  schoolId: string,
  scope: DataScope,
  query: PageQuery,
): Promise<PageResult<TeachingAssignmentDto>> {
  if (scope.kind === "assigned" && !scope.teacherId) return emptyPage(query);
  const search: Prisma.TeachingAssignmentWhereInput | undefined = query.q
    ? {
        OR: [
          { teacher: { name: { contains: query.q, mode: "insensitive" } } },
          { subject: { name: { contains: query.q, mode: "insensitive" } } },
          { class: { name: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : undefined;
  const visibility: Prisma.TeachingAssignmentWhereInput | undefined =
    scope.kind === "assigned" && scope.teacherId
      ? {
          OR: [
            { teacherId: scope.teacherId },
            ...(scope.homeroomClassIds.length > 0 ? [{ classId: { in: scope.homeroomClassIds } }] : []),
          ],
        }
      : undefined;
  const where: Prisma.TeachingAssignmentWhereInput = {
    schoolId,
    AND: [visibility, search].filter((item): item is Prisma.TeachingAssignmentWhereInput => Boolean(item)),
  };
  const [rows, total] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where,
      include: {
        teacher: { select: { name: true } },
        subject: { select: { name: true } },
        class: { select: { name: true } },
        academicPeriod: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pageWindow(query),
    }),
    prisma.teachingAssignment.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      schoolId,
      teacherId: row.teacherId,
      teacherName: row.teacher.name,
      subjectId: row.subjectId,
      subjectName: row.subject.name,
      classId: row.classId,
      className: row.class.name,
      academicPeriodId: row.academicPeriodId,
      periodName: row.academicPeriod.name,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function createTeaching(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: TeachingInput,
  meta: RequestMeta,
) {
  await assertTeachingRefs(prisma, schoolId, input);
  const existing = await prisma.teachingAssignment.findFirst({
    where: { classId: input.classId, subjectId: input.subjectId, academicPeriodId: input.academicPeriodId },
    select: { id: true },
  });
  if (existing) duplicate("Mapel ini sudah ditugaskan pada kelas dan semester tersebut.");
  try {
    const row = await prisma.teachingAssignment.create({
      data: { schoolId, ...input },
      include: {
        teacher: { select: { name: true } },
        subject: { select: { name: true } },
        class: { select: { name: true } },
        academicPeriod: { select: { name: true } },
      },
    });
    await auditChange(prisma, auth, meta, {
      schoolId,
      action: "TEACHING_CREATED",
      entityType: "TeachingAssignment",
      entityId: row.id,
    });
    return {
      id: row.id,
      schoolId,
      teacherId: row.teacherId,
      teacherName: row.teacher.name,
      subjectId: row.subjectId,
      subjectName: row.subject.name,
      classId: row.classId,
      className: row.class.name,
      academicPeriodId: row.academicPeriodId,
      periodName: row.academicPeriod.name,
    };
  } catch (error) {
    rethrowKnown(error, "Mapel ini sudah ditugaskan pada kelas dan semester tersebut.");
  }
}

export async function deleteTeaching(prisma: PrismaClient, auth: AuthState, schoolId: string, id: string, meta: RequestMeta) {
  await ownedRow(prisma.teachingAssignment.findFirst({ where: { id, schoolId }, select: { id: true } }), "Penugasan tidak ditemukan.");
  const [objectives, scopes, termScores, submissions, components] = await Promise.all([
    prisma.learningObjective.count({ where: { teachingAssignmentId: id } }),
    prisma.materialScope.count({ where: { teachingAssignmentId: id } }),
    prisma.termExamScore.count({ where: { teachingAssignmentId: id } }),
    prisma.gradeSubmission.count({ where: { teachingAssignmentId: id } }),
    prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: id } }),
  ]);
  if (objectives + scopes > 0) inUse("Penugasan masih memiliki tujuan pembelajaran atau lingkup materi.");
  if (termScores > 0) inUse("Penugasan masih memiliki nilai STS atau SAS.");
  if (submissions + components > 0) inUse("Penugasan masih memiliki status pengiriman nilai.");
  await prisma.teachingAssignment.delete({ where: { id } });
  await auditChange(prisma, auth, meta, { schoolId, action: "TEACHING_DELETED", entityType: "TeachingAssignment", entityId: id });
}

export async function listHomerooms(
  prisma: PrismaClient,
  schoolId: string,
  scope: DataScope,
  query: PageQuery,
): Promise<PageResult<HomeroomAssignmentDto>> {
  if (scope.kind === "assigned" && !scope.teacherId) return emptyPage(query);
  const search: Prisma.HomeroomAssignmentWhereInput | undefined = query.q
    ? {
        OR: [
          { teacher: { name: { contains: query.q, mode: "insensitive" } } },
          { class: { name: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : undefined;
  const visibility: Prisma.HomeroomAssignmentWhereInput | undefined =
    scope.kind === "assigned" && scope.teacherId ? { teacherId: scope.teacherId } : undefined;
  const where: Prisma.HomeroomAssignmentWhereInput = {
    schoolId,
    AND: [visibility, search].filter((item): item is Prisma.HomeroomAssignmentWhereInput => Boolean(item)),
  };
  const [rows, total] = await Promise.all([
    prisma.homeroomAssignment.findMany({
      where,
      include: {
        teacher: { select: { name: true } },
        class: { select: { name: true } },
        academicPeriod: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      ...pageWindow(query),
    }),
    prisma.homeroomAssignment.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      schoolId,
      teacherId: row.teacherId,
      teacherName: row.teacher.name,
      classId: row.classId,
      className: row.class.name,
      academicPeriodId: row.academicPeriodId,
      periodName: row.academicPeriod.name,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function createHomeroom(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: HomeroomInput,
  meta: RequestMeta,
) {
  await ownedRow(prisma.teacher.findFirst({ where: { id: input.teacherId, schoolId }, select: { id: true } }), "Guru tidak ditemukan di sekolah ini.");
  await ownedRow(prisma.schoolClass.findFirst({ where: { id: input.classId, schoolId }, select: { id: true } }), "Kelas tidak ditemukan di sekolah ini.");
  await ownedRow(
    prisma.academicPeriod.findFirst({ where: { id: input.academicPeriodId, schoolId }, select: { id: true } }),
    "Semester tidak ditemukan di sekolah ini.",
  );
  const classOwner = await prisma.homeroomAssignment.findFirst({
    where: { classId: input.classId, academicPeriodId: input.academicPeriodId },
    select: { id: true },
  });
  if (classOwner) duplicate("Kelas ini sudah memiliki wali pada semester tersebut.");
  const teacherOwner = await prisma.homeroomAssignment.findFirst({
    where: { teacherId: input.teacherId, academicPeriodId: input.academicPeriodId },
    select: { id: true },
  });
  if (teacherOwner) duplicate("Guru ini sudah menjadi wali kelas pada semester tersebut.");
  try {
    const row = await prisma.homeroomAssignment.create({
      data: { schoolId, ...input },
      include: {
        teacher: { select: { name: true } },
        class: { select: { name: true } },
        academicPeriod: { select: { name: true } },
      },
    });
    await auditChange(prisma, auth, meta, {
      schoolId,
      action: "HOMEROOM_CREATED",
      entityType: "HomeroomAssignment",
      entityId: row.id,
    });
    return {
      id: row.id,
      schoolId,
      teacherId: row.teacherId,
      teacherName: row.teacher.name,
      classId: row.classId,
      className: row.class.name,
      academicPeriodId: row.academicPeriodId,
      periodName: row.academicPeriod.name,
    };
  } catch (error) {
    rethrowKnown(error, "Wali kelas sudah ditetapkan untuk kelas atau guru pada semester tersebut.");
  }
}

export async function deleteHomeroom(prisma: PrismaClient, auth: AuthState, schoolId: string, id: string, meta: RequestMeta) {
  await ownedRow(prisma.homeroomAssignment.findFirst({ where: { id, schoolId }, select: { id: true } }), "Penetapan wali kelas tidak ditemukan.");
  await prisma.homeroomAssignment.delete({ where: { id } });
  await auditChange(prisma, auth, meta, { schoolId, action: "HOMEROOM_DELETED", entityType: "HomeroomAssignment", entityId: id });
}
