import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, LoginResponse } from "@sims/shared";
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

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA";
type StudentRow = {
  name: string;
  status: Mark | null;
  note: string | null;
  reference: { dataStatus: string; conflict: boolean; sessions: Array<{ subjectName: string; sessionNo: number; status: Mark }> };
};
type RecapRow = { name: string; dataStatus: string; sakit: number | null; izin: number | null; alpa: number | null };
type Sheet = {
  className: string;
  dayStatus: string | null;
  canEdit: boolean;
  canCorrect: boolean;
  finalDays: number;
  students: StudentRow[];
  recap: RecapRow[];
};
type Body = { homerooms: Array<{ id: string; className: string }>; sheet: Sheet | null };

describe("Absensi harian wali kelas", { concurrency: 1 }, () => {
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

  it("menetapkan satu hari secara manual tanpa menjumlahkan sesi mapel atau mengubah absensi mapel", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Harian", npsn: "10600041" });
    const other = await createSchool(context.prisma, { name: "SMK Harian Lain", npsn: "10600042" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const inactive = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Genap", semesterKind: "GENAP", startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z"), isActive: false },
    });
    const kjd = await context.prisma.subject.create({ data: { schoolId: school.id, code: "TKJ001", name: "KJD" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const tojiUser = await createUser(context.prisma, { email: "toji.harian@uji.local", name: "TOJI", password: PASSWORD });
    const guruUser = await createUser(context.prisma, { email: "guru.harian@uji.local", name: "Guru Lain", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.harian@uji.local", name: "Wali Harian", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.lain.harian@uji.local", name: "Wali Lain", password: PASSWORD });
    const wakakurUser = await createUser(context.prisma, { email: "wakakur.harian@uji.local", name: "Wakakur Harian", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.harian.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: tojiUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakurUser.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const toji = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: tojiUser.id, name: "TOJI", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Harian", gender: "PEREMPUAN" } });
    const otherWali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWaliUser.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: toji.id, subjectId: kjd.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: otherClass.id, academicPeriodId: inactive.id } });
    const otherHomeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWali.id, classId: otherClass.id, academicPeriodId: period.id } });
    const first = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060004101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    const second = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060004102", nis: "02", name: "Siswa Dua", gender: "PEREMPUAN" } });
    await meeting(context, school.id, assignment.id, tojiUser.id, "2026-11-19", 1, "FINAL", [[first.id, "ALPA"], [second.id, "ALPA"]]);
    await meeting(context, school.id, assignment.id, tojiUser.id, "2026-11-19", 2, "FINAL", [[first.id, "ALPA"], [second.id, "HADIR"]]);
    await meeting(context, school.id, assignment.id, tojiUser.id, "2026-11-19", 3, "DRAFT", [[first.id, "ALPA"], [second.id, "ALPA"]]);
    const before = await subjectSnapshot(context, school.id);

    const waliToken = await token(context, waliUser.email);
    const url = `/api/v1/schools/${school.id}/daily-attendance`;
    const opened = await readSheet(context, `${url}?date=2026-11-19`, waliToken);
    assert.deepEqual(opened.homerooms.map((item) => item.id), [homeroom.id]);
    assert.equal(opened.sheet?.className, "X TKJ 1");
    assert.equal(opened.sheet?.dayStatus, null);
    const satu = student(opened, "Siswa Satu");
    assert.equal(satu.status, null);
    assert.equal(satu.reference.dataStatus, "TERSEDIA");
    assert.equal(satu.reference.conflict, false);
    assert.deepEqual(satu.reference.sessions.map((item) => [item.sessionNo, item.status]), [[1, "ALPA"], [2, "ALPA"]]);
    const dua = student(opened, "Siswa Dua");
    assert.equal(dua.status, null);
    assert.equal(dua.reference.conflict, true);
    assert.equal(recap(opened, "Siswa Satu").dataStatus, "BELUM_ADA_DATA");
    assert.equal(recap(opened, "Siswa Satu").alpa, null);

    const outside = await context.app.inject({
      method: "PUT",
      url,
      headers: authHeader(waliToken),
      payload: { homeroomId: homeroom.id, attendanceDate: "2026-06-01", records: [] },
    });
    assert.equal(outside.statusCode, 400);

    const draft = await send(context, "PUT", url, waliToken, {
      homeroomId: homeroom.id,
      attendanceDate: "2026-11-19",
      records: [
        { studentId: first.id, status: "ALPA", note: "Dua sesi mapel, satu hari" },
        { studentId: second.id, status: null, note: null },
      ],
    });
    assert.equal(draft.sheet?.dayStatus, "DRAFT");
    assert.equal(student(draft, "Siswa Satu").status, "ALPA");
    assert.equal(student(draft, "Siswa Dua").status, null);
    assert.equal(recap(draft, "Siswa Satu").dataStatus, "BELUM_ADA_DATA");
    assert.equal(recap(draft, "Siswa Satu").alpa, null);

    const incomplete = await context.app.inject({
      method: "POST",
      url: `${url}/finalize`,
      headers: authHeader(waliToken),
      payload: {
        homeroomId: homeroom.id,
        attendanceDate: "2026-11-19",
        records: [{ studentId: second.id, status: null, note: null }],
      },
    });
    assert.equal(incomplete.statusCode, 409);
    assert.equal(await context.prisma.dailyAttendance.count({ where: { homeroomAssignmentId: homeroom.id, status: "DRAFT" } }), 1);

    const finalDay = await send(context, "POST", `${url}/finalize`, waliToken, {
      homeroomId: homeroom.id,
      attendanceDate: "2026-11-19",
      records: [
        { studentId: first.id, status: "ALPA", note: "Dua sesi mapel, satu hari" },
        { studentId: second.id, status: "HADIR", note: "Mapel campuran, tetap hadir" },
      ],
    });
    assert.equal(finalDay.sheet?.dayStatus, "FINAL");
    assert.equal(finalDay.sheet?.canEdit, false);
    assert.equal(finalDay.sheet?.finalDays, 1);
    assert.equal(recap(finalDay, "Siswa Satu").alpa, 1);
    assert.equal(recap(finalDay, "Siswa Satu").sakit, 0);
    assert.equal(recap(finalDay, "Siswa Dua").alpa, 0);
    assert.equal(recap(finalDay, "Siswa Dua").dataStatus, "TERSEDIA");

    const laterDraft = await send(context, "PUT", url, waliToken, {
      homeroomId: homeroom.id,
      attendanceDate: "2026-11-20",
      records: [
        { studentId: first.id, status: "SAKIT", note: null },
        { studentId: second.id, status: "SAKIT", note: null },
      ],
    });
    assert.equal(recap(laterDraft, "Siswa Satu").sakit, 0);
    assert.equal(recap(laterDraft, "Siswa Satu").alpa, 1);

    const locked = await context.app.inject({
      method: "PUT",
      url,
      headers: authHeader(waliToken),
      payload: { homeroomId: homeroom.id, attendanceDate: "2026-11-19", records: [{ studentId: first.id, status: "HADIR", note: null }] },
    });
    assert.equal(locked.statusCode, 409);
    const waliCorrect = await context.app.inject({
      method: "POST",
      url: `${url}/correct`,
      headers: authHeader(waliToken),
      payload: { homeroomId: homeroom.id, attendanceDate: "2026-11-19", reason: "Bukan wali yang mengoreksi", records: [] },
    });
    assert.equal(waliCorrect.statusCode, 403);
    const shortReason = await context.app.inject({
      method: "POST",
      url: `${url}/correct`,
      headers: authHeader(await token(context, wakakurUser.email)),
      payload: { homeroomId: homeroom.id, attendanceDate: "2026-11-19", reason: "no", records: [{ studentId: first.id, status: "SAKIT", note: null }] },
    });
    assert.equal(shortReason.statusCode, 400);
    const corrected = await send(context, "POST", `${url}/correct`, await token(context, wakakurUser.email), {
      homeroomId: homeroom.id,
      attendanceDate: "2026-11-19",
      reason: "Sakit dengan surat",
      records: [{ studentId: first.id, status: "SAKIT", note: "Surat diterima" }],
    });
    assert.equal(corrected.sheet?.dayStatus, "FINAL");
    assert.equal(recap(corrected, "Siswa Satu").sakit, 1);
    assert.equal(recap(corrected, "Siswa Satu").alpa, 0);

    const guruRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, guruUser.email)) });
    assert.equal(guruRead.statusCode, 403);
    const guruWrite = await context.app.inject({
      method: "PUT",
      url,
      headers: authHeader(await token(context, guruUser.email)),
      payload: { homeroomId: homeroom.id, attendanceDate: "2026-11-19", records: [] },
    });
    assert.equal(guruWrite.statusCode, 403);
    const otherRead = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, otherWaliUser.email)) });
    assert.equal(otherRead.statusCode, 403);
    const hidden = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${otherHomeroom.id}`, headers: authHeader(waliToken) });
    assert.equal(hidden.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    assert.deepEqual(await subjectSnapshot(context, school.id), before);
    assert.equal(await context.prisma.dailyAttendance.count({ where: { homeroomAssignmentId: homeroom.id, attendanceDate: new Date("2026-11-19T00:00:00.000Z"), status: "FINAL" } }), 1);
    assert.equal(await context.prisma.dailyAttendanceCorrection.count({ where: { schoolId: school.id } }), 1);
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id } }), 0);
    const audit = await context.prisma.auditLog.findFirst({ where: { schoolId: school.id, action: "DAILY_ATTENDANCE_CORRECTED" } });
    assert.equal((audit?.metadata as { reason?: string } | null)?.reason, "Sakit dengan surat");
  });
});

function student(body: Body, name: string): StudentRow {
  const found = body.sheet?.students.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function recap(body: Body, name: string): RecapRow {
  const found = body.sheet?.recap.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

async function meeting(
  context: TestContext,
  schoolId: string,
  assignmentId: string,
  createdById: string,
  meetingDate: string,
  sessionNo: number,
  status: "DRAFT" | "FINAL",
  records: Array<[string, Mark]>,
) {
  return context.prisma.attendanceMeeting.create({
    data: {
      schoolId,
      teachingAssignmentId: assignmentId,
      meetingDate: new Date(`${meetingDate}T00:00:00.000Z`),
      sessionNo,
      status,
      marker: "QC-05D2",
      createdById,
      records: { create: records.map(([studentId, mark]) => ({ schoolId, studentId, status: mark })) },
    },
  });
}

async function subjectSnapshot(context: TestContext, schoolId: string) {
  const meetings = await context.prisma.attendanceMeeting.findMany({
    where: { schoolId },
    select: { id: true, status: true, sessionNo: true },
    orderBy: { sessionNo: "asc" },
  });
  const records = await context.prisma.attendanceRecord.findMany({
    where: { schoolId },
    select: { meetingId: true, studentId: true, status: true },
    orderBy: [{ meetingId: "asc" }, { studentId: "asc" }],
  });
  return { meetings, records };
}

async function readSheet(context: TestContext, url: string, accessToken: string): Promise<Body> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<Body>(response);
}

async function send(context: TestContext, method: "POST" | "PUT", url: string, accessToken: string, payload: object): Promise<Body> {
  const response = await context.app.inject({ method, url, headers: authHeader(accessToken), payload });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<Body>(response);
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
