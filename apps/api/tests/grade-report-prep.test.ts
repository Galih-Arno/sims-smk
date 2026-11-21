import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, LoginResponse } from "@sims/shared";
import { Prisma } from "@prisma/client";
import {
  assignRole,
  authHeader,
  closeTestContext,
  createSchool,
  createTestContext,
  createUser,
  jsonBody,
  loginRequest,
  migrateTestDatabase,
  resetDatabase,
  type TestContext,
} from "./helpers.ts";

const PASSWORD = "RahasiaUji!2026";

type SubjectLine = { name: string; teacherName: string | null; gradeStatus: string; score: number | null; description: { status: string; text: string | null } };
type StudentRow = {
  name: string;
  status: string;
  subjects: SubjectLine[];
  attendance: { dataStatus: string; completeness: string; sakit: number | null; izin: number | null; alpa: number | null };
  homeroomNote: { status: string; text: string | null };
  fields: Array<{ key: string; status: string; value: string | null }>;
};
type PrepBody = {
  homerooms: Array<{ id: string }>;
  prep: {
    composer: string | null;
    structureStatus: string;
    curriculumLabel: string | null;
    attendance: { completeness: string; finalDays: number };
    summary: { siap: number; belumLengkap: number; belumDikonfigurasi: number };
    students: StudentRow[];
  } | null;
};

describe("Persiapan data rapor Kurikulum Merdeka", { concurrency: 1 }, () => {
  let context: TestContext;

  before(async () => {
    migrateTestDatabase();
    context = await createTestContext();
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
  });

  after(async () => {
    await closeTestContext(context);
  });

  it("menyusun rapor dari struktur kurikulum dan nilai resmi tanpa mengubah nilai", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Rapor", npsn: "10600021" });
    const other = await createSchool(context.prisma, { name: "SMK Rapor Lain", npsn: "10600022" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const inactive = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Genap", semesterKind: "GENAP", startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z"), isActive: false },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KUMER", name: "KUMER1" } });
    const math = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const emptySubject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "BIN", name: "Bahasa Indonesia" } });
    const outside = await context.prisma.subject.create({ data: { schoolId: school.id, code: "EKS", name: "Ekstrakurikuler" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const guruUser = await createUser(context.prisma, { email: "guru.rapor@uji.local", name: "Guru Rapor", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.rapor@uji.local", name: "Wali Rapor", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.lain.rapor@uji.local", name: "Wali Lain", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.rapor.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Rapor", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Rapor", gender: "PEREMPUAN" } });
    const otherWali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWaliUser.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: math.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: outside.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: otherClass.id, academicPeriodId: inactive.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWali.id, classId: otherClass.id, academicPeriodId: period.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const student = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060002101", nis: "01", name: "Siswa Rapor", gender: "LAKI_LAKI" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: student.id, uh: 80 } });
    await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: student.id, score: 70 } });
    await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId: student.id, sts: 90, sas: 100 } });
    const policy = await context.prisma.gradeReportPolicy.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        academicPeriodId: period.id,
        curriculumId: curriculum.id,
        status: "DRAFT",
        useFormative: true,
        useSummative: true,
        useSts: true,
        useSas: true,
        formativeMode: "COMBINED",
        weightFormative: 30,
        weightSummative: 30,
        weightSts: 20,
        weightSas: 20,
        remedialPolicy: "HIGHEST",
        emptyTreatment: "INCOMPLETE",
        roundingMode: "INTEGER",
      },
    });

    const waliToken = await token(context, waliUser.email);
    const url = `/api/v1/schools/${school.id}/homeroom-report-prep`;
    const missing = await readPrep(context, url, waliToken);
    assert.deepEqual(missing.homerooms.map((item) => item.id), [homeroom.id]);
    assert.equal(missing.prep?.structureStatus, "BELUM_DIKONFIGURASI");
    assert.equal(missing.prep?.summary.siap, 0);
    assert.equal(missing.prep?.students[0]?.status, "BELUM_DIKONFIGURASI");

    const bahasa = await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: emptySubject.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: math.id } });
    const unassigned = await readPrep(context, url, waliToken);
    assert.equal(unassigned.prep?.composer, "KURIKULUM_MERDEKA_SMK");
    assert.equal(unassigned.prep?.structureStatus, "TERSEDIA");
    assert.equal(subject(unassigned, "Bahasa Indonesia").gradeStatus, "BELUM_DITUGASKAN");
    assert.equal(subject(unassigned, "Bahasa Indonesia").score, null);
    assert.equal(subject(unassigned, "Matematika").gradeStatus, "BELUM_DIKONFIGURASI");
    assert.equal(unassigned.prep?.students[0]?.subjects.some((item) => item.name === "Ekstrakurikuler"), false);
    assert.notEqual(unassigned.prep?.students[0]?.status, "SIAP");

    await context.prisma.gradeReportPolicy.update({ where: { id: policy.id }, data: { status: "ACTIVE" } });
    const draft = await readPrep(context, url, waliToken);
    assert.equal(subject(draft, "Matematika").gradeStatus, "BELUM_LENGKAP");
    assert.equal(subject(draft, "Matematika").score, null);
    assert.equal(subject(draft, "Matematika").teacherName, "Guru Rapor");
    assert.equal(draft.prep?.students[0]?.status, "BELUM_LENGKAP");

    await markSubmitted(context, school.id, assignment.id, objective.id, scope.id);
    const partial = await readPrep(context, url, waliToken);
    assert.equal(subject(partial, "Matematika").gradeStatus, "SIAP");
    assert.equal(subject(partial, "Matematika").score, 83);
    assert.equal(subject(partial, "Matematika").description.status, "BELUM_TERSEDIA");
    assert.equal(subject(partial, "Matematika").description.text, null);
    assert.equal(subject(partial, "Bahasa Indonesia").gradeStatus, "BELUM_DITUGASKAN");
    assert.equal(partial.prep?.students[0]?.status, "BELUM_LENGKAP");
    assert.equal(partial.prep?.summary.siap, 0);
    assert.equal(partial.prep?.students[0]?.attendance.dataStatus, "BELUM_ADA_DATA");
    assert.equal(partial.prep?.students[0]?.attendance.sakit, null);
    assert.equal(partial.prep?.attendance.completeness, "BELUM_DIKONFIGURASI");
    assert.equal(partial.prep?.students[0]?.homeroomNote.status, "BELUM_TERSEDIA");
    assert.equal(partial.prep?.students[0]?.homeroomNote.text, null);
    assert.equal(partial.prep?.students[0]?.fields.find((item) => item.key === "fase")?.status, "BELUM_TERSEDIA");

    await context.prisma.curriculumPlacement.delete({ where: { id: bahasa.id } });
    const ready = await readPrep(context, url, waliToken);
    assert.equal(subject(ready, "Matematika").gradeStatus, "SIAP");
    assert.equal(ready.prep?.students[0]?.status, "BELUM_LENGKAP");
    assert.equal(ready.prep?.summary.siap, 0);
    assert.equal(subject(ready, "Matematika").score, 83);
    assert.equal(ready.prep?.students[0]?.subjects.some((item) => item.name === "Bahasa Indonesia"), false);

    const guruRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, guruUser.email)) });
    assert.equal(guruRead.statusCode, 403);
    const otherRead = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, otherWaliUser.email)) });
    assert.equal(otherRead.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: student.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
    assert.equal(await context.prisma.gradeFinalResult.count({ where: { teachingAssignmentId: assignment.id } }), 0);
    const stored = await context.prisma.gradeComponentSubmission.findFirstOrThrow({ where: { teachingAssignmentId: assignment.id, componentKey: `f:uh:${objective.id}` } });
    assert.equal(stored.status, "SUBMITTED");
  });

  it("tidak menyatakan rapor siap bila kurikulum kelas bukan Kurikulum Merdeka", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Rapor Lama", npsn: "10600023" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KTSP", name: "KTSP 2006" } });
    const subjectRow = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 9", gradeLevel: 10 } });
    const user = await createUser(context.prisma, { email: "wali.ktsp@uji.local", name: "Wali Ktsp", password: PASSWORD });
    await assignRole(context.prisma, { userId: user.id, roleCode: "WALI_KELAS", schoolId: school.id });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: user.id, name: "Wali Ktsp", gender: "PEREMPUAN" } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: subjectRow.id } });
    await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060002301", nis: "01", name: "Siswa Ktsp", gender: "LAKI_LAKI" } });

    const body = await readPrep(context, `/api/v1/schools/${school.id}/homeroom-report-prep`, await token(context, user.email));
    assert.equal(body.prep?.structureStatus, "BELUM_DIKONFIGURASI");
    assert.equal(body.prep?.composer, null);
    assert.equal(body.prep?.summary.siap, 0);
    assert.equal(body.prep?.students[0]?.status, "BELUM_DIKONFIGURASI");
    assert.equal(body.prep?.students[0]?.subjects.length, 0);
  });
});

function subject(body: PrepBody, name: string): SubjectLine {
  const found = body.prep?.students[0]?.subjects.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

async function markSubmitted(context: TestContext, schoolId: string, assignmentId: string, objectiveId: string, scopeId: string) {
  const rows = [
    { componentKey: `f:uh:${objectiveId}`, kind: "FORMATIVE" as const, field: "UH" as const },
    { componentKey: `s:${scopeId}`, kind: "SUMMATIVE" as const, field: "SCORE" as const },
    { componentKey: "sts", kind: "STS" as const, field: "STS" as const },
    { componentKey: "sas", kind: "SAS" as const, field: "SAS" as const },
  ];
  for (const row of rows) {
    await context.prisma.gradeComponentSubmission.create({
      data: { schoolId, teachingAssignmentId: assignmentId, ...row, status: "SUBMITTED" },
    });
  }
}

async function readPrep(context: TestContext, url: string, accessToken: string): Promise<PrepBody> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<PrepBody>(response);
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
