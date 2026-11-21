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
  unverifiedDays: number | null;
};
type PrepBody = {
  prep: {
    summary: { siap: number };
    attendance: {
      completeness: string;
      finalDays: number;
      requiredDays: number | null;
      finalRequiredDays: number;
      openRequiredDays: number | null;
    };
    students: Array<{ name: string; status: string; subjects: Array<{ score: number | null }>; attendance: Attendance }>;
  } | null;
};
type CalendarBody = {
  period: { name: string } | null;
  rule: { status: string; requiredDays: number; holidayDays: number; exemptDays: number; days: Array<{ date: string; kind: string }> } | null;
};

describe("Kelengkapan absensi semester", { concurrency: 1 }, () => {
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

  it("mengaktifkan hari wajib sekolah dan menahan rapor sampai absensi final lengkap", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Kelengkapan Absensi", npsn: "10600061" });
    const other = await createSchool(context.prisma, { name: "SMK Kelengkapan Lain", npsn: "10600062" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const otherPeriod = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Genap", semesterKind: "GENAP", startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z"), isActive: false },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KUMER", name: "KUMER1" } });
    const subjectRow = await context.prisma.subject.create({ data: { schoolId: school.id, code: "TKJ001", name: "KJD" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const guruUser = await createUser(context.prisma, { email: "guru.kelengkapan@uji.local", name: "Guru Mapel", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.kelengkapan@uji.local", name: "Wali Kelengkapan", password: PASSWORD });
    const wakakurUser = await createUser(context.prisma, { email: "wakakur.kelengkapan@uji.local", name: "Wakakur Kelengkapan", password: PASSWORD });
    const adminUser = await createUser(context.prisma, { email: "admin.kelengkapan@uji.local", name: "Admin Kelengkapan", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.kelengkapan.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakurUser.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: adminUser.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Mapel", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Kelengkapan", gender: "PEREMPUAN" } });
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
    const first = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060006101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    const second = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060006102", nis: "02", name: "Siswa Dua", gender: "PEREMPUAN" } });
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
    await context.prisma.attendanceCompletenessRule.create({
      data: {
        schoolId: school.id, academicPeriodId: otherPeriod.id, status: "ACTIVE",
        days: { create: [{ schoolId: school.id, date: new Date("2027-01-04T00:00:00.000Z"), kind: "PEMBELAJARAN" }] },
      },
    });

    const wakakurToken = await token(context, wakakurUser.email);
    const adminToken = await token(context, adminUser.email);
    const waliToken = await token(context, waliUser.email);
    const settings = `/api/v1/schools/${school.id}/attendance-completeness`;
    const prepUrl = `/api/v1/schools/${school.id}/homeroom-report-prep`;
    const calendar = [
      { date: "2026-11-19", kind: "PEMBELAJARAN", note: null },
      { date: "2026-11-20", kind: "LIBUR", note: "Libur sekolah" },
      { date: "2026-11-21", kind: "TIDAK_WAJIB", note: null },
    ];

    const empty = jsonBody<CalendarBody>(await send(context, "GET", settings, wakakurToken));
    assert.equal(empty.period?.name, "Ganjil");
    assert.equal(empty.rule, null);
    const early = await send(context, "POST", `${settings}/activate`, wakakurToken);
    assert.equal(early.statusCode, 400);

    const saved = jsonBody<CalendarBody>(await send(context, "PUT", settings, adminToken, { days: calendar }));
    assert.equal(saved.rule?.status, "DRAFT");
    assert.equal(saved.rule?.requiredDays, 1);
    assert.equal(saved.rule?.holidayDays, 1);
    assert.equal(saved.rule?.exemptDays, 1);
    const outside = await send(context, "PUT", settings, adminToken, { days: [{ date: "2026-06-01", kind: "PEMBELAJARAN", note: null }] });
    assert.equal(outside.statusCode, 400);
    const blocked = await send(context, "POST", `${settings}/activate`, adminToken);
    assert.equal(blocked.statusCode, 403);
    assert.equal(jsonBody<CalendarBody>(await send(context, "GET", settings, wakakurToken)).rule?.status, "DRAFT");

    await context.prisma.attendanceMeeting.create({
      data: {
        schoolId: school.id, teachingAssignmentId: assignment.id, meetingDate: new Date("2026-11-19T00:00:00.000Z"), sessionNo: 1, status: "FINAL", createdById: guruUser.id,
        records: { create: [{ schoolId: school.id, studentId: first.id, status: "ALPA" }, { schoolId: school.id, studentId: second.id, status: "ALPA" }] },
      },
    });
    await context.prisma.attendanceMeeting.create({
      data: {
        schoolId: school.id, teachingAssignmentId: assignment.id, meetingDate: new Date("2026-11-19T00:00:00.000Z"), sessionNo: 2, status: "FINAL", createdById: guruUser.id,
        records: { create: [{ schoolId: school.id, studentId: first.id, status: "ALPA" }, { schoolId: school.id, studentId: second.id, status: "ALPA" }] },
      },
    });
    await daily(context, school.id, homeroom.id, waliUser.id, "2026-11-18", "DRAFT", [[first.id, "SAKIT"], [second.id, "SAKIT"]]);
    const beforeRule = await readPrep(context, prepUrl, waliToken);
    assert.equal(beforeRule.prep?.attendance.completeness, "BELUM_DIKONFIGURASI");
    assert.equal(beforeRule.prep?.attendance.requiredDays, null);
    assert.equal(beforeRule.prep?.summary.siap, 0);
    assert.equal(student(beforeRule, "Siswa Satu").dataStatus, "BELUM_ADA_DATA");
    assert.equal(student(beforeRule, "Siswa Satu").sakit, null);

    const activated = jsonBody<CalendarBody>(await send(context, "POST", `${settings}/activate`, wakakurToken));
    assert.equal(activated.rule?.status, "ACTIVE");
    await daily(context, school.id, otherHomeroom.id, waliUser.id, "2026-11-19", "FINAL", [[first.id, "ALPA"]]);
    const missing = await readPrep(context, prepUrl, waliToken);
    assert.equal(missing.prep?.attendance.completeness, "BELUM_LENGKAP");
    assert.equal(missing.prep?.attendance.requiredDays, 1);
    assert.equal(missing.prep?.attendance.finalRequiredDays, 0);
    assert.equal(missing.prep?.attendance.openRequiredDays, 1);
    assert.equal(missing.prep?.summary.siap, 0);
    assert.equal(missing.prep?.students[0]?.subjects[0]?.score, 83);
    assert.equal(student(missing, "Siswa Satu").completeness, "BELUM_LENGKAP");
    assert.equal(student(missing, "Siswa Satu").unverifiedDays, 1);
    assert.equal(student(missing, "Siswa Satu").sakit, null);

    await daily(context, school.id, homeroom.id, waliUser.id, "2026-11-19", "FINAL", [[first.id, "ALPA"], [second.id, "HADIR"]]);
    await daily(context, school.id, homeroom.id, waliUser.id, "2026-11-22", "FINAL", [[first.id, "SAKIT"], [second.id, "HADIR"]]);
    const ready = await readPrep(context, prepUrl, waliToken);
    assert.equal(ready.prep?.attendance.requiredDays, 1);
    assert.equal(ready.prep?.attendance.finalRequiredDays, 1);
    assert.equal(ready.prep?.attendance.openRequiredDays, 0);
    assert.equal(ready.prep?.attendance.finalDays, 2);
    assert.equal(ready.prep?.attendance.completeness, "LENGKAP");
    assert.equal(ready.prep?.summary.siap, 2);
    assert.equal(student(ready, "Siswa Satu").completeness, "LENGKAP");
    assert.equal(student(ready, "Siswa Satu").unverifiedDays, 0);
    assert.equal(student(ready, "Siswa Satu").sakit, 1);
    assert.equal(student(ready, "Siswa Satu").izin, 0);
    assert.equal(student(ready, "Siswa Satu").alpa, 1);
    assert.equal(student(ready, "Siswa Satu").dataStatus, "TERSEDIA");
    assert.equal(student(ready, "Siswa Dua").sakit, 0);
    assert.equal(student(ready, "Siswa Dua").alpa, 0);
    assert.equal(ready.prep?.students.every((item) => item.status === "SIAP"), true);

    const dailyCount = await context.prisma.dailyAttendance.count({ where: { homeroomAssignmentId: homeroom.id } });
    const expanded = jsonBody<CalendarBody>(await send(context, "PUT", settings, wakakurToken, {
      days: [...calendar, { date: "2026-11-23", kind: "PEMBELAJARAN", note: null }],
    }));
    assert.equal(expanded.rule?.requiredDays, 2);
    const held = await readPrep(context, prepUrl, waliToken);
    assert.equal(held.prep?.attendance.completeness, "BELUM_LENGKAP");
    assert.equal(held.prep?.attendance.openRequiredDays, 1);
    assert.equal(held.prep?.summary.siap, 0);
    assert.equal(student(held, "Siswa Satu").unverifiedDays, 1);
    assert.equal(student(held, "Siswa Satu").sakit, 1);
    assert.equal(held.prep?.students[0]?.subjects[0]?.score, 83);
    assert.equal(await context.prisma.dailyAttendance.count({ where: { homeroomAssignmentId: homeroom.id } }), dailyCount);
    const adminEdit = await send(context, "PUT", settings, adminToken, { days: calendar });
    assert.equal(adminEdit.statusCode, 403);
    assert.equal(jsonBody<CalendarBody>(await send(context, "GET", settings, adminToken)).rule?.requiredDays, 2);

    await daily(context, school.id, homeroom.id, waliUser.id, "2026-11-23", "FINAL", [[first.id, "HADIR"], [second.id, "HADIR"]]);
    const closed = await readPrep(context, prepUrl, waliToken);
    assert.equal(closed.prep?.attendance.completeness, "LENGKAP");
    assert.equal(closed.prep?.attendance.openRequiredDays, 0);
    assert.equal(closed.prep?.summary.siap, 2);
    assert.equal(student(closed, "Siswa Dua").izin, 0);

    const waliWrite = await send(context, "PUT", settings, waliToken, { days: calendar });
    assert.equal(waliWrite.statusCode, 403);
    const guruRead = await send(context, "GET", settings, await token(context, guruUser.email));
    assert.equal(guruRead.statusCode, 403);
    const neighborRead = await send(context, "GET", settings, await token(context, neighbor.email));
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const audits = await context.prisma.auditLog.findMany({
      where: { schoolId: school.id, action: { in: ["ATTENDANCE_COMPLETENESS_ACTIVATED", "ATTENDANCE_COMPLETENESS_UPDATED"] } },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(audits.map((item) => item.action), ["ATTENDANCE_COMPLETENESS_ACTIVATED", "ATTENDANCE_COMPLETENESS_UPDATED"]);
    const updated = audits[1]?.metadata as { previousRequiredDates?: string[]; nextRequiredDates?: string[]; affectsReport?: boolean };
    assert.deepEqual(updated.previousRequiredDates, ["2026-11-19"]);
    assert.deepEqual(updated.nextRequiredDates, ["2026-11-19", "2026-11-23"]);
    assert.equal(updated.affectsReport, true);
    assert.equal(await context.prisma.gradeFinalResult.count({ where: { schoolId: school.id } }), 0);
    assert.equal(await context.prisma.attendanceMeeting.count({ where: { teachingAssignmentId: assignment.id, status: "FINAL" } }), 2);
    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { studentId: first.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
  });
});

function student(body: PrepBody, name: string): Attendance & { status?: string } {
  const found = body.prep?.students.find((item) => item.name === name);
  assert.ok(found, name);
  return { ...found.attendance, status: found.status };
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
  const response = await send(context, "GET", url, accessToken);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<PrepBody>(response);
}

async function send(context: TestContext, method: "GET" | "POST" | "PUT", url: string, accessToken: string, payload?: object) {
  return context.app.inject({ method, url, headers: authHeader(accessToken), payload });
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
