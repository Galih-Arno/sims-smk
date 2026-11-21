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

type RecapBody = {
  homerooms: Array<{ id: string; className: string }>;
  recap: {
    policyLabel: string | null;
    summary: { siap: number; belumLengkap: number; belumDikonfigurasi: number; belumDitugaskan: number };
    subjects: Array<{ name: string; teacherName: string | null; assignmentId: string | null }>;
    students: Array<{
      name: string;
      siap: number;
      belumLengkap: number;
      cells: Array<{ status: string; score: number | null; teacherName: string | null; parts: Array<{ submitted: boolean }> }>;
    }>;
  } | null;
};

describe("Rekap nilai akhir wali kelas", { concurrency: 1 }, () => {
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

  it("menampilkan rekap resmi kelas binaan aktif tanpa mengubah nilai mentah", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Rekap", npsn: "10400021" });
    const other = await createSchool(context.prisma, { name: "SMK Rekap Lain", npsn: "10400022" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const inactive = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Genap", semesterKind: "GENAP", startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z"), isActive: false },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KM", name: "Kurikulum Merdeka" } });
    const math = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const emptySubject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "BIN", name: "Bahasa Indonesia" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const guruUser = await createUser(context.prisma, { email: "guru.rekap@uji.local", name: "Guru Rekap", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.rekap@uji.local", name: "Wali Rekap", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.lain.rekap@uji.local", name: "Wali Lain", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.rekap.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Rekap", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Rekap", gender: "PEREMPUAN" } });
    const otherWali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWaliUser.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: math.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    const hidden = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: otherClass.id, academicPeriodId: inactive.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWali.id, classId: otherClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: math.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: emptySubject.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const student = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1040002101", nis: "01", name: "Siswa Rekap", gender: "LAKI_LAKI" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: student.id, uh: 80 } });
    await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: student.id, score: 70 } });
    await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId: student.id, sts: 90, sas: 100 } });
    const policy = await context.prisma.gradeReportPolicy.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        academicPeriodId: period.id,
        curriculumId: curriculum.id,
        label: "UJI-REKAP",
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
    const guruToken = await token(context, guruUser.email);
    const otherToken = await token(context, otherWaliUser.email);
    const neighborToken = await token(context, neighbor.email);
    const url = `/api/v1/schools/${school.id}/homeroom-grade-recap`;

    const unconfigured = await readRecap(context, url, waliToken);
    assert.deepEqual(unconfigured.homerooms.map((item) => item.id), [homeroom.id]);
    assert.equal(unconfigured.homerooms.some((item) => item.id === hidden.id), false);
    const before = cell(unconfigured, "Matematika");
    assert.equal(before.status, "BELUM_DIKONFIGURASI");
    assert.equal(before.score, null);
    assert.equal(cell(unconfigured, "Bahasa Indonesia").status, "BELUM_DITUGASKAN");
    assert.equal(cell(unconfigured, "Bahasa Indonesia").score, null);
    assert.equal(unconfigured.recap?.summary.belumDitugaskan, 1);

    await context.prisma.gradeReportPolicy.update({ where: { id: policy.id }, data: { status: "ACTIVE" } });
    const draft = await readRecap(context, url, waliToken);
    assert.equal(cell(draft, "Matematika").status, "BELUM_LENGKAP");
    assert.equal(cell(draft, "Matematika").score, null);
    assert.equal(draft.recap?.students[0]?.belumLengkap, 1);
    assert.equal(draft.recap?.summary.belumLengkap, 1);
    assert.equal(draft.recap?.policyLabel, "UJI-REKAP");

    await markSubmitted(context, school.id, assignment.id, objective.id, scope.id);
    const ready = await readRecap(context, url, waliToken);
    const readyCell = cell(ready, "Matematika");
    assert.equal(readyCell.status, "SIAP");
    assert.equal(readyCell.score, 83);
    assert.equal(readyCell.teacherName, "Guru Rekap");
    assert.equal(readyCell.parts.every((part) => part.submitted), true);
    assert.equal(ready.recap?.summary.siap, 1);
    assert.equal(ready.recap?.students[0]?.siap, 1);

    await context.prisma.termExamScore.update({
      where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: student.id } },
      data: { sas: null },
    });
    const empty = await readRecap(context, url, waliToken);
    assert.equal(cell(empty, "Matematika").status, "BELUM_LENGKAP");
    assert.equal(cell(empty, "Matematika").score, null);
    await context.prisma.termExamScore.update({
      where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: student.id } },
      data: { sas: 100 },
    });

    const guruRead = await context.app.inject({ method: "GET", url, headers: authHeader(guruToken) });
    assert.equal(guruRead.statusCode, 403);
    const otherRead = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${homeroom.id}`, headers: authHeader(otherToken) });
    assert.equal(otherRead.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url, headers: authHeader(neighborToken) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: student.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
    const audits = await context.prisma.auditLog.count({ where: { action: "GRADE_RECAP_READ", entityId: homeroom.id } });
    assert.ok(audits >= 1);
  });
});

function cell(body: RecapBody, subjectName: string) {
  const index = body.recap?.subjects.findIndex((item) => item.name === subjectName) ?? -1;
  const found = body.recap?.students[0]?.cells[index];
  assert.ok(found, subjectName);
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

async function readRecap(context: TestContext, url: string, accessToken: string): Promise<RecapBody> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<RecapBody>(response);
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
