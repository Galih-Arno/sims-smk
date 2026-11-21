import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../../lib/auth-state.ts";
import { writeAudit } from "../../../lib/audit.ts";
import { AppError } from "../../../lib/errors.ts";
import { MSG } from "../../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../../lib/tenant.ts";
import { readOfficialFinalGrades } from "../grade-final.service.ts";
import { readOfficialDescriptions } from "../competency-description.service.ts";
import { readOfficialHomeroomNotes } from "../homeroom-note.service.ts";
import { readFinalDailyAttendance } from "./attendance.ts";
import { composeMerdekaReport, supportsMerdeka, type MerdekaGrade } from "./merdeka.ts";
import type { HomeroomReportPrepDto } from "./types.ts";

const homeroomInclude = {
  class: { select: { id: true, name: true, fase: true, academicYearId: true, concentration: { select: { name: true } } } },
  academicPeriod: {
    select: {
      id: true,
      name: true,
      semesterKind: true,
      academicYearId: true,
      academicYear: { select: { name: true } },
    },
  },
  teacher: { select: { name: true } },
} satisfies Prisma.HomeroomAssignmentInclude;

export async function getHomeroomReportPrep(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  meta: RequestMeta,
  auditAction: string | null = "GRADE_REPORT_PREP_READ",
): Promise<HomeroomReportPrepDto> {
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
  if (!selected) return { homerooms: listed, prep: null };
  const built = await buildPrep(prisma, schoolId, selected);
  if (auditAction) await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: auditAction,
    entityType: "HomeroomAssignment",
    entityId: selected.id,
    metadata: {
      classId: selected.classId,
      academicPeriodId: selected.academicPeriodId,
      students: built.students.length,
      composer: built.prep.composer,
      finalDays: built.prep.attendance.finalDays,
      requiredDays: built.prep.attendance.requiredDays,
      attendanceCompleteness: built.prep.attendance.completeness,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return { homerooms: listed, prep: built.prep };
}

export async function readHomeroomPrep(prisma: PrismaClient, schoolId: string, homeroomId: string) {
  const selected = await prisma.homeroomAssignment.findFirst({
    where: { id: homeroomId, schoolId, academicPeriod: { isActive: true } },
    include: homeroomInclude,
  });
  if (!selected) return null;
  return (await buildPrep(prisma, schoolId, selected)).prep;
}

async function buildPrep(prisma: PrismaClient, schoolId: string, selected: Prisma.HomeroomAssignmentGetPayload<{ include: typeof homeroomInclude }>) {
  const yearId = selected.academicPeriod.academicYearId ?? selected.class.academicYearId;
  const [school, students, placements, assignments] = await Promise.all([
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, npsn: true, address: true, city: true, province: true, accreditation: true, principalName: true },
    }),
    prisma.student.findMany({
      where: { schoolId, classId: selected.classId, isActive: true },
      select: { id: true, name: true, nisn: true, nis: true, gender: true, birthPlace: true, birthDate: true, concentration: { select: { name: true } } },
      orderBy: [{ name: "asc" }, { nis: "asc" }],
    }),
    prisma.curriculumPlacement.findMany({
      where: { schoolId, classId: selected.classId, ...(yearId ? { curriculum: { academicYearId: yearId } } : {}) },
      include: { curriculum: { select: { id: true, code: true, name: true } }, subject: { select: { id: true, code: true, name: true, category: true } } },
    }),
    prisma.teachingAssignment.findMany({
      where: { schoolId, classId: selected.classId, academicPeriodId: selected.academicPeriodId },
      select: { id: true, subjectId: true, teacher: { select: { name: true } } },
    }),
  ]);
  if (!school) throw new AppError(404, "SCHOOL_NOT_FOUND", MSG.schoolNotFound);

  const curricula = [...new Map(placements.map((item) => [item.curriculum.id, item.curriculum])).values()];
  const supported = curricula.length > 0 && curricula.every((item) => supportsMerdeka(item));
  const yearName = selected.academicPeriod.academicYear?.name ?? "";
  const semester = selected.academicPeriod.semesterKind === "GANJIL" ? "Ganjil" : selected.academicPeriod.semesterKind === "GENAP" ? "Genap" : null;
  const curriculumLabel = supported
    ? `Kurikulum Merdeka SMK · ${curricula.map((item) => `${item.code} · ${item.name}`).join(", ")}`
    : curricula.map((item) => `${item.code} · ${item.name}`).join(", ") || null;

  const grades = new Map<string, Map<string, MerdekaGrade>>();
  const descriptions = new Map<string, Awaited<ReturnType<typeof readOfficialDescriptions>>>();
  if (supported) {
    for (const assignment of assignments) {
      if (!placements.some((item) => item.subjectId === assignment.subjectId)) continue;
      const rows = await readOfficialFinalGrades(prisma, schoolId, assignment.id);
      grades.set(assignment.subjectId, new Map(rows.map((item) => [item.studentId, { status: item.status, score: item.score }])));
      descriptions.set(assignment.subjectId, await readOfficialDescriptions(prisma, schoolId, assignment.id, selected.classId));
    }
  }
  const teacherBySubject = new Map(assignments.map((item) => [item.subjectId, item.teacher.name]));
  const studentIds = students.map((student) => student.id);
  const [attendance, notes] = await Promise.all([
    readFinalDailyAttendance(prisma, schoolId, selected.id, selected.academicPeriod.id, studentIds),
    readOfficialHomeroomNotes(prisma, schoolId, selected.academicPeriodId, studentIds),
  ]);
  const prepared = composeMerdekaReport({
    school,
    term: {
      yearName,
      periodName: selected.academicPeriod.name,
      semester,
      className: selected.class.name,
      concentration: selected.class.concentration?.name ?? null,
      homeroomTeacher: selected.teacher.name,
      fase: selected.class.fase,
    },
    curriculumLabel: curriculumLabel ?? "",
    students: students.map((student) => ({ ...student, concentration: student.concentration?.name ?? null })),
    subjects: supported
      ? placements.map((item) => ({
          subjectId: item.subject.id,
          code: item.subject.code,
          name: item.subject.name,
          category: item.subject.category,
          teacherName: teacherBySubject.get(item.subjectId) ?? null,
          grades: grades.get(item.subjectId) ?? null,
          descriptions: descriptions.get(item.subjectId) ?? new Map(),
        }))
      : [],
    attendance,
    notes,
  });

  return {
    students: prepared,
    prep: {
      homeroomId: selected.id,
      className: selected.class.name,
      periodName: selected.academicPeriod.name,
      yearName,
      curriculumLabel,
      composer: supported ? "KURIKULUM_MERDEKA_SMK" as const : null,
      structureStatus: supported ? "TERSEDIA" as const : "BELUM_DIKONFIGURASI" as const,
      attendance: attendance.coverage,
      summary: {
        students: prepared.length,
        siap: prepared.filter((item) => item.status === "SIAP").length,
        belumLengkap: prepared.filter((item) => item.status === "BELUM_LENGKAP").length,
        belumDikonfigurasi: prepared.filter((item) => item.status === "BELUM_DIKONFIGURASI").length,
      },
      students: prepared,
    },
  };
}
