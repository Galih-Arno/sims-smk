import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { assessGradePolicy } from "./grade-policy.service.ts";
import {
  computeFinalGrade,
  type FinalGradeBasis,
  type FinalPolicy,
  type FinalStudentInput,
  type FinalTpInput,
} from "./grade-final.calc.ts";

const assignmentInclude = {
  teacher: { select: { id: true, name: true, userId: true } },
  class: { select: { id: true, name: true, academicYearId: true } },
  subject: { select: { id: true, code: true, name: true } },
  academicPeriod: { select: { id: true, name: true, academicYearId: true } },
} satisfies Prisma.TeachingAssignmentInclude;

type AssignmentRow = Prisma.TeachingAssignmentGetPayload<{ include: typeof assignmentInclude }>;

export type FinalGradeStudentDto = {
  studentId: string;
  name: string;
  nis: string | null;
  status: "BELUM_DIKONFIGURASI" | "BELUM_LENGKAP" | "PRATINJAU" | "SIAP";
  score: number | null;
  formula: string;
  parts: Array<{ label: string; value: number | null; weight: number; contribution: number | null; submitted: boolean; note: string }>;
  savedScore: number | null;
};

export type FinalGradeSheetDto = {
  assignmentId: string;
  className: string;
  subjectName: string;
  periodName: string;
  curriculumName: string | null;
  policyLabel: string | null;
  basis: FinalGradeBasis;
  configured: boolean;
  canSave: boolean;
  students: FinalGradeStudentDto[];
};

export type FinalGradeListItem = {
  assignmentId: string;
  className: string;
  subjectName: string;
  periodName: string;
  siap: number;
  pratinjau: number;
  belumLengkap: number;
  belumDikonfigurasi: number;
};

function amount(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function toPolicy(row: {
  useFormative: boolean;
  useSummative: boolean;
  useSts: boolean;
  useSas: boolean;
  formativeMode: FinalPolicy["formativeMode"];
  weightFormative: Prisma.Decimal | null;
  weightUh: Prisma.Decimal | null;
  weightT1: Prisma.Decimal | null;
  weightT2: Prisma.Decimal | null;
  weightT3: Prisma.Decimal | null;
  weightSummative: Prisma.Decimal | null;
  weightSts: Prisma.Decimal | null;
  weightSas: Prisma.Decimal | null;
  remedialPolicy: FinalPolicy["remedialPolicy"];
  remedialCap: Prisma.Decimal | null;
  roundingMode: FinalPolicy["roundingMode"];
  academicYearId: string;
  academicPeriodId: string;
  curriculumId: string;
  label: string | null;
  emptyTreatment: "INCOMPLETE";
}): FinalPolicy | null {
  const preview = assessGradePolicy({
    academicYearId: row.academicYearId,
    academicPeriodId: row.academicPeriodId,
    curriculumId: row.curriculumId,
    label: row.label,
    useFormative: row.useFormative,
    useSummative: row.useSummative,
    useSts: row.useSts,
    useSas: row.useSas,
    formativeMode: row.formativeMode,
    weightFormative: amount(row.weightFormative),
    weightUh: amount(row.weightUh),
    weightT1: amount(row.weightT1),
    weightT2: amount(row.weightT2),
    weightT3: amount(row.weightT3),
    weightSummative: amount(row.weightSummative),
    weightSts: amount(row.weightSts),
    weightSas: amount(row.weightSas),
    remedialPolicy: row.remedialPolicy,
    remedialCap: amount(row.remedialCap),
    emptyTreatment: "INCOMPLETE",
    roundingMode: row.roundingMode,
  });
  if (!preview.valid) return null;
  return {
    formativeMode: row.formativeMode,
    useFormative: row.useFormative,
    useSummative: row.useSummative,
    useSts: row.useSts,
    useSas: row.useSas,
    weightFormative: amount(row.weightFormative),
    weightUh: amount(row.weightUh),
    weightT1: amount(row.weightT1),
    weightT2: amount(row.weightT2),
    weightT3: amount(row.weightT3),
    weightSummative: amount(row.weightSummative),
    weightSts: amount(row.weightSts),
    weightSas: amount(row.weightSas),
    remedialPolicy: row.remedialPolicy,
    remedialCap: amount(row.remedialCap),
    roundingMode: row.roundingMode,
  };
}

async function loadAssignment(prisma: PrismaClient, schoolId: string, assignmentId: string): Promise<AssignmentRow> {
  const assignment = await prisma.teachingAssignment.findFirst({ where: { id: assignmentId, schoolId }, include: assignmentInclude });
  if (!assignment) throw new AppError(404, "NOT_FOUND", "Penugasan mengajar tidak ditemukan.");
  return assignment;
}

function hasRole(auth: AuthState, schoolId: string, role: "GURU_MAPEL" | "WALI_KELAS"): boolean {
  return auth.isSystemOwner || auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === role);
}

async function assertCanRead(prisma: PrismaClient, auth: AuthState, schoolId: string, assignment: AssignmentRow, basis: FinalGradeBasis, meta: RequestMeta) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (auth.isSystemOwner) return;
  if (basis === "preview") {
    const mine = assignment.teacher.userId === auth.userId && hasRole(auth, schoolId, "GURU_MAPEL");
    if (!mine) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
    return;
  }
  const homeroom = await prisma.homeroomAssignment.findFirst({
    where: {
      schoolId,
      classId: assignment.classId,
      academicPeriodId: assignment.academicPeriodId,
      teacher: { userId: auth.userId, isActive: true },
    },
    select: { id: true },
  });
  if (!homeroom || !hasRole(auth, schoolId, "WALI_KELAS")) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
}

async function activePolicy(prisma: PrismaClient, assignment: AssignmentRow): Promise<{ policy: FinalPolicy | null; curriculumName: string | null; policyLabel: string | null }> {
  if (!assignment.academicPeriod.academicYearId) return { policy: null, curriculumName: null, policyLabel: null };
  const placement = await prisma.curriculumPlacement.findFirst({
    where: {
      schoolId: assignment.schoolId,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      curriculum: { academicYearId: assignment.academicPeriod.academicYearId },
    },
    include: { curriculum: { select: { id: true, code: true, name: true } } },
  });
  if (!placement) return { policy: null, curriculumName: null, policyLabel: null };
  const row = await prisma.gradeReportPolicy.findFirst({
    where: {
      schoolId: assignment.schoolId,
      academicYearId: assignment.academicPeriod.academicYearId,
      academicPeriodId: assignment.academicPeriodId,
      curriculumId: placement.curriculum.id,
      status: "ACTIVE",
    },
  });
  const curriculumName = `${placement.curriculum.code} · ${placement.curriculum.name}`;
  if (!row) return { policy: null, curriculumName, policyLabel: null };
  return {
    policy: toPolicy({ ...row, label: row.label, emptyTreatment: "INCOMPLETE" }),
    curriculumName,
    policyLabel: row.label,
  };
}

async function studentInputs(prisma: PrismaClient, assignment: AssignmentRow): Promise<Array<FinalStudentInput & { studentId: string; name: string; nis: string | null }>> {
  const [students, objectives, scopes, submissions] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId: assignment.schoolId, classId: assignment.classId, isActive: true },
      select: { id: true, name: true, nis: true },
      orderBy: [{ name: "asc" }, { nis: "asc" }],
    }),
    prisma.learningObjective.findMany({
      where: { schoolId: assignment.schoolId, teachingAssignmentId: assignment.id },
      orderBy: [{ sequence: "asc" }, { code: "asc" }],
      include: { formativeAssessment: { include: { scores: true } } },
    }),
    prisma.materialScope.findMany({
      where: { schoolId: assignment.schoolId, teachingAssignmentId: assignment.id },
      orderBy: [{ sequence: "asc" }, { code: "asc" }],
      include: { summativeAssessment: { include: { scores: true } } },
    }),
    prisma.gradeComponentSubmission.findMany({
      where: { teachingAssignmentId: assignment.id },
      select: { componentKey: true, status: true },
    }),
  ]);
  const terms = await prisma.termExamScore.findMany({ where: { teachingAssignmentId: assignment.id } });
  const accepted = new Set(submissions.filter((item) => item.status === "SUBMITTED").map((item) => item.componentKey));
  const termByStudent = new Map(terms.map((item) => [item.studentId, item]));
  return students.map((student) => {
    const formative: FinalTpInput[] = objectives.map((objective) => {
      const score = objective.formativeAssessment?.scores.find((item) => item.studentId === student.id);
      const key = (field: string) => `f:${field}:${objective.id}`;
      return {
        code: objective.code,
        uh: amount(score?.uh ?? null),
        t1: amount(score?.t1 ?? null),
        t2: amount(score?.t2 ?? null),
        t3: amount(score?.t3 ?? null),
        remedial: amount(score?.remedial ?? null),
        uhSubmitted: accepted.has(key("uh")),
        t1Submitted: accepted.has(key("t1")),
        t2Submitted: accepted.has(key("t2")),
        t3Submitted: accepted.has(key("t3")),
        remedialSubmitted: accepted.has(key("remedial")),
      };
    });
    const summative = scopes.map((scope) => {
      const score = scope.summativeAssessment?.scores.find((item) => item.studentId === student.id);
      return {
        code: scope.code,
        score: amount(score?.score ?? null),
        remedial: amount(score?.remedial ?? null),
        submitted: accepted.has(`s:${scope.id}`),
      };
    });
    const term = termByStudent.get(student.id);
    return {
      studentId: student.id,
      name: student.name,
      nis: student.nis,
      formative,
      summative,
      sts: amount(term?.sts ?? null),
      sas: amount(term?.sas ?? null),
      stsSubmitted: accepted.has("sts"),
      sasSubmitted: accepted.has("sas"),
    };
  });
}

function presentStudents(
  rows: Array<FinalStudentInput & { studentId: string; name: string; nis: string | null }>,
  policy: FinalPolicy | null,
  basis: FinalGradeBasis,
  saved: Map<string, number>,
): FinalGradeStudentDto[] {
  return rows.map((row) => {
    const result = computeFinalGrade(policy, row, basis);
    return {
      studentId: row.studentId,
      name: row.name,
      nis: row.nis,
      status: result.status,
      score: result.score,
      formula: result.formula,
      parts: result.parts,
      savedScore: saved.get(row.studentId) ?? null,
    };
  });
}

export async function readOfficialFinalGrades(prisma: PrismaClient, schoolId: string, assignmentId: string) {
  const assignment = await loadAssignment(prisma, schoolId, assignmentId);
  const [{ policy }, rows] = await Promise.all([activePolicy(prisma, assignment), studentInputs(prisma, assignment)]);
  return presentStudents(rows, policy, "official", new Map()).map((item) => ({
    studentId: item.studentId,
    status: item.status === "SIAP" || item.status === "BELUM_DIKONFIGURASI" ? item.status : "BELUM_LENGKAP" as const,
    score: item.status === "SIAP" ? item.score : null,
  }));
}

export async function getFinalGradeSheet(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  basis: FinalGradeBasis,
  meta: RequestMeta,
): Promise<FinalGradeSheetDto> {
  const assignment = await loadAssignment(prisma, schoolId, assignmentId);
  await assertCanRead(prisma, auth, schoolId, assignment, basis, meta);
  const [{ policy, curriculumName, policyLabel }, rows, savedRows, homeroom] = await Promise.all([
    activePolicy(prisma, assignment),
    studentInputs(prisma, assignment),
    prisma.gradeFinalResult.findMany({ where: { teachingAssignmentId: assignment.id }, select: { studentId: true, score: true } }),
    prisma.homeroomAssignment.findFirst({
      where: {
        schoolId,
        classId: assignment.classId,
        academicPeriodId: assignment.academicPeriodId,
        teacher: { userId: auth.userId, isActive: true },
      },
      select: { id: true },
    }),
  ]);
  const saved = new Map(savedRows.map((item) => [item.studentId, item.score.toNumber()]));
  const students = presentStudents(rows, policy, basis, saved);
  const canSave =
    basis === "official" &&
    students.length > 0 &&
    students.every((item) => item.status === "SIAP") &&
    (auth.isSystemOwner || (Boolean(homeroom) && hasRole(auth, schoolId, "WALI_KELAS")));
  return {
    assignmentId: assignment.id,
    className: assignment.class.name,
    subjectName: assignment.subject.name,
    periodName: assignment.academicPeriod.name,
    curriculumName,
    policyLabel,
    basis,
    configured: policy !== null,
    canSave,
    students,
  };
}

export async function listFinalGrades(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  view: "guru" | "wali",
  meta: RequestMeta,
): Promise<{ items: FinalGradeListItem[] }> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId, isActive: true },
    select: { id: true },
  });
  let assignments: AssignmentRow[] = [];
  if (view === "guru") {
    if (!auth.isSystemOwner && (!teacher || !hasRole(auth, schoolId, "GURU_MAPEL"))) {
      throw new AppError(403, "FORBIDDEN", MSG.forbidden);
    }
    assignments = await prisma.teachingAssignment.findMany({
      where: { schoolId, ...(auth.isSystemOwner ? {} : { teacherId: teacher?.id ?? "none" }) },
      include: assignmentInclude,
      orderBy: { createdAt: "desc" },
    });
  } else {
    if (!auth.isSystemOwner && (!teacher || !hasRole(auth, schoolId, "WALI_KELAS"))) {
      throw new AppError(403, "FORBIDDEN", MSG.forbidden);
    }
    const homerooms = auth.isSystemOwner
      ? []
      : await prisma.homeroomAssignment.findMany({
          where: { schoolId, teacherId: teacher?.id },
          select: { classId: true, academicPeriodId: true },
        });
    assignments = await prisma.teachingAssignment.findMany({
      where: auth.isSystemOwner
        ? { schoolId }
        : { schoolId, OR: homerooms.map((item) => ({ classId: item.classId, academicPeriodId: item.academicPeriodId })) },
      include: assignmentInclude,
      orderBy: { createdAt: "desc" },
    });
    if (!auth.isSystemOwner && homerooms.length === 0) assignments = [];
  }
  const basis: FinalGradeBasis = view === "guru" ? "preview" : "official";
  const items: FinalGradeListItem[] = [];
  for (const assignment of assignments) {
    const { policy } = await activePolicy(prisma, assignment);
    const rows = await studentInputs(prisma, assignment);
    const students = presentStudents(rows, policy, basis, new Map());
    items.push({
      assignmentId: assignment.id,
      className: assignment.class.name,
      subjectName: assignment.subject.name,
      periodName: assignment.academicPeriod.name,
      siap: students.filter((item) => item.status === "SIAP").length,
      pratinjau: students.filter((item) => item.status === "PRATINJAU").length,
      belumLengkap: students.filter((item) => item.status === "BELUM_LENGKAP").length,
      belumDikonfigurasi: students.filter((item) => item.status === "BELUM_DIKONFIGURASI").length,
    });
  }
  return { items };
}

export async function commitFinalGrades(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  meta: RequestMeta,
): Promise<FinalGradeSheetDto> {
  const sheet = await getFinalGradeSheet(prisma, auth, schoolId, assignmentId, "official", meta);
  if (!sheet.canSave) throw new AppError(409, "CONFLICT", "Hasil resmi hanya dapat disimpan saat seluruh siswa berstatus Siap.");
  const previous = await prisma.gradeFinalResult.findMany({ where: { teachingAssignmentId: assignmentId }, select: { studentId: true, score: true } });
  for (const student of sheet.students) {
    if (student.score === null) throw new AppError(409, "CONFLICT", "Hasil resmi hanya dapat disimpan saat seluruh siswa berstatus Siap.");
    await prisma.gradeFinalResult.upsert({
      where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignmentId, studentId: student.studentId } },
      create: {
        schoolId,
        teachingAssignmentId: assignmentId,
        studentId: student.studentId,
        score: new Prisma.Decimal(student.score.toFixed(4)),
        formula: student.formula.slice(0, 1000),
        detail: student.parts as Prisma.InputJsonValue,
        savedById: auth.userId,
      },
      update: {
        score: new Prisma.Decimal(student.score.toFixed(4)),
        formula: student.formula.slice(0, 1000),
        detail: student.parts as Prisma.InputJsonValue,
        savedAt: new Date(),
        savedById: auth.userId,
      },
    });
  }
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "GRADE_FINAL_SAVED",
    entityType: "GradeFinalResult",
    entityId: assignmentId,
    metadata: {
      assignmentId,
      previous: previous.map((item) => ({ studentId: item.studentId, score: item.score.toNumber() })),
      next: sheet.students.map((item) => ({ studentId: item.studentId, score: item.score })),
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return getFinalGradeSheet(prisma, auth, schoolId, assignmentId, "official", meta);
}

export type RecapCellStatus = "BELUM_DIKONFIGURASI" | "BELUM_LENGKAP" | "SIAP" | "BELUM_DITUGASKAN";

export type HomeroomGradeRecapDto = {
  homerooms: Array<{ id: string; className: string; periodName: string }>;
  recap: {
    homeroomId: string;
    className: string;
    periodName: string;
    policyLabel: string | null;
    subjects: Array<{ subjectId: string; code: string; name: string; assignmentId: string | null; teacherName: string | null; configured: boolean }>;
    students: Array<{
      studentId: string;
      name: string;
      nis: string | null;
      siap: number;
      belumLengkap: number;
      belumDikonfigurasi: number;
      cells: Array<{
        subjectId: string;
        status: RecapCellStatus;
        score: number | null;
        formula: string;
        teacherName: string | null;
        parts: FinalGradeStudentDto["parts"];
      }>;
    }>;
    summary: { subjects: number; siap: number; belumLengkap: number; belumDikonfigurasi: number; belumDitugaskan: number };
  } | null;
};

export async function getHomeroomGradeRecap(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  meta: RequestMeta,
): Promise<HomeroomGradeRecapDto> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!auth.isSystemOwner && !hasRole(auth, schoolId, "WALI_KELAS")) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId, isActive: true },
    select: { id: true },
  });
  const homeroomWhere = auth.isSystemOwner
    ? { schoolId, academicPeriod: { isActive: true } }
    : { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } };
  const homerooms = await prisma.homeroomAssignment.findMany({
    where: homeroomWhere,
    include: { class: { select: { name: true } }, academicPeriod: { select: { name: true, academicYearId: true } } },
    orderBy: { class: { name: "asc" } },
  });
  const listed = homerooms.map((item) => ({ id: item.id, className: item.class.name, periodName: item.academicPeriod.name }));
  const selected = homeroomId ? homerooms.find((item) => item.id === homeroomId) : homerooms[0];
  if (homeroomId && !selected) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (!selected) return { homerooms: listed, recap: null };

  const [students, placements, assignments] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, classId: selected.classId, isActive: true },
      select: { id: true, name: true, nis: true },
      orderBy: [{ name: "asc" }, { nis: "asc" }],
    }),
    prisma.curriculumPlacement.findMany({
      where: {
        schoolId,
        classId: selected.classId,
        ...(selected.academicPeriod.academicYearId ? { curriculum: { academicYearId: selected.academicPeriod.academicYearId } } : {}),
      },
      include: { subject: { select: { id: true, code: true, name: true } } },
    }),
    prisma.teachingAssignment.findMany({
      where: { schoolId, classId: selected.classId, academicPeriodId: selected.academicPeriodId },
      include: assignmentInclude,
      orderBy: { subject: { name: "asc" } },
    }),
  ]);

  const columns = new Map<string, { subjectId: string; code: string; name: string; assignment: AssignmentRow | null }>();
  for (const placement of placements) {
    columns.set(placement.subjectId, { subjectId: placement.subject.id, code: placement.subject.code, name: placement.subject.name, assignment: null });
  }
  for (const assignment of assignments) {
    const current = columns.get(assignment.subjectId);
    columns.set(assignment.subjectId, {
      subjectId: assignment.subjectId,
      code: assignment.subject.code,
      name: assignment.subject.name,
      assignment,
    });
  }
  const ordered = [...columns.values()].sort((left, right) => left.name.localeCompare(right.name, "id"));
  const labels = new Set<string>();
  const computed = new Map<string, Map<string, FinalGradeStudentDto>>();
  const teachers = new Map<string, string | null>();
  const configured = new Map<string, boolean>();
  for (const column of ordered) {
    if (!column.assignment) {
      teachers.set(column.subjectId, null);
      configured.set(column.subjectId, false);
      continue;
    }
    const [{ policy, policyLabel }, rows] = await Promise.all([activePolicy(prisma, column.assignment), studentInputs(prisma, column.assignment)]);
    if (policyLabel) labels.add(policyLabel);
    teachers.set(column.subjectId, column.assignment.teacher.name);
    configured.set(column.subjectId, policy !== null);
    computed.set(column.subjectId, new Map(presentStudents(rows, policy, "official", new Map()).map((item) => [item.studentId, item])));
  }

  const recapStudents = students.map((student) => {
    const cells = ordered.map((column) => {
      if (!column.assignment) {
        return {
          subjectId: column.subjectId,
          status: "BELUM_DITUGASKAN" as const,
          score: null,
          formula: "Mata pelajaran belum memiliki penugasan mengajar. Nilai tidak ditampilkan sebagai nol.",
          teacherName: null,
          parts: [],
        };
      }
      const item = computed.get(column.subjectId)?.get(student.id);
      return {
        subjectId: column.subjectId,
        status: (item?.status ?? "BELUM_LENGKAP") as RecapCellStatus,
        score: item?.score ?? null,
        formula: item?.formula ?? "Komponen wajib belum lengkap. Nilai kosong tidak dihitung sebagai nol.",
        teacherName: teachers.get(column.subjectId) ?? null,
        parts: item?.parts ?? [],
      };
    });
    return {
      studentId: student.id,
      name: student.name,
      nis: student.nis,
      siap: cells.filter((cell) => cell.status === "SIAP").length,
      belumLengkap: cells.filter((cell) => cell.status === "BELUM_LENGKAP").length,
      belumDikonfigurasi: cells.filter((cell) => cell.status === "BELUM_DIKONFIGURASI").length,
      cells,
    };
  });

  const subjectBuckets = ordered.map((column) => {
    const cells = recapStudents.map((student) => student.cells.find((cell) => cell.subjectId === column.subjectId)?.status);
    if (cells.every((status) => status === "BELUM_DITUGASKAN")) return "belumDitugaskan";
    if (cells.every((status) => status === "BELUM_DIKONFIGURASI")) return "belumDikonfigurasi";
    if (cells.length > 0 && cells.every((status) => status === "SIAP")) return "siap";
    return "belumLengkap";
  });

  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "GRADE_RECAP_READ",
    entityType: "HomeroomAssignment",
    entityId: selected.id,
    metadata: { classId: selected.classId, academicPeriodId: selected.academicPeriodId, students: students.length, subjects: ordered.length },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    homerooms: listed,
    recap: {
      homeroomId: selected.id,
      className: selected.class.name,
      periodName: selected.academicPeriod.name,
      policyLabel: labels.size === 0 ? null : [...labels].join(", "),
      subjects: ordered.map((column) => ({
        subjectId: column.subjectId,
        code: column.code,
        name: column.name,
        assignmentId: column.assignment?.id ?? null,
        teacherName: teachers.get(column.subjectId) ?? null,
        configured: configured.get(column.subjectId) ?? false,
      })),
      students: recapStudents,
      summary: {
        subjects: ordered.length,
        siap: subjectBuckets.filter((item) => item === "siap").length,
        belumLengkap: subjectBuckets.filter((item) => item === "belumLengkap").length,
        belumDikonfigurasi: subjectBuckets.filter((item) => item === "belumDikonfigurasi").length,
        belumDitugaskan: subjectBuckets.filter((item) => item === "belumDitugaskan").length,
      },
    },
  };
}

export type MonitorGradeStatus = "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI" | "BELUM_DITUGASKAN";
export type MonitorComponentState = "KOSONG" | "DRAFT" | "SUBMITTED" | "REVISION_REQUESTED";
export type MonitorSubmissionStatus = "SUBMITTED" | "DRAFT" | "REVISION_REQUESTED" | "BELUM_DIKONFIGURASI" | "BELUM_DITUGASKAN";

export type HomeroomGradeMonitorDto = {
  homerooms: Array<{ id: string; className: string; periodName: string }>;
  monitor: {
    homeroomId: string;
    className: string;
    periodName: string;
    policyLabel: string | null;
    summary: {
      students: number;
      subjects: number;
      siap: number;
      belumLengkap: number;
      belumDikonfigurasi: number;
      belumDitugaskan: number;
      siswaSiap: number;
      revisi: number;
    };
    subjects: Array<{
      subjectId: string;
      code: string;
      name: string;
      assignmentId: string | null;
      teacherName: string | null;
      gradeStatus: MonitorGradeStatus;
      submissionStatus: MonitorSubmissionStatus;
      siap: number;
      belumLengkap: number;
      revisions: number;
      students: Array<{
        studentId: string;
        name: string;
        nis: string | null;
        status: MonitorGradeStatus;
        components: Array<{ label: string; state: MonitorComponentState; required: boolean }>;
      }>;
    }>;
  } | null;
};

type MonitorComponent = { label: string; state: MonitorComponentState; required: boolean };
type ScoreSnap = { uh: number | null; t1: number | null; t2: number | null; t3: number | null; remedial: number | null };

function componentState(value: number | null, status: string | undefined): MonitorComponentState {
  if (status === "REVISION_REQUESTED") return "REVISION_REQUESTED";
  if (value === null) return "KOSONG";
  return status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
}

function monitorGradeStatus(status: string | undefined): MonitorGradeStatus {
  if (status === "SIAP" || status === "BELUM_DIKONFIGURASI" || status === "BELUM_LENGKAP") return status;
  return "BELUM_LENGKAP";
}

export async function getHomeroomGradeMonitor(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  homeroomId: string | undefined,
  meta: RequestMeta,
): Promise<HomeroomGradeMonitorDto> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  if (!auth.isSystemOwner && !hasRole(auth, schoolId, "WALI_KELAS")) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  const teacher = await prisma.teacher.findFirst({
    where: { schoolId, userId: auth.userId, isActive: true },
    select: { id: true },
  });
  const homeroomWhere = auth.isSystemOwner
    ? { schoolId, academicPeriod: { isActive: true } }
    : { schoolId, teacherId: teacher?.id ?? "none", academicPeriod: { isActive: true } };
  const homerooms = await prisma.homeroomAssignment.findMany({
    where: homeroomWhere,
    include: { class: { select: { name: true } }, academicPeriod: { select: { name: true, academicYearId: true } } },
    orderBy: { class: { name: "asc" } },
  });
  const listed = homerooms.map((item) => ({ id: item.id, className: item.class.name, periodName: item.academicPeriod.name }));
  const selected = homeroomId ? homerooms.find((item) => item.id === homeroomId) : homerooms[0];
  if (homeroomId && !selected) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  if (!selected) return { homerooms: listed, monitor: null };

  const [students, placements, assignments] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId, classId: selected.classId, isActive: true },
      select: { id: true, name: true, nis: true },
      orderBy: [{ name: "asc" }, { nis: "asc" }],
    }),
    prisma.curriculumPlacement.findMany({
      where: {
        schoolId,
        classId: selected.classId,
        ...(selected.academicPeriod.academicYearId ? { curriculum: { academicYearId: selected.academicPeriod.academicYearId } } : {}),
      },
      include: { subject: { select: { id: true, code: true, name: true } } },
    }),
    prisma.teachingAssignment.findMany({
      where: { schoolId, classId: selected.classId, academicPeriodId: selected.academicPeriodId },
      include: assignmentInclude,
      orderBy: { subject: { name: "asc" } },
    }),
  ]);

  const columns = new Map<string, { subjectId: string; code: string; name: string; assignment: AssignmentRow | null }>();
  for (const placement of placements) {
    columns.set(placement.subjectId, { subjectId: placement.subject.id, code: placement.subject.code, name: placement.subject.name, assignment: null });
  }
  for (const assignment of assignments) {
    columns.set(assignment.subjectId, {
      subjectId: assignment.subjectId,
      code: assignment.subject.code,
      name: assignment.subject.name,
      assignment,
    });
  }
  const ordered = [...columns.values()].sort((left, right) => left.name.localeCompare(right.name, "id"));
  const labels = new Set<string>();
  const subjectRows: NonNullable<HomeroomGradeMonitorDto["monitor"]>["subjects"] = [];
  for (const column of ordered) {
    if (!column.assignment) {
      subjectRows.push({
        subjectId: column.subjectId,
        code: column.code,
        name: column.name,
        assignmentId: null,
        teacherName: null,
        gradeStatus: "BELUM_DITUGASKAN" as const,
        submissionStatus: "BELUM_DITUGASKAN" as const,
        siap: 0,
        belumLengkap: 0,
        revisions: 0,
        students: students.map((student) => ({
          studentId: student.id,
          name: student.name,
          nis: student.nis,
          status: "BELUM_DITUGASKAN" as const,
          components: [],
        })),
      });
      continue;
    }
    const assignment = column.assignment;
    const [{ policy, policyLabel }, rows, sources] = await Promise.all([
      activePolicy(prisma, assignment),
      studentInputs(prisma, assignment),
      monitorSources(prisma, assignment.id),
    ]);
    if (policyLabel) labels.add(policyLabel);
    const official = new Map(presentStudents(rows, policy, "official", new Map()).map((item) => [item.studentId, item]));
    const statusOf = new Map(sources.submissions.map((item) => [item.componentKey, item.status]));
    const revisions = sources.submissions.filter((item) => item.status === "REVISION_REQUESTED").length;
    const detail = students.map((student) => {
      const computed = official.get(student.id);
      const components = policy
        ? monitorComponents(policy, sources, student.id, (key) => statusOf.get(key))
        : [];
      return {
        studentId: student.id,
        name: student.name,
        nis: student.nis,
        status: monitorGradeStatus(computed?.status),
        components,
      };
    });
    const siap = detail.filter((item) => item.status === "SIAP").length;
    const belumLengkap = detail.filter((item) => item.status === "BELUM_LENGKAP").length;
    const gradeStatus: MonitorGradeStatus = policy === null
      ? "BELUM_DIKONFIGURASI"
      : detail.length > 0 && detail.every((item) => item.status === "SIAP")
        ? "SIAP"
        : "BELUM_LENGKAP";
    const requiredOpen = detail.some((item) => item.components.some((component) => component.required && component.state !== "SUBMITTED"));
    const submissionStatus: MonitorSubmissionStatus = policy === null
      ? "BELUM_DIKONFIGURASI"
      : revisions > 0
        ? "REVISION_REQUESTED"
        : requiredOpen
          ? "DRAFT"
          : "SUBMITTED";
    subjectRows.push({
      subjectId: column.subjectId,
      code: column.code,
      name: column.name,
      assignmentId: assignment.id,
      teacherName: assignment.teacher.name,
      gradeStatus,
      submissionStatus,
      siap,
      belumLengkap,
      revisions,
      students: detail,
    });
  }

  const siswaSiap = students.filter((student) => subjectRows.every((subject) => subject.students.find((item) => item.studentId === student.id)?.status === "SIAP")).length;
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "GRADE_MONITOR_READ",
    entityType: "HomeroomAssignment",
    entityId: selected.id,
    metadata: { classId: selected.classId, academicPeriodId: selected.academicPeriodId, students: students.length, subjects: ordered.length },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    homerooms: listed,
    monitor: {
      homeroomId: selected.id,
      className: selected.class.name,
      periodName: selected.academicPeriod.name,
      policyLabel: labels.size === 0 ? null : [...labels].join(", "),
      summary: {
        students: students.length,
        subjects: subjectRows.length,
        siap: subjectRows.filter((item) => item.gradeStatus === "SIAP").length,
        belumLengkap: subjectRows.filter((item) => item.gradeStatus === "BELUM_LENGKAP").length,
        belumDikonfigurasi: subjectRows.filter((item) => item.gradeStatus === "BELUM_DIKONFIGURASI").length,
        belumDitugaskan: subjectRows.filter((item) => item.gradeStatus === "BELUM_DITUGASKAN").length,
        siswaSiap,
        revisi: subjectRows.reduce((sum, item) => sum + item.revisions, 0),
      },
      subjects: subjectRows,
    },
  };
}

async function monitorSources(prisma: PrismaClient, assignmentId: string) {
  const [objectives, scopes, terms, submissions] = await Promise.all([
    prisma.learningObjective.findMany({
      where: { teachingAssignmentId: assignmentId },
      orderBy: [{ sequence: "asc" }, { code: "asc" }],
      include: { formativeAssessment: { include: { scores: true } } },
    }),
    prisma.materialScope.findMany({
      where: { teachingAssignmentId: assignmentId },
      orderBy: [{ sequence: "asc" }, { code: "asc" }],
      include: { summativeAssessment: { include: { scores: true } } },
    }),
    prisma.termExamScore.findMany({ where: { teachingAssignmentId: assignmentId } }),
    prisma.gradeComponentSubmission.findMany({
      where: { teachingAssignmentId: assignmentId },
      select: { componentKey: true, status: true },
    }),
  ]);
  return { objectives, scopes, terms, submissions };
}

function monitorComponents(
  policy: FinalPolicy,
  sources: Awaited<ReturnType<typeof monitorSources>>,
  studentId: string,
  statusOf: (key: string) => string | undefined,
): MonitorComponent[] {
  const rows: MonitorComponent[] = [];
  if (policy.useFormative) {
    for (const objective of sources.objectives) {
      const score = objective.formativeAssessment?.scores.find((item) => item.studentId === studentId);
      const snap: ScoreSnap = {
        uh: amount(score?.uh ?? null),
        t1: amount(score?.t1 ?? null),
        t2: amount(score?.t2 ?? null),
        t3: amount(score?.t3 ?? null),
        remedial: amount(score?.remedial ?? null),
      };
      if (policy.formativeMode === "COMBINED") {
        const fields = [
          ["UH", snap.uh, "uh"],
          ["Tugas 1", snap.t1, "t1"],
          ["Tugas 2", snap.t2, "t2"],
          ["Tugas 3", snap.t3, "t3"],
        ] as const;
        const present = fields.filter((field) => field[1] !== null);
        if (present.length === 0) rows.push({ label: `${objective.code} · Formatif`, state: "KOSONG", required: true });
        for (const [label, value, field] of present) {
          rows.push({ label: `${objective.code} · ${label}`, state: componentState(value, statusOf(`f:${field}:${objective.id}`)), required: true });
        }
      } else {
        const fields = [
          ["UH", snap.uh, "uh", policy.weightUh],
          ["Tugas 1", snap.t1, "t1", policy.weightT1],
          ["Tugas 2", snap.t2, "t2", policy.weightT2],
          ["Tugas 3", snap.t3, "t3", policy.weightT3],
        ] as const;
        for (const [label, value, field, weight] of fields) {
          if (weight === null) continue;
          rows.push({ label: `${objective.code} · ${label}`, state: componentState(value, statusOf(`f:${field}:${objective.id}`)), required: true });
        }
      }
      if (snap.remedial !== null) {
        rows.push({ label: `${objective.code} · Remedial`, state: componentState(snap.remedial, statusOf(`f:remedial:${objective.id}`)), required: false });
      }
    }
  }
  if (policy.useSummative) {
    for (const scope of sources.scopes) {
      const score = scope.summativeAssessment?.scores.find((item) => item.studentId === studentId);
      const value = amount(score?.score ?? null);
      const remedial = amount(score?.remedial ?? null);
      rows.push({ label: `${scope.code} · Sumatif`, state: componentState(value, statusOf(`s:${scope.id}`)), required: true });
      if (remedial !== null) rows.push({ label: `${scope.code} · Remedial`, state: componentState(remedial, statusOf(`s:${scope.id}`)), required: false });
    }
  }
  const term = sources.terms.find((item) => item.studentId === studentId);
  if (policy.useSts) rows.push({ label: "STS", state: componentState(amount(term?.sts ?? null), statusOf("sts")), required: true });
  if (policy.useSas) rows.push({ label: "SAS", state: componentState(amount(term?.sas ?? null), statusOf("sas")), required: true });
  return rows;
}
