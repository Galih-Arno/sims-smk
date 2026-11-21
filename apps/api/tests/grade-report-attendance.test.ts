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

type Attendance = {
  dataStatus: string;
  completeness: string;
  sakit: number | null;
  izin: number | null;
  alpa: number | null;
  finalDays: number;
  verifiedFrom: string | null;
  verifiedTo: string | null;
};
type PrepBody = {
  prep: {
    summary: { siap: number };
    attendance: { completeness: string; finalDays: number; verifiedFrom: string | null; verifiedTo: string | null };
    students: Array<{ name: string; status: string; subjects: Array<{ gradeStatus: string; score: number | null }>; attendance: Attendance }>;
  } | null;
};

describe("Absensi harian pada persiapan rapor", { concurrency: 1 }, () => {
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

  it("memakai hari final unik dan tidak menyatakan rapor siap tanpa kelengkapan absensi", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Absensi Rapor", npsn: "10600051" });
    const other = await createSchool(context.prisma, { name: "SMK Absensi Rapor Lain", npsn: "10600052" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KUMER", name: "KUMER1" } });
    const subjectRow = await context.prisma.subject.create({ data: { schoolId: school.id, code: "TKJ001", name: "KJD" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const guruUser = await createUser(context.prisma, { email: "guru.rapor.absensi@uji.local", name: "TOJI", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.rapor.absensi@uji.local", name: "Wali Absensi Rapor", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.rapor.absensi@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "TOJI", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Absensi Rapor", gender: "PEREMPUAN" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subjectRow.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    const otherTeacher = await context.prisma.teacher.create({ data: { schoolId: school.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const otherHomeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherTeacher.id, classId: otherClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: subjectRow.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const first = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060005101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    const second = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060005102", nis: "02", name: "Siswa Dua", gender: "PEREMPUAN" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: first.id, uh: 80 } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: second.id, uh: 80 } });
    await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: first.id, score: 70 } });
    await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: second.id, score: 70 } });
    await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId: first.id, sts: 90, sas: 100 } });
    await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId: second.id, sts: 90, sas: 100 } });
    await context.prisma.gradeReportPolicy.create({
      data: {
        schoolId: school.id, academicYearId: year.id, academicPeriodId: period.id, curriculumId: curriculum.id, status: "ACTIVE",
        useFormative: true, useSummative: true, useSts: true, useSas: true, formativeMode: "COMBINED",
        weightFormative: 30, weightSummative: 30, weightSts: 20, weightSas: 20,
        remedialPolicy: "HIGHEST", emptyTreatment: "INCOMPLETE", roundingMode: "INTEGER",
      },
    });
    for (const row of [
      { componentKey: `f:uh:${objective.id}`, kind: "FORMATIVE" as const, field: "UH" as const },
      { componentKey: `s:${scope.id}`, kind: "SUMMATIVE" as const, field: "SCORE" as const },
      { componentKey: "sts", kind: "STS" as const, field: "STS" as const },
      { componentKey: "sas", kind: "SAS" as const, field: "SAS" as const },
    ]) {
      await context.prisma.gradeComponentSubmission.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, ...row, status: "SUBMITTED" } });
    }
    await context.prisma.attendanceMeeting.create({
      data: {
        schoolId: school.id, teachingAssignmentId: assignment.id, meetingDate: new Date("2026-11-19T00:00:00.000Z"), sessionNo: 1, status: "FINAL", createdById: guruUser.id, marker: "QC-05E",
        records: { create: [{ schoolId: school.id, studentId: first.id, status: "ALPA" }, { schoolId: school.id, studentId: second.id, status: "ALPA" }] },
      },
    });
    await context.prisma.attendanceMeeting.create({
      data: {
        schoolId: school.id, teachingAssignmentId: assignment.id, meetingDate: new Date("2026-11-19T00:00:00.000Z"), sessionNo: 2, status: "FINAL", createdById: guruUser.id, marker: "QC-05E",
        records: { create: [{ schoolId: school.id, studentId: first.id, status: "ALPA" }, { schoolId: school.id, studentId: second.id, status: "ALPA" }] },
      },
    });

    const waliToken = await token(context, waliUser.email);
    const url = `/api/v1/schools/${school.id}/homeroom-report-prep`;
    const empty = await readPrep(context, url, waliToken);
    assert.equal(empty.prep?.students[0]?.subjects[0]?.score, 83);
    assert.equal(empty.prep?.students[0]?.status, "BELUM_LENGKAP");
    assert.equal(empty.prep?.summary.siap, 0);
    assert.equal(empty.prep?.attendance.completeness, "BELUM_DIKONFIGURASI");
    assert.equal(empty.prep?.attendance.finalDays, 0);
    assert.equal(student(empty, "Siswa Satu").dataStatus, "BELUM_ADA_DATA");
    assert.equal(student(empty, "Siswa Satu").sakit, null);
    assert.equal(student(empty, "Siswa Satu").alpa, null);

    await daily(context, school.id, homeroom.id, waliUser.id, "2026-11-18", "DRAFT", [[first.id, "SAKIT"], [second.id, "SAKIT"]]);
    const draft = await readPrep(context, url, waliToken);
    assert.equal(student(draft, "Siswa Satu").dataStatus, "BELUM_ADA_DATA");
    assert.equal(student(draft, "Siswa Satu").sakit, null);
    assert.equal(draft.prep?.attendance.finalDays, 0);

    await daily(context, school.id, homeroom.id, waliUser.id, "2026-11-19", "FINAL", [[first.id, "ALPA"], [second.id, "HADIR"]]);
    await daily(context, school.id, homeroom.id, waliUser.id, "2026-11-20", "FINAL", [[first.id, "SAKIT"], [second.id, "IZIN"]]);
    await daily(context, school.id, otherHomeroom.id, waliUser.id, "2026-11-19", "FINAL", []);
    const counted = await readPrep(context, url, waliToken);
    assert.equal(counted.prep?.attendance.finalDays, 2);
    assert.equal(counted.prep?.attendance.verifiedFrom, "2026-11-19");
    assert.equal(counted.prep?.attendance.verifiedTo, "2026-11-20");
    assert.equal(counted.prep?.attendance.completeness, "BELUM_DIKONFIGURASI");
    assert.equal(student(counted, "Siswa Satu").sakit, 1);
    assert.equal(student(counted, "Siswa Satu").izin, 0);
    assert.equal(student(counted, "Siswa Satu").alpa, 1);
    assert.equal(student(counted, "Siswa Dua").sakit, 0);
    assert.equal(student(counted, "Siswa Dua").izin, 1);
    assert.equal(student(counted, "Siswa Dua").alpa, 0);
    assert.equal(counted.prep?.students.every((item) => item.status !== "SIAP"), true);
    assert.equal(counted.prep?.summary.siap, 0);
    assert.equal(counted.prep?.students[0]?.subjects[0]?.score, 83);

    const guruRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, guruUser.email)) });
    assert.equal(guruRead.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");
    assert.equal(await context.prisma.dailyAttendance.count({ where: { homeroomAssignmentId: homeroom.id, status: "FINAL" } }), 2);
    assert.equal(await context.prisma.attendanceMeeting.count({ where: { teachingAssignmentId: assignment.id, status: "FINAL" } }), 2);
    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { studentId: first.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
  });
});

function student(body: PrepBody, name: string): Attendance {
  const found = body.prep?.students.find((item) => item.name === name)?.attendance;
  assert.ok(found, name);
  return found;
}

async function daily(
  context: TestContext,
  schoolId: string,
  homeroomId: string,
  createdById: string,
  attendanceDate: string,
  status: "DRAFT" | "FINAL",
  records: Array<[string, "HADIR" | "SAKIT" | "IZIN" | "ALPA"]>,
) {
  await context.prisma.dailyAttendance.create({
    data: {
      schoolId,
      homeroomAssignmentId: homeroomId,
      attendanceDate: new Date(`${attendanceDate}T00:00:00.000Z`),
      status,
      createdById,
      records: { create: records.map(([studentId, mark]) => ({ schoolId, studentId, status: mark })) },
    },
  });
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
