import type { GradeCompletenessDto, GradeComponentField, GradeComponentStatusDto, GradeLegacyLockDto, GradeSheetDto, GradeStatus, GradeWorkflowListDto } from "@sims/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { assertSchoolAccess, type RequestMeta } from "../../lib/tenant.ts";
import { assertCanManage } from "./scope.ts";
import type { GradeDecisionInput, GradeLegacyResolveInput, GradeRevisionInput, GradeSaveInput, GradeSubmitInput } from "./academic.schema.ts";

const STAFF_ROLES = ["ADMIN_SEKOLAH", "WAKAKUR", "KEPALA_SEKOLAH", "TU"] as const;
const FORMATIVE_FIELDS = ["uh", "t1", "t2", "t3", "remedial"] as const;
const DRAFT: GradeStatus = "DRAFT";
const SUBMISSION_HOLD = "Belum ada wali kelas aktif untuk kelas dan semester ini. Nilai tetap bisa disimpan, tetapi pengiriman ditahan.";
const LEGACY_LOCK_MESSAGE = "Status pengiriman lama pada penugasan ini tidak dapat dipetakan ke komponen tanpa menebak. Seluruh nilai tetap terkunci dan tidak ada status komponen yang diubah.";
const FIELD_LABEL: Record<GradeComponentField, string> = {
  uh: "UH",
  t1: "Tugas 1",
  t2: "Tugas 2",
  t3: "Tugas 3",
  remedial: "Remedial",
  score: "Sumatif",
  sts: "STS",
  sas: "SAS",
};
const FIELD_ENUM = {
  uh: "UH",
  t1: "T1",
  t2: "T2",
  t3: "T3",
  remedial: "REMEDIAL",
  score: "SCORE",
  sts: "STS",
  sas: "SAS",
} as const;

type FormativeField = (typeof FORMATIVE_FIELDS)[number];
type ScoreValue = number | null;

type AssignmentContext = Prisma.TeachingAssignmentGetPayload<{
  include: {
    teacher: { select: { id: true; name: true; userId: true } };
    class: { select: { id: true; name: true; academicYearId: true } };
    subject: { select: { name: true } };
    academicPeriod: { select: { id: true; name: true; academicYearId: true } };
    school: {
      select: {
        stsEnabled: true;
        sasEnabled: true;
        requireUh: true;
        requireT1: true;
        requireT2: true;
        requireT3: true;
        requireSummative: true;
        requireSts: true;
        requireSas: true;
      };
    };
  };
}>;

function scoreNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function sameScore(current: Prisma.Decimal | null, next: ScoreValue): boolean {
  if (next === null) return current === null;
  if (current === null) return false;
  return current.toFixed(2) === next.toFixed(2);
}

function asDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function emptyFormative(studentId: string) {
  return { studentId, uh: null, t1: null, t2: null, t3: null, remedial: null, status: DRAFT };
}

function emptySummative(studentId: string) {
  return { studentId, score: null, remedial: null, status: DRAFT };
}

function emptyTerm(studentId: string) {
  return { studentId, sts: null, sas: null, status: DRAFT };
}

async function loadAssignment(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  meta: RequestMeta,
): Promise<{ assignment: AssignmentContext; canWrite: boolean }> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const assignment = await prisma.teachingAssignment.findFirst({
    where: { id: assignmentId, schoolId },
    include: {
      teacher: { select: { id: true, name: true, userId: true } },
      class: { select: { id: true, name: true, academicYearId: true } },
      subject: { select: { name: true } },
      academicPeriod: { select: { id: true, name: true, academicYearId: true } },
      school: {
        select: {
          stsEnabled: true,
          sasEnabled: true,
          requireUh: true,
          requireT1: true,
          requireT2: true,
          requireT3: true,
          requireSummative: true,
          requireSts: true,
          requireSas: true,
        },
      },
    },
  });
  if (!assignment) throw new AppError(404, "NOT_FOUND", "Penugasan mengajar tidak ditemukan.");
  if (assignment.academicPeriod.academicYearId && assignment.academicPeriod.academicYearId !== assignment.class.academicYearId) {
    throw new AppError(409, "PERIOD_MISMATCH", "Semester penugasan tidak sesuai dengan tahun pelajaran kelas.");
  }

  const linkedTeacher = assignment.teacher.userId === auth.userId;
  const guru = auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "GURU_MAPEL");
  const staff =
    auth.isSystemOwner ||
    auth.assignments.some((item) => item.schoolId === schoolId && STAFF_ROLES.includes(item.roleCode as (typeof STAFF_ROLES)[number]));
  const homeroom = await prisma.homeroomAssignment.findFirst({
    where: {
      schoolId,
      classId: assignment.classId,
      academicPeriodId: assignment.academicPeriod.id,
      teacher: { userId: auth.userId, isActive: true },
    },
    select: { id: true },
  });
  const wali = Boolean(homeroom) && auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "WALI_KELAS");
  const canWrite = auth.isSystemOwner || (linkedTeacher && guru);
  if (!canWrite && !staff && !wali) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }
  return { assignment, canWrite };
}

async function enrolledStudents(prisma: PrismaClient, assignment: AssignmentContext) {
  return prisma.student.findMany({
    where: {
      schoolId: assignment.schoolId,
      classId: assignment.classId,
      isActive: true,
      class: { academicYearId: assignment.class.academicYearId },
    },
    select: { id: true, name: true, nis: true },
    orderBy: [{ name: "asc" }, { nis: "asc" }],
  });
}

export async function getGradeSheet(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  meta: RequestMeta,
): Promise<GradeSheetDto> {
  const { assignment } = await loadAssignment(prisma, auth, schoolId, assignmentId, meta);
  return presentSheet(prisma, assignment);
}

async function buildSheet(prisma: PrismaClient, assignment: AssignmentContext): Promise<Omit<GradeSheetDto, "submissionHold" | "recipientName" | "legacyLock" | "components" | "completeness">> {
  const [students, objectives, scopes, formativeScores, summativeScores, termScores] = await Promise.all([
    enrolledStudents(prisma, assignment),
    prisma.learningObjective.findMany({
      where: { schoolId: assignment.schoolId, teachingAssignmentId: assignment.id },
      orderBy: [{ sequence: "asc" }, { code: "asc" }],
      include: { formativeAssessment: { select: { id: true } } },
    }),
    prisma.materialScope.findMany({
      where: { schoolId: assignment.schoolId, teachingAssignmentId: assignment.id },
      orderBy: [{ sequence: "asc" }, { code: "asc" }],
      include: { summativeAssessment: { select: { id: true } } },
    }),
    prisma.formativeScore.findMany({
      where: { schoolId: assignment.schoolId, formativeAssessment: { learningObjective: { teachingAssignmentId: assignment.id } } },
    }),
    prisma.summativeScore.findMany({
      where: { schoolId: assignment.schoolId, summativeAssessment: { materialScope: { teachingAssignmentId: assignment.id } } },
    }),
    prisma.termExamScore.findMany({ where: { schoolId: assignment.schoolId, teachingAssignmentId: assignment.id } }),
  ]);
  const studentIds = new Set(students.map((student) => student.id));
  const formativeByKey = new Map(formativeScores.filter((row) => studentIds.has(row.studentId)).map((row) => [`${row.formativeAssessmentId}:${row.studentId}`, row]));
  const summativeByKey = new Map(summativeScores.filter((row) => studentIds.has(row.studentId)).map((row) => [`${row.summativeAssessmentId}:${row.studentId}`, row]));
  const termByStudent = new Map(termScores.filter((row) => studentIds.has(row.studentId)).map((row) => [row.studentId, row]));

  return {
    assignmentId: assignment.id,
    className: assignment.class.name,
    subjectName: assignment.subject.name,
    periodName: assignment.academicPeriod.name,
    teacherName: assignment.teacher.name,
    stsEnabled: assignment.school.stsEnabled,
    sasEnabled: assignment.school.sasEnabled,
    students: students.map((student) => ({ id: student.id, name: student.name, nis: student.nis })),
    formative: objectives.map((objective) => {
      const anchorId = objective.formativeAssessment?.id;
      return {
        learningObjectiveId: objective.id,
        code: objective.code,
        description: objective.description,
        sequence: objective.sequence,
        cells: students.map((student) => {
          const row = anchorId ? formativeByKey.get(`${anchorId}:${student.id}`) : undefined;
          if (!row) return emptyFormative(student.id);
          return {
            studentId: student.id,
            uh: scoreNumber(row.uh),
            t1: scoreNumber(row.t1),
            t2: scoreNumber(row.t2),
            t3: scoreNumber(row.t3),
            remedial: scoreNumber(row.remedial),
            status: row.status,
          };
        }),
      };
    }),
    summative: scopes.map((scope) => {
      const anchorId = scope.summativeAssessment?.id;
      return {
        materialScopeId: scope.id,
        code: scope.code,
        description: scope.description,
        sequence: scope.sequence,
        cells: students.map((student) => {
          const row = anchorId ? summativeByKey.get(`${anchorId}:${student.id}`) : undefined;
          if (!row) return emptySummative(student.id);
          return {
            studentId: student.id,
            score: scoreNumber(row.score),
            remedial: scoreNumber(row.remedial),
            status: row.status,
          };
        }),
      };
    }),
    termExams: students.map((student) => {
      const row = termByStudent.get(student.id);
      if (!row) return emptyTerm(student.id);
      return { studentId: student.id, sts: scoreNumber(row.sts), sas: scoreNumber(row.sas), status: row.status };
    }),
  };
}

function assertUnique(keys: string[], message: string) {
  if (new Set(keys).size !== keys.length) throw new AppError(400, "VALIDATION_ERROR", message);
}

type LockState = { legacyLocked: boolean; lockedKeys: Set<string> };

function unresolvedLegacy(legacy: { status: string; legacyResolvedAt: Date | null } | null, componentCount: number): boolean {
  return Boolean(legacy && legacy.status !== "DRAFT" && legacy.legacyResolvedAt === null && componentCount === 0);
}

async function lockState(tx: Prisma.TransactionClient, assignmentId: string): Promise<LockState> {
  const [legacy, rows] = await Promise.all([
    tx.gradeSubmission.findUnique({ where: { teachingAssignmentId: assignmentId }, select: { status: true, legacyResolvedAt: true } }),
    tx.gradeComponentSubmission.findMany({ where: { teachingAssignmentId: assignmentId }, select: { componentKey: true, status: true } }),
  ]);
  return {
    legacyLocked: unresolvedLegacy(legacy, rows.length),
    lockedKeys: new Set(rows.filter((row) => row.status !== "DRAFT").map((row) => row.componentKey)),
  };
}

function assertOpen(state: LockState, key: string, label: string) {
  if (state.legacyLocked) throw new AppError(409, "GRADE_LOCKED", LEGACY_LOCK_MESSAGE);
  if (state.lockedKeys.has(key)) {
    throw new AppError(409, "GRADE_LOCKED", `Nilai ${label} terkunci karena sudah dikirim. Perbaikan hanya bisa dilakukan setelah revisi disetujui.`);
  }
}

export async function saveGrades(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  input: GradeSaveInput,
  meta: RequestMeta,
): Promise<GradeSheetDto> {
  const loaded = await loadAssignment(prisma, auth, schoolId, assignmentId, meta);
  if (!loaded.canWrite) throw new AppError(403, "FORBIDDEN", "Nilai hanya dapat diubah oleh guru pada penugasannya.");
  const assignment = loaded.assignment;
  const students = await enrolledStudents(prisma, assignment);
  const allowed = new Set(students.map((student) => student.id));
  const formative = input.formative ?? [];
  const summative = input.summative ?? [];
  const termExams = input.termExams ?? [];
  assertUnique(formative.map((item) => `${item.learningObjectiveId}:${item.studentId}`), "Nilai formatif ganda untuk siswa yang sama.");
  assertUnique(summative.map((item) => `${item.materialScopeId}:${item.studentId}`), "Nilai sumatif ganda untuk siswa yang sama.");
  assertUnique(termExams.map((item) => item.studentId), "Nilai STS/SAS ganda untuk siswa yang sama.");
  for (const item of [...formative, ...summative, ...termExams]) {
    if (!allowed.has(item.studentId)) {
      throw new AppError(400, "VALIDATION_ERROR", "Siswa tidak terdaftar di kelas pada semester ini.");
    }
  }
  if (termExams.some((item) => item.sts !== undefined) && !assignment.school.stsEnabled) {
    throw new AppError(400, "VALIDATION_ERROR", "STS tidak diaktifkan oleh sekolah.");
  }
  if (termExams.some((item) => item.sas !== undefined) && !assignment.school.sasEnabled) {
    throw new AppError(400, "VALIDATION_ERROR", "SAS tidak diaktifkan oleh sekolah.");
  }

  await prisma.$transaction(async (tx) => {
    const locks = await lockState(tx, assignment.id);
    for (const change of formative) {
      const objective = await tx.learningObjective.findFirst({
        where: { id: change.learningObjectiveId, schoolId, teachingAssignmentId: assignment.id },
        select: { id: true },
      });
      if (!objective) throw new AppError(400, "VALIDATION_ERROR", "Tujuan pembelajaran tidak termasuk penugasan ini.");
      const anchor = await tx.formativeAssessment.upsert({
        where: { learningObjectiveId: objective.id },
        create: { schoolId, learningObjectiveId: objective.id },
        update: {},
      });
      const current = await tx.formativeScore.findUnique({
        where: { formativeAssessmentId_studentId: { formativeAssessmentId: anchor.id, studentId: change.studentId } },
      });
      const data: Prisma.FormativeScoreUpdateInput = {};
      const changes: { field: FormativeField; previous: ScoreValue; next: ScoreValue }[] = [];
      for (const field of FORMATIVE_FIELDS) {
        const next = change[field];
        if (next === undefined) continue;
        const previous = current ? scoreNumber(current[field]) : null;
        if (current && sameScore(current[field], next)) continue;
        if (!current && next === null) continue;
        assertOpen(locks, `f:${field}:${objective.id}`, FIELD_LABEL[field]);
        data[field] = next === null ? null : asDecimal(next);
        changes.push({ field, previous: current ? scoreNumber(current[field]) : null, next });
      }
      if (changes.length === 0) continue;
      const saved = current
        ? await tx.formativeScore.update({ where: { id: current.id }, data })
        : await tx.formativeScore.create({
            data: {
              schoolId,
              formativeAssessmentId: anchor.id,
              studentId: change.studentId,
              status: "DRAFT",
              ...Object.fromEntries(changes.map((item) => [item.field, item.next === null ? null : asDecimal(item.next)])),
            },
          });
      for (const item of changes) {
        await writeAudit(tx, {
          schoolId,
          actorId: auth.userId,
          action: "GRADE_UPDATED",
          entityType: "FormativeScore",
          entityId: saved.id,
          metadata: {
            teachingAssignmentId: assignment.id,
            studentId: change.studentId,
            learningObjectiveId: objective.id,
            component: item.field,
            previous: item.previous,
            next: item.next,
            status: "DRAFT",
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
    }

    for (const change of summative) {
      const scope = await tx.materialScope.findFirst({
        where: { id: change.materialScopeId, schoolId, teachingAssignmentId: assignment.id },
        select: { id: true },
      });
      if (!scope) throw new AppError(400, "VALIDATION_ERROR", "Lingkup materi tidak termasuk penugasan ini.");
      const anchor = await tx.summativeAssessment.upsert({
        where: { materialScopeId: scope.id },
        create: { schoolId, materialScopeId: scope.id },
        update: {},
      });
      const current = await tx.summativeScore.findUnique({
        where: { summativeAssessmentId_studentId: { summativeAssessmentId: anchor.id, studentId: change.studentId } },
      });
      const fields = ["score", "remedial"] as const;
      const changes: { field: "score" | "remedial"; previous: ScoreValue; next: ScoreValue }[] = [];
      const data: Prisma.SummativeScoreUpdateInput = {};
      for (const field of fields) {
        const next = change[field];
        if (next === undefined) continue;
        if (current && sameScore(current[field], next)) continue;
        if (!current && next === null) continue;
        assertOpen(locks, `s:${scope.id}`, "Sumatif");
        data[field] = next === null ? null : asDecimal(next);
        changes.push({ field, previous: current ? scoreNumber(current[field]) : null, next });
      }
      if (changes.length === 0) continue;
      const saved = current
        ? await tx.summativeScore.update({ where: { id: current.id }, data })
        : await tx.summativeScore.create({
            data: {
              schoolId,
              summativeAssessmentId: anchor.id,
              studentId: change.studentId,
              status: "DRAFT",
              ...Object.fromEntries(changes.map((item) => [item.field, item.next === null ? null : asDecimal(item.next)])),
            },
          });
      for (const item of changes) {
        await writeAudit(tx, {
          schoolId,
          actorId: auth.userId,
          action: "GRADE_UPDATED",
          entityType: "SummativeScore",
          entityId: saved.id,
          metadata: {
            teachingAssignmentId: assignment.id,
            studentId: change.studentId,
            materialScopeId: scope.id,
            component: item.field,
            previous: item.previous,
            next: item.next,
            status: "DRAFT",
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
    }

    for (const change of termExams) {
      const current = await tx.termExamScore.findUnique({
        where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: change.studentId } },
      });
      const fields = ["sts", "sas"] as const;
      const changes: { field: "sts" | "sas"; previous: ScoreValue; next: ScoreValue }[] = [];
      const data: Prisma.TermExamScoreUpdateInput = {};
      for (const field of fields) {
        const next = change[field];
        if (next === undefined) continue;
        if (current && sameScore(current[field], next)) continue;
        if (!current && next === null) continue;
        assertOpen(locks, field, FIELD_LABEL[field]);
        data[field] = next === null ? null : asDecimal(next);
        changes.push({ field, previous: current ? scoreNumber(current[field]) : null, next });
      }
      if (changes.length === 0) continue;
      const saved = current
        ? await tx.termExamScore.update({ where: { id: current.id }, data })
        : await tx.termExamScore.create({
            data: {
              schoolId,
              teachingAssignmentId: assignment.id,
              studentId: change.studentId,
              status: "DRAFT",
              ...Object.fromEntries(changes.map((item) => [item.field, item.next === null ? null : asDecimal(item.next)])),
            },
          });
      for (const item of changes) {
        await writeAudit(tx, {
          schoolId,
          actorId: auth.userId,
          action: "GRADE_UPDATED",
          entityType: "TermExamScore",
          entityId: saved.id,
          metadata: {
            teachingAssignmentId: assignment.id,
            studentId: change.studentId,
            component: item.field,
            previous: item.previous,
            next: item.next,
            status: "DRAFT",
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
    }
  });

  return presentSheet(prisma, assignment);
}

const NO_POLICY_WARNING =
  "Sekolah belum menetapkan komponen nilai yang wajib diisi. Ringkasan kelengkapan hanya informasi, bukan syarat kelulusan atau nilai rapor.";

type SheetBody = Omit<GradeSheetDto, "submissionHold" | "recipientName" | "legacyLock" | "components" | "completeness">;

function completenessOf(sheet: SheetBody, school: AssignmentContext["school"]): GradeCompletenessDto {
  const components: GradeCompletenessDto["components"] = [];
  const formativeFields = [
    ["uh", "UH", school.requireUh],
    ["t1", "Tugas 1", school.requireT1],
    ["t2", "Tugas 2", school.requireT2],
    ["t3", "Tugas 3", school.requireT3],
  ] as const;
  for (const [key, label, required] of formativeFields) {
    const values = sheet.formative.flatMap((column) => column.cells.map((cell) => cell[key]));
    components.push({
      key,
      label,
      filled: values.filter((value) => value !== null).length,
      total: values.length,
      required,
      note: required && sheet.formative.length === 0 ? `${label} diwajibkan, tetapi belum ada tujuan pembelajaran.` : null,
    });
  }
  const summativeValues = sheet.summative.flatMap((column) => column.cells.map((cell) => cell.score));
  components.push({
    key: "score",
    label: "Nilai sumatif",
    filled: summativeValues.filter((value) => value !== null).length,
    total: summativeValues.length,
    required: school.requireSummative,
    note: school.requireSummative && sheet.summative.length === 0 ? "Nilai sumatif diwajibkan, tetapi belum ada lingkup materi." : null,
  });
  if (school.stsEnabled || school.requireSts) {
    const values = sheet.termExams.map((cell) => cell.sts);
    components.push({
      key: "sts",
      label: "STS",
      filled: school.stsEnabled ? values.filter((value) => value !== null).length : 0,
      total: school.stsEnabled ? values.length : 0,
      required: school.requireSts,
      note: school.requireSts && !school.stsEnabled ? "STS diwajibkan, tetapi tidak diaktifkan di profil sekolah." : null,
    });
  }
  if (school.sasEnabled || school.requireSas) {
    const values = sheet.termExams.map((cell) => cell.sas);
    components.push({
      key: "sas",
      label: "SAS",
      filled: school.sasEnabled ? values.filter((value) => value !== null).length : 0,
      total: school.sasEnabled ? values.length : 0,
      required: school.requireSas,
      note: school.requireSas && !school.sasEnabled ? "SAS diwajibkan, tetapi tidak diaktifkan di profil sekolah." : null,
    });
  }
  const policyConfigured = components.some((item) => item.required);
  let missingRequired = 0;
  if (policyConfigured) {
    for (const component of components) {
      if (!component.required) continue;
      missingRequired += component.note ? 1 : component.total - component.filled;
    }
  }
  return {
    policyConfigured,
    warning: policyConfigured ? null : NO_POLICY_WARNING,
    missingRequired,
    filled: components.reduce((sum, item) => sum + item.filled, 0),
    total: components.reduce((sum, item) => sum + item.total, 0),
    components,
  };
}

function componentCatalog(body: SheetBody, school: AssignmentContext["school"]): GradeComponentStatusDto[] {
  const items: GradeComponentStatusDto[] = [];
  const push = (item: Omit<GradeComponentStatusDto, "status" | "locked" | "submittedAt" | "revisionReason" | "recipientName">) => {
    items.push({ ...item, status: "DRAFT", locked: false, submittedAt: null, revisionReason: null, recipientName: null });
  };
  for (const column of body.formative) {
    for (const field of FORMATIVE_FIELDS) {
      const filled = column.cells.filter((cell) => cell[field] !== null).length;
      const required = field === "uh" ? school.requireUh : field === "t1" ? school.requireT1 : field === "t2" ? school.requireT2 : field === "t3" ? school.requireT3 : false;
      push({
        key: `f:${field}:${column.learningObjectiveId}`,
        kind: "FORMATIVE",
        field,
        learningObjectiveId: column.learningObjectiveId,
        materialScopeId: null,
        label: `${FIELD_LABEL[field]} · ${column.code}`,
        filled,
        total: column.cells.length,
        required,
        missingRequired: required ? column.cells.length - filled : 0,
      });
    }
  }
  for (const column of body.summative) {
    const filled = column.cells.filter((cell) => cell.score !== null || cell.remedial !== null).length;
    const scoreFilled = column.cells.filter((cell) => cell.score !== null).length;
    push({
      key: `s:${column.materialScopeId}`,
      kind: "SUMMATIVE",
      field: "score",
      learningObjectiveId: null,
      materialScopeId: column.materialScopeId,
      label: `Sumatif · ${column.code}`,
      filled,
      total: column.cells.length,
      required: school.requireSummative,
      missingRequired: school.requireSummative ? column.cells.length - scoreFilled : 0,
    });
  }
  if (school.stsEnabled || school.requireSts) {
    const filled = body.termExams.filter((cell) => cell.sts !== null).length;
    push({
      key: "sts",
      kind: "STS",
      field: "sts",
      learningObjectiveId: null,
      materialScopeId: null,
      label: "STS",
      filled: school.stsEnabled ? filled : 0,
      total: school.stsEnabled ? body.termExams.length : 0,
      required: school.requireSts,
      missingRequired: school.requireSts && !school.stsEnabled ? 1 : school.requireSts ? body.termExams.length - filled : 0,
    });
  }
  if (school.sasEnabled || school.requireSas) {
    const filled = body.termExams.filter((cell) => cell.sas !== null).length;
    push({
      key: "sas",
      kind: "SAS",
      field: "sas",
      learningObjectiveId: null,
      materialScopeId: null,
      label: "SAS",
      filled: school.sasEnabled ? filled : 0,
      total: school.sasEnabled ? body.termExams.length : 0,
      required: school.requireSas,
      missingRequired: school.requireSas && !school.sasEnabled ? 1 : school.requireSas ? body.termExams.length - filled : 0,
    });
  }
  return items;
}

async function presentSheet(prisma: PrismaClient, assignment: AssignmentContext): Promise<GradeSheetDto> {
  const body = await buildSheet(prisma, assignment);
  const [legacy, rows, homeroom] = await Promise.all([
    prisma.gradeSubmission.findUnique({ where: { teachingAssignmentId: assignment.id } }),
    prisma.gradeComponentSubmission.findMany({
      where: { teachingAssignmentId: assignment.id },
      include: { recipient: { select: { name: true } } },
    }),
    prisma.homeroomAssignment.findFirst({
      where: {
        schoolId: assignment.schoolId,
        classId: assignment.classId,
        academicPeriodId: assignment.academicPeriod.id,
        teacher: { isActive: true },
      },
      select: { teacher: { select: { name: true } } },
    }),
  ]);
  const byKey = new Map(rows.map((row) => [row.componentKey, row]));
  const legacyLock: GradeLegacyLockDto | null =
    unresolvedLegacy(legacy, rows.length) && legacy && legacy.status !== "DRAFT"
      ? { status: legacy.status, reason: legacy.revisionReason }
      : null;
  const recipientName = homeroom?.teacher.name ?? null;
  const components = componentCatalog(body, assignment.school).map((item) => {
    const row = byKey.get(item.key);
    const status = row?.status ?? "DRAFT";
    return {
      ...item,
      status,
      locked: legacyLock !== null || status !== "DRAFT",
      submittedAt: row?.submittedAt?.toISOString() ?? null,
      revisionReason: row?.status === "REVISION_REQUESTED" ? row.revisionReason : null,
      recipientName: row?.recipient?.name ?? recipientName,
    };
  });
  return {
    ...body,
    submissionHold: homeroom ? null : SUBMISSION_HOLD,
    recipientName,
    legacyLock,
    components,
    completeness: completenessOf(body, assignment.school),
  };
}

function hasSchoolRole(auth: AuthState, schoolId: string, roles: readonly string[]): boolean {
  return auth.isSystemOwner || auth.assignments.some((item) => item.schoolId === schoolId && roles.includes(item.roleCode));
}

async function auditWorkflow(
  prisma: PrismaClient,
  auth: AuthState,
  meta: RequestMeta,
  schoolId: string,
  assignmentId: string,
  action: string,
  metadata: Prisma.InputJsonValue,
) {
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action,
    entityType: "GradeComponentSubmission",
    entityId: assignmentId,
    metadata,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

async function activeHomeroom(prisma: PrismaClient, assignment: AssignmentContext) {
  return prisma.homeroomAssignment.findFirst({
    where: {
      schoolId: assignment.schoolId,
      classId: assignment.classId,
      academicPeriodId: assignment.academicPeriod.id,
      teacher: { isActive: true },
    },
    select: { teacher: { select: { id: true, userId: true, name: true } } },
  });
}

function targetComponent(sheet: GradeSheetDto, componentKey: string): GradeComponentStatusDto {
  const component = sheet.components.find((item) => item.key === componentKey);
  if (!component) throw new AppError(400, "VALIDATION_ERROR", "Komponen penilaian tidak ditemukan pada penugasan ini.");
  return component;
}

export async function submitGrades(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  input: GradeSubmitInput,
  meta: RequestMeta,
): Promise<GradeSheetDto> {
  const loaded = await loadAssignment(prisma, auth, schoolId, assignmentId, meta);
  if (!loaded.canWrite) throw new AppError(403, "FORBIDDEN", "Nilai hanya dapat dikirim oleh guru pada penugasannya.");
  const current = await presentSheet(prisma, loaded.assignment);
  if (current.legacyLock) throw new AppError(409, "GRADE_LOCKED", LEGACY_LOCK_MESSAGE);
  const component = targetComponent(current, input.componentKey);
  if (component.status !== "DRAFT") {
    throw new AppError(409, "GRADE_LOCKED", `${component.label} sudah dikirim atau sedang menunggu keputusan revisi.`);
  }
  if (component.filled === 0) {
    throw new AppError(400, "INCOMPLETE_GRADES", `${component.label} belum memiliki nilai tersimpan. Simpan minimal satu nilai sebelum dikirim.`);
  }
  if (component.missingRequired > 0) {
    throw new AppError(400, "INCOMPLETE_GRADES", `${component.label} belum lengkap: ${component.filled}/${component.total} siswa terisi.`);
  }
  const homeroom = await activeHomeroom(prisma, loaded.assignment);
  if (!homeroom) throw new AppError(409, "SUBMISSION_HELD", SUBMISSION_HOLD);
  const now = new Date();
  const saved = await prisma.gradeComponentSubmission.upsert({
    where: { teachingAssignmentId_componentKey: { teachingAssignmentId: loaded.assignment.id, componentKey: component.key } },
    create: {
      schoolId,
      teachingAssignmentId: loaded.assignment.id,
      componentKey: component.key,
      kind: component.kind,
      field: FIELD_ENUM[component.field],
      learningObjectiveId: component.learningObjectiveId,
      materialScopeId: component.materialScopeId,
      status: "SUBMITTED",
      submittedAt: now,
      submittedById: auth.userId,
      recipientTeacherId: homeroom.teacher.id,
    },
    update: {
      status: "SUBMITTED",
      submittedAt: now,
      submittedById: auth.userId,
      recipientTeacherId: homeroom.teacher.id,
      revisionReason: null,
      revisionRequestedAt: null,
      decidedAt: null,
      decidedById: null,
      decisionNote: null,
    },
  });
  await auditWorkflow(prisma, auth, meta, schoolId, saved.id, "GRADE_SUBMITTED", {
    teachingAssignmentId: loaded.assignment.id,
    componentKey: component.key,
    label: component.label,
    previous: "DRAFT",
    next: "SUBMITTED",
    filled: component.filled,
    total: component.total,
    recipientTeacherId: homeroom.teacher.id,
  });
  return presentSheet(prisma, loaded.assignment);
}

export async function requestGradeRevision(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  input: GradeRevisionInput,
  meta: RequestMeta,
): Promise<GradeSheetDto> {
  const loaded = await loadAssignment(prisma, auth, schoolId, assignmentId, meta);
  if (!loaded.canWrite) throw new AppError(403, "FORBIDDEN", "Permintaan revisi hanya dapat diajukan oleh guru pada penugasannya.");
  const current = await presentSheet(prisma, loaded.assignment);
  if (current.legacyLock) throw new AppError(409, "GRADE_LOCKED", LEGACY_LOCK_MESSAGE);
  const component = targetComponent(current, input.componentKey);
  const submission = await prisma.gradeComponentSubmission.findUnique({
    where: { teachingAssignmentId_componentKey: { teachingAssignmentId: loaded.assignment.id, componentKey: component.key } },
  });
  if (!submission || submission.status !== "SUBMITTED") {
    throw new AppError(409, "GRADE_LOCKED", "Revisi hanya dapat diajukan untuk komponen yang sudah dikirim.");
  }
  const now = new Date();
  await prisma.gradeComponentSubmission.update({
    where: { id: submission.id },
    data: {
      status: "REVISION_REQUESTED",
      revisionReason: input.reason,
      revisionRequestedAt: now,
      decidedAt: null,
      decidedById: null,
      decisionNote: null,
    },
  });
  await auditWorkflow(prisma, auth, meta, schoolId, submission.id, "GRADE_REVISION_REQUESTED", {
    teachingAssignmentId: loaded.assignment.id,
    componentKey: component.key,
    label: component.label,
    previous: "SUBMITTED",
    next: "REVISION_REQUESTED",
    reason: input.reason,
  });
  return presentSheet(prisma, loaded.assignment);
}

export async function decideGradeRevision(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  input: GradeDecisionInput,
  meta: RequestMeta,
): Promise<GradeSheetDto> {
  const loaded = await loadAssignment(prisma, auth, schoolId, assignmentId, meta);
  const homeroom = await activeHomeroom(prisma, loaded.assignment);
  const wali = homeroom?.teacher.userId === auth.userId && hasSchoolRole(auth, schoolId, ["WALI_KELAS"]);
  if (!auth.isSystemOwner && !wali) {
    throw new AppError(403, "FORBIDDEN", "Keputusan revisi hanya dapat dilakukan oleh wali kelas aktif pada kelas dan semester ini.");
  }
  const current = await presentSheet(prisma, loaded.assignment);
  if (current.legacyLock) throw new AppError(409, "GRADE_LOCKED", LEGACY_LOCK_MESSAGE);
  const component = targetComponent(current, input.componentKey);
  const submission = await prisma.gradeComponentSubmission.findUnique({
    where: { teachingAssignmentId_componentKey: { teachingAssignmentId: loaded.assignment.id, componentKey: component.key } },
  });
  if (!submission || submission.status !== "REVISION_REQUESTED") {
    throw new AppError(409, "GRADE_LOCKED", "Tidak ada permintaan revisi pada komponen ini.");
  }
  const approved = input.decision === "approve";
  const next = approved ? "DRAFT" : "SUBMITTED";
  await prisma.gradeComponentSubmission.update({
    where: { id: submission.id },
    data: {
      status: next,
      decidedAt: new Date(),
      decidedById: auth.userId,
      decisionNote: input.note?.trim() ? input.note.trim() : null,
    },
  });
  await auditWorkflow(prisma, auth, meta, schoolId, submission.id, approved ? "GRADE_REVISION_APPROVED" : "GRADE_REVISION_REJECTED", {
    teachingAssignmentId: loaded.assignment.id,
    componentKey: component.key,
    label: component.label,
    previous: "REVISION_REQUESTED",
    next,
    note: input.note ?? null,
  });
  return presentSheet(prisma, loaded.assignment);
}

export async function resolveLegacyGradeSubmission(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  assignmentId: string,
  input: GradeLegacyResolveInput,
  meta: RequestMeta,
): Promise<GradeSheetDto> {
  await assertCanManage(prisma, auth, schoolId, meta);
  const loaded = await loadAssignment(prisma, auth, schoolId, assignmentId, meta);
  const [legacy, componentCount] = await Promise.all([
    prisma.gradeSubmission.findUnique({ where: { teachingAssignmentId: loaded.assignment.id } }),
    prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: loaded.assignment.id } }),
  ]);
  if (!legacy || !unresolvedLegacy(legacy, componentCount)) {
    throw new AppError(409, "GRADE_LOCKED", "Tidak ada status lama yang menunggu penyelesaian pada penugasan ini.");
  }
  const saved = await prisma.gradeSubmission.update({
    where: { id: legacy.id },
    data: {
      legacyResolvedAt: new Date(),
      legacyResolvedById: auth.userId,
      legacyResolutionNote: input.note,
    },
  });
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "GRADE_LEGACY_RESOLVED",
    entityType: "GradeSubmission",
    entityId: saved.id,
    metadata: {
      teachingAssignmentId: loaded.assignment.id,
      previous: legacy.status,
      next: legacy.status,
      componentRows: componentCount,
      note: input.note,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return presentSheet(prisma, loaded.assignment);
}

const ASSIGNMENT_INCLUDE = {
  teacher: { select: { id: true, name: true, userId: true } },
  class: { select: { id: true, name: true, academicYearId: true } },
  subject: { select: { name: true } },
  academicPeriod: { select: { id: true, name: true, academicYearId: true } },
  school: {
    select: {
      stsEnabled: true,
      sasEnabled: true,
      requireUh: true,
      requireT1: true,
      requireT2: true,
      requireT3: true,
      requireSummative: true,
      requireSts: true,
      requireSas: true,
    },
  },
} as const;

export async function listGradeWorkflows(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  view: "guru" | "wali" | "staff",
  meta: RequestMeta,
): Promise<GradeWorkflowListDto> {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      requireUh: true,
      requireT1: true,
      requireT2: true,
      requireT3: true,
      requireSummative: true,
      requireSts: true,
      requireSas: true,
    },
  });
  if (!school) throw new AppError(404, "SCHOOL_NOT_FOUND", MSG.schoolNotFound);
  const policyConfigured = Object.values(school).some(Boolean);
  const warning = policyConfigured ? null : NO_POLICY_WARNING;
  const empty = (message: string | null, homeroomMissing = false): GradeWorkflowListDto => ({
    homeroomMissing,
    message,
    policyConfigured,
    warning,
    items: [],
  });

  let where: Prisma.TeachingAssignmentWhereInput = { schoolId };
  if (view === "guru") {
    if (!hasSchoolRole(auth, schoolId, ["GURU_MAPEL"])) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
    const teacher = await prisma.teacher.findFirst({ where: { schoolId, userId: auth.userId }, select: { id: true } });
    if (!teacher) return empty("Anda belum memiliki penugasan mengajar. Silakan hubungi Wakasek Kurikulum.");
    where = { schoolId, teacherId: teacher.id };
  } else if (view === "wali") {
    if (!hasSchoolRole(auth, schoolId, ["WALI_KELAS"])) throw new AppError(403, "FORBIDDEN", MSG.forbidden);
    const teacher = await prisma.teacher.findFirst({ where: { schoolId, userId: auth.userId }, select: { id: true } });
    const homerooms = teacher
      ? await prisma.homeroomAssignment.findMany({
          where: { schoolId, teacherId: teacher.id, academicPeriod: { isActive: true } },
          select: { classId: true, academicPeriodId: true },
        })
      : [];
    if (homerooms.length === 0) {
      return empty("Anda belum memiliki penugasan wali kelas yang aktif. Penugasan tidak dibuat otomatis. Hubungi Admin Sekolah atau Wakasek Kurikulum.", true);
    }
    where = { schoolId, OR: homerooms.map((item) => ({ classId: item.classId, academicPeriodId: item.academicPeriodId })) };
  } else if (!hasSchoolRole(auth, schoolId, STAFF_ROLES)) {
    throw new AppError(403, "FORBIDDEN", MSG.forbidden);
  }

  const assignments = await prisma.teachingAssignment.findMany({
    where,
    include: ASSIGNMENT_INCLUDE,
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  const items = [];
  for (const assignment of assignments) {
    if (assignment.academicPeriod.academicYearId && assignment.academicPeriod.academicYearId !== assignment.class.academicYearId) continue;
    const sheet = await presentSheet(prisma, assignment);
    items.push({
      assignmentId: assignment.id,
      className: assignment.class.name,
      subjectName: assignment.subject.name,
      periodName: assignment.academicPeriod.name,
      teacherName: assignment.teacher.name,
      recipientName: sheet.recipientName,
      submissionHold: sheet.submissionHold,
      legacyLock: sheet.legacyLock,
      canResolveLegacy: sheet.legacyLock !== null && (auth.isSystemOwner || auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "ADMIN_SEKOLAH")),
      components: sheet.components.map((component) => ({
        ...component,
        canDecide: view === "wali" && component.status === "REVISION_REQUESTED" && sheet.legacyLock === null,
      })),
    });
  }
  return {
    homeroomMissing: false,
    message: items.length === 0 && view === "wali" ? "Belum ada penugasan mapel pada kelas perwalian yang aktif." : null,
    policyConfigured,
    warning,
    items,
  };
}
