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

type Sheet = {
  sheet: {
    configured: boolean;
    canSave: boolean;
    students: Array<{ studentId: string; status: string; score: number | null; formula: string }>;
  };
};

describe("Perhitungan nilai akhir rapor", { concurrency: 1 }, () => {
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

  it("menghitung bobot, remedial, kekosongan, dan pembulatan tanpa mengubah nilai mentah", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Akhir", npsn: "10400011" });
    const other = await createSchool(context.prisma, { name: "SMK Akhir Lain", npsn: "10400012" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z") },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KM", name: "Kurikulum Merdeka" } });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const guruUser = await createUser(context.prisma, { email: "guru.akhir@uji.local", name: "Guru Akhir", password: PASSWORD });
    const otherGuruUser = await createUser(context.prisma, { email: "guru.lain.akhir@uji.local", name: "Guru Lain", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.akhir@uji.local", name: "Wali Akhir", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.akhir.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherGuruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Akhir", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Akhir", gender: "PEREMPUAN" } });
    await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherGuruUser.id, name: "Guru Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subject.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: subject.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const first = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1040001101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    const second = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1040001102", nis: "02", name: "Siswa Dua", gender: "PEREMPUAN" } });
    await seedScores(context, school.id, formative.id, summative.id, assignment.id, first.id, { uh: 67, score: 80, sts: 90, sas: 100 });
    await seedScores(context, school.id, formative.id, summative.id, assignment.id, second.id, { uh: 67, score: 80, sts: 90, sas: 100 });
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
        weightFormative: 40,
        weightSummative: 30,
        weightSts: 20,
        weightSas: 10,
        remedialPolicy: "HIGHEST",
        emptyTreatment: "INCOMPLETE",
        roundingMode: "INTEGER",
      },
    });
    await markSubmitted(context, school.id, assignment.id, objective.id, scope.id, ["uh", "sts", "sas", "sum"]);

    const guruToken = await token(context, guruUser.email);
    const otherToken = await token(context, otherGuruUser.email);
    const waliToken = await token(context, waliUser.email);
    const neighborToken = await token(context, neighbor.email);
    const previewUrl = `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/final-grades?basis=preview`;
    const officialUrl = `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/final-grades?basis=official`;

    const unconfigured = await readSheet(context, previewUrl, guruToken);
    assert.equal(unconfigured.sheet.configured, false);
    assert.equal(unconfigured.sheet.students[0]?.status, "BELUM_DIKONFIGURASI");
    assert.equal(unconfigured.sheet.students[0]?.score, null);

    await context.prisma.gradeReportPolicy.update({ where: { id: policy.id }, data: { status: "ACTIVE" } });
    const ready = await readSheet(context, previewUrl, guruToken);
    assert.equal(ready.sheet.students[0]?.status, "SIAP");
    assert.equal(ready.sheet.students[0]?.score, 79);

    await context.prisma.termExamScore.update({ where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: first.id } }, data: { sas: null } });
    const empty = await readSheet(context, previewUrl, guruToken);
    const emptyStudent = empty.sheet.students.find((item) => item.studentId === first.id);
    assert.equal(emptyStudent?.status, "BELUM_LENGKAP");
    assert.equal(emptyStudent?.score, null);
    await context.prisma.termExamScore.update({ where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: first.id } }, data: { sas: 100 } });

    await context.prisma.gradeComponentSubmission.deleteMany({ where: { teachingAssignmentId: assignment.id, componentKey: `f:uh:${objective.id}` } });
    const draftPreview = await readSheet(context, previewUrl, guruToken);
    assert.equal(draftPreview.sheet.students[0]?.status, "PRATINJAU");
    assert.equal(draftPreview.sheet.students[0]?.score, 79);
    const draftOfficial = await readSheet(context, officialUrl, waliToken);
    assert.equal(draftOfficial.sheet.students[0]?.status, "BELUM_LENGKAP");
    assert.equal(draftOfficial.sheet.students[0]?.score, null);
    await markSubmitted(context, school.id, assignment.id, objective.id, scope.id, ["uh"]);

    await context.prisma.formativeScore.update({ where: { formativeAssessmentId_studentId: { formativeAssessmentId: formative.id, studentId: first.id } }, data: { remedial: 70 } });
    await context.prisma.formativeScore.update({ where: { formativeAssessmentId_studentId: { formativeAssessmentId: formative.id, studentId: second.id } }, data: { remedial: 70 } });
    await markSubmitted(context, school.id, assignment.id, objective.id, scope.id, ["remedial"]);
    const highest = await readSheet(context, officialUrl, waliToken);
    assert.equal(highest.sheet.students[0]?.score, 80);

    await context.prisma.gradeReportPolicy.update({ where: { id: policy.id }, data: { remedialPolicy: "LATEST" } });
    await context.prisma.formativeScore.updateMany({ where: { formativeAssessmentId: formative.id }, data: { remedial: 60 } });
    const latest = await readSheet(context, officialUrl, waliToken);
    assert.equal(latest.sheet.students[0]?.score, 76);

    await context.prisma.gradeReportPolicy.update({ where: { id: policy.id }, data: { remedialPolicy: "CAPPED", remedialCap: 75 } });
    await context.prisma.formativeScore.updateMany({ where: { formativeAssessmentId: formative.id }, data: { remedial: 90 } });
    const capped = await readSheet(context, officialUrl, waliToken);
    assert.equal(capped.sheet.students[0]?.score, 82);

    await context.prisma.gradeReportPolicy.update({
      where: { id: policy.id },
      data: { formativeMode: "SEPARATE", weightFormative: null, weightUh: 10, weightT1: 10, weightT2: 10, weightT3: 10, weightSummative: 30, weightSts: 15, weightSas: 15, remedialPolicy: "HIGHEST", remedialCap: null, roundingMode: "TWO_DECIMALS" },
    });
    await context.prisma.formativeScore.updateMany({ where: { formativeAssessmentId: formative.id }, data: { uh: 80, t1: 70, t2: 60, t3: 90, remedial: null } });
    await markSubmitted(context, school.id, assignment.id, objective.id, scope.id, ["t1", "t2", "t3"]);
    const separate = await readSheet(context, officialUrl, waliToken);
    assert.equal(separate.sheet.students[0]?.status, "SIAP");
    assert.equal(separate.sheet.students[0]?.score, 82.5);

    const otherRead = await context.app.inject({ method: "GET", url: previewUrl, headers: authHeader(otherToken) });
    assert.equal(otherRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(otherRead).error.code, "FORBIDDEN");
    const neighborRead = await context.app.inject({ method: "GET", url: `/api/v1/schools/${school.id}/final-grades?view=guru`, headers: authHeader(neighborToken) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");
    const guruOfficial = await context.app.inject({ method: "GET", url: officialUrl, headers: authHeader(guruToken) });
    assert.equal(guruOfficial.statusCode, 403);
    const waliPreview = await context.app.inject({ method: "GET", url: previewUrl, headers: authHeader(waliToken) });
    assert.equal(waliPreview.statusCode, 403);

    const blocked = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/final-grades/commit`,
      headers: authHeader(guruToken),
      payload: { confirm: true },
    });
    assert.equal(blocked.statusCode, 403);
    await context.prisma.termExamScore.update({ where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: second.id } }, data: { sas: null } });
    const incompleteSave = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/final-grades/commit`,
      headers: authHeader(waliToken),
      payload: { confirm: true },
    });
    assert.equal(incompleteSave.statusCode, 409);
    await context.prisma.termExamScore.update({ where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: second.id } }, data: { sas: 100 } });
    const saved = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/final-grades/commit`,
      headers: authHeader(waliToken),
      payload: { confirm: true },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(await context.prisma.gradeFinalResult.count(), 2);
    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: first.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
    const component = await context.prisma.gradeComponentSubmission.findFirstOrThrow({ where: { componentKey: `f:uh:${objective.id}` } });
    assert.equal(component.status, "SUBMITTED");
    const audits = await context.prisma.auditLog.findMany({ where: { action: "GRADE_FINAL_SAVED", entityId: assignment.id } });
    assert.equal(audits.length, 1);
  });
});

async function seedScores(
  context: TestContext,
  schoolId: string,
  formativeId: string,
  summativeId: string,
  assignmentId: string,
  studentId: string,
  scores: { uh: number; score: number; sts: number; sas: number },
) {
  await context.prisma.formativeScore.create({ data: { schoolId, formativeAssessmentId: formativeId, studentId, uh: scores.uh } });
  await context.prisma.summativeScore.create({ data: { schoolId, summativeAssessmentId: summativeId, studentId, score: scores.score } });
  await context.prisma.termExamScore.create({ data: { schoolId, teachingAssignmentId: assignmentId, studentId, sts: scores.sts, sas: scores.sas } });
}

async function markSubmitted(
  context: TestContext,
  schoolId: string,
  assignmentId: string,
  objectiveId: string,
  scopeId: string,
  fields: string[],
) {
  for (const field of fields) {
    const componentKey = field === "sts" || field === "sas" ? field : field === "sum" ? `s:${scopeId}` : field === "remedial" ? `f:remedial:${objectiveId}` : `f:${field}:${objectiveId}`;
    const kind = field === "sts" ? "STS" : field === "sas" ? "SAS" : field === "sum" ? "SUMMATIVE" : "FORMATIVE";
    const column = field === "sum" ? "SCORE" : field === "remedial" ? "REMEDIAL" : field === "uh" ? "UH" : field === "t1" ? "T1" : field === "t2" ? "T2" : field === "t3" ? "T3" : field.toUpperCase();
    await context.prisma.gradeComponentSubmission.upsert({
      where: { teachingAssignmentId_componentKey: { teachingAssignmentId: assignmentId, componentKey } },
      create: { schoolId, teachingAssignmentId: assignmentId, componentKey, kind, field: column as "UH", status: "SUBMITTED" },
      update: { status: "SUBMITTED" },
    });
  }
}

async function readSheet(context: TestContext, url: string, accessToken: string): Promise<Sheet> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<Sheet>(response);
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
