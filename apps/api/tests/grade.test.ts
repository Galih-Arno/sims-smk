import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, GradeSheetDto, LoginResponse } from "@sims/shared";
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

async function tokenFor(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}

describe("Input nilai guru mapel", { concurrency: 1 }, () => {
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

  it("menyimpan nilai formatif, sumatif, dan STS tanpa menghapus nilai lain", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Nilai", npsn: "20124001" });
    const other = await createSchool(context.prisma, { name: "SMK Nilai Lain", npsn: "20124002" });
    const guru = await createUser(context.prisma, { email: "guru.nilai@sekolah.test", name: "Guru Nilai", password: PASSWORD });
    const otherGuru = await createUser(context.prisma, { email: "guru.lain@sekolah.test", name: "Guru Lain", password: PASSWORD });
    const admin = await createUser(context.prisma, { email: "admin.nilai@sekolah.test", name: "Admin Nilai", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.nilai.lain@sekolah.test", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherGuru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });

    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), isActive: true },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "2026/2027 Ganjil",
        semesterKind: "GANJIL",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
      },
    });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const classRow = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 },
    });
    const otherClass = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 },
    });
    const teacher = await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Guru Nilai", gender: "LAKI_LAKI", userId: guru.id },
    });
    await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Guru Lain", gender: "PEREMPUAN", userId: otherGuru.id },
    });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: teacher.id, subjectId: subject.id, classId: classRow.id, academicPeriodId: period.id },
    });
    const student = await context.prisma.student.create({
      data: { schoolId: school.id, nisn: "1234567890", name: "Siswa Satu", gender: "PEREMPUAN", classId: classRow.id },
    });
    const outsider = await context.prisma.student.create({
      data: { schoolId: school.id, nisn: "1234567891", name: "Siswa Luar", gender: "LAKI_LAKI", classId: otherClass.id },
    });
    const inactive = await context.prisma.student.create({
      data: { schoolId: school.id, nisn: "1234567892", name: "Siswa Nonaktif", gender: "LAKI_LAKI", classId: classRow.id, isActive: false },
    });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, code: "TP1", description: "Memahami konsep", sequence: 1 },
    });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, code: "LM1", description: "Aljabar", sequence: 1 },
    });

    const guruToken = await tokenFor(context, guru.email);
    const otherToken = await tokenFor(context, otherGuru.email);
    const adminToken = await tokenFor(context, admin.email);
    const neighborToken = await tokenFor(context, neighbor.email);
    const url = `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/scores`;

    const deniedTeacher = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(otherToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 10 }] },
    });
    assert.equal(deniedTeacher.statusCode, 403);

    const deniedSchool = await context.app.inject({
      method: "GET",
      url,
      headers: authHeader(neighborToken),
    });
    assert.equal(deniedSchool.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(deniedSchool).error.code, "TENANT_FORBIDDEN");

    const adminWrite = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(adminToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 10 }] },
    });
    assert.equal(adminWrite.statusCode, 403);

    const invalid = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 80.555 }] },
    });
    assert.equal(invalid.statusCode, 400);

    const negative = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: -1 }] },
    });
    assert.equal(negative.statusCode, 400);

    const wrongClass = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: outsider.id, uh: 70 }] },
    });
    assert.equal(wrongClass.statusCode, 400);

    const inactiveWrite = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: inactive.id, uh: 70 }] },
    });
    assert.equal(inactiveWrite.statusCode, 400);

    const first = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: {
        formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 80, t1: 0 }],
        summative: [{ materialScopeId: scope.id, studentId: student.id, score: 88 }],
        termExams: [{ studentId: student.id, sts: 75 }],
      },
    });
    assert.equal(first.statusCode, 200, first.body);
    const firstSheet = jsonBody<{ sheet: GradeSheetDto }>(first).sheet;
    const formativeCell = firstSheet.formative[0]?.cells[0];
    assert.equal(formativeCell?.uh, 80);
    assert.equal(formativeCell?.t1, 0);
    assert.equal(formativeCell?.t2, null);
    assert.equal(formativeCell?.t3, null);
    assert.equal(formativeCell?.remedial, null);
    assert.equal(formativeCell?.status, "DRAFT");
    assert.equal(firstSheet.summative[0]?.cells[0]?.score, 88);
    assert.equal(firstSheet.termExams[0]?.sts, 75);
    assert.equal(firstSheet.termExams[0]?.sas, null);

    const second = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, t2: 90 }] },
    });
    assert.equal(second.statusCode, 200, second.body);
    const kept = jsonBody<{ sheet: GradeSheetDto }>(second).sheet.formative[0]?.cells[0];
    assert.equal(kept?.uh, 80);
    assert.equal(kept?.t1, 0);
    assert.equal(kept?.t2, 90);

    const cleared = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: null }] },
    });
    const afterClear = jsonBody<{ sheet: GradeSheetDto }>(cleared).sheet.formative[0]?.cells[0];
    assert.equal(afterClear?.uh, null);
    assert.equal(afterClear?.t1, 0);
    assert.equal(afterClear?.t2, 90);

    await context.prisma.school.update({ where: { id: school.id }, data: { sasEnabled: false } });
    const sasDenied = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { termExams: [{ studentId: student.id, sas: 60 }] },
    });
    assert.equal(sasDenied.statusCode, 400);
    const stsKept = await context.prisma.termExamScore.findFirst({ where: { teachingAssignmentId: assignment.id, studentId: student.id } });
    assert.equal(stsKept?.sts?.toNumber(), 75);
    assert.equal(stsKept?.sas, null);

    const adminRead = await context.app.inject({ method: "GET", url, headers: authHeader(adminToken) });
    assert.equal(adminRead.statusCode, 200);
    assert.equal(jsonBody<{ sheet: GradeSheetDto }>(adminRead).sheet.sasEnabled, false);

    const audits = await context.prisma.auditLog.findMany({ where: { schoolId: school.id, action: "GRADE_UPDATED" }, orderBy: { createdAt: "asc" } });
    const uhCreated = audits.find((item) => (item.metadata as { component?: string; next?: number | null })?.component === "uh" && (item.metadata as { next?: number | null }).next === 80);
    const uhCleared = audits.find((item) => (item.metadata as { component?: string; previous?: number | null; next?: number | null })?.component === "uh" && (item.metadata as { next?: number | null }).next === null);
    const t2 = audits.find((item) => (item.metadata as { component?: string })?.component === "t2");
    assert.ok(uhCreated);
    assert.equal((uhCreated?.metadata as { previous?: number | null }).previous, null);
    assert.ok(uhCleared);
    assert.equal((uhCleared?.metadata as { previous?: number | null }).previous, 80);
    assert.equal((t2?.metadata as { previous?: number | null; next?: number | null }).previous, null);
    assert.equal((t2?.metadata as { next?: number | null }).next, 90);
    assert.equal(audits.filter((item) => (item.metadata as { component?: string }).component === "uh" && (item.metadata as { next?: number | null }).next === 80).length, 1);
  });
});
