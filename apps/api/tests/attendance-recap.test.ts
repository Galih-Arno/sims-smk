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
type SubjectLine = {
  name: string;
  teacherName: string;
  dataStatus: string;
  hadir: number | null;
  sakit: number | null;
  izin: number | null;
  alpa: number | null;
  sessions: Array<{ meetingDate: string; sessionNo: number; teacherName: string; status: Mark }>;
};
type RecapBody = {
  homerooms: Array<{ id: string; className: string }>;
  recap: {
    className: string;
    subjects: Array<{ name: string; teacherName: string; finalMeetings: number; dataStatus: string }>;
    students: Array<{ name: string; subjects: SubjectLine[] }>;
  } | null;
};

describe("Rekap absensi mata pelajaran wali kelas", { concurrency: 1 }, () => {
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

  it("menghitung sesi final per mapel tanpa mengubah absensi atau menghitung draf", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Absensi", npsn: "10600031" });
    const other = await createSchool(context.prisma, { name: "SMK Absensi Lain", npsn: "10600032" });
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
    const bahasa = await context.prisma.subject.create({ data: { schoolId: school.id, code: "BIN", name: "Bahasa Indonesia" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const inactiveClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 3", gradeLevel: 10 } });
    const tojiUser = await createUser(context.prisma, { email: "toji.absensi@uji.local", name: "TOJI", password: PASSWORD });
    const otherGuruUser = await createUser(context.prisma, { email: "guru.absensi@uji.local", name: "Guru Lain", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.absensi@uji.local", name: "Wali Absensi", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.lain.absensi@uji.local", name: "Wali Lain", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.absensi.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: tojiUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherGuruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const toji = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: tojiUser.id, name: "TOJI", gender: "LAKI_LAKI" } });
    const otherGuru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherGuruUser.id, name: "Guru Lain", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Absensi", gender: "PEREMPUAN" } });
    const otherWali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWaliUser.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: toji.id, subjectId: kjd.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: otherGuru.id, subjectId: bahasa.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const otherAssignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: toji.id, subjectId: kjd.id, classId: otherClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: inactiveClass.id, academicPeriodId: inactive.id } });
    const otherHomeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWali.id, classId: otherClass.id, academicPeriodId: period.id } });
    const first = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060003101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    const second = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060003102", nis: "02", name: "Siswa Dua", gender: "PEREMPUAN" } });
    const outsider = await context.prisma.student.create({ data: { schoolId: school.id, classId: otherClass.id, nisn: "1060003103", nis: "03", name: "Siswa Lain", gender: "LAKI_LAKI" } });

    const draft = await meeting(context, school.id, assignment.id, tojiUser.id, "2026-11-19", 1, "DRAFT", [
      [first.id, "ALPA"],
      [second.id, "ALPA"],
    ]);
    await meeting(context, school.id, assignment.id, tojiUser.id, "2026-11-19", 2, "FINAL", [
      [first.id, "HADIR"],
      [second.id, "SAKIT"],
    ]);
    await meeting(context, school.id, assignment.id, tojiUser.id, "2026-11-19", 3, "FINAL", [
      [first.id, "IZIN"],
      [second.id, null],
    ]);
    await meeting(context, school.id, assignment.id, tojiUser.id, "2026-11-20", 1, "FINAL", [
      [first.id, "ALPA"],
      [second.id, "HADIR"],
    ]);
    await meeting(context, school.id, otherAssignment.id, tojiUser.id, "2026-11-19", 1, "FINAL", [[outsider.id, "ALPA"]]);
    const before = await snapshot(context, school.id);

    const waliToken = await token(context, waliUser.email);
    const url = `/api/v1/schools/${school.id}/homeroom-attendance-recap`;
    const body = await readRecap(context, url, waliToken);
    assert.deepEqual(body.homerooms.map((item) => item.id), [homeroom.id]);
    assert.equal(body.recap?.className, "X TKJ 1");
    assert.equal(subjectInfo(body, "KJD").teacherName, "TOJI");
    assert.equal(subjectInfo(body, "KJD").finalMeetings, 3);
    assert.equal(subjectInfo(body, "KJD").dataStatus, "TERSEDIA");
    assert.equal(subjectInfo(body, "Bahasa Indonesia").teacherName, "Guru Lain");
    assert.equal(subjectInfo(body, "Bahasa Indonesia").finalMeetings, 0);
    assert.equal(subjectInfo(body, "Bahasa Indonesia").dataStatus, "BELUM_ADA_DATA");

    const satu = line(body, "Siswa Satu", "KJD");
    assert.equal(satu.hadir, 1);
    assert.equal(satu.sakit, 0);
    assert.equal(satu.izin, 1);
    assert.equal(satu.alpa, 1);
    assert.deepEqual(satu.sessions.map((item) => [item.meetingDate, item.sessionNo, item.status]), [
      ["2026-11-19", 2, "HADIR"],
      ["2026-11-19", 3, "IZIN"],
      ["2026-11-20", 1, "ALPA"],
    ]);
    const dua = line(body, "Siswa Dua", "KJD");
    assert.equal(dua.hadir, 1);
    assert.equal(dua.sakit, 1);
    assert.equal(dua.alpa, 0);
    assert.equal(dua.sessions.length, 2);
    assert.equal(line(body, "Siswa Satu", "Bahasa Indonesia").dataStatus, "BELUM_ADA_DATA");
    assert.equal(line(body, "Siswa Satu", "Bahasa Indonesia").alpa, null);
    assert.equal(body.recap?.students.some((item) => item.name === "Siswa Lain"), false);

    const sameDay = await readRecap(context, `${url}?from=2026-11-19&to=2026-11-19`, waliToken);
    assert.equal(subjectInfo(sameDay, "KJD").finalMeetings, 2);
    assert.deepEqual(line(sameDay, "Siswa Satu", "KJD").sessions.map((item) => item.sessionNo), [2, 3]);
    assert.equal(line(sameDay, "Siswa Satu", "KJD").alpa, 0);
    const emptyRange = await readRecap(context, `${url}?from=2026-12-01`, waliToken);
    assert.equal(subjectInfo(emptyRange, "KJD").dataStatus, "BELUM_ADA_DATA");
    assert.equal(line(emptyRange, "Siswa Satu", "KJD").hadir, null);
    assert.equal(line(emptyRange, "Siswa Satu", "KJD").alpa, null);

    const guruRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, otherGuruUser.email)) });
    assert.equal(guruRead.statusCode, 403);
    const otherRead = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, otherWaliUser.email)) });
    assert.equal(otherRead.statusCode, 403);
    const hidden = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${otherHomeroom.id}`, headers: authHeader(waliToken) });
    assert.equal(hidden.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");
    const edit = await context.app.inject({
      method: "PUT",
      url: `/api/v1/schools/${school.id}/attendance/meetings/${draft.id}`,
      headers: authHeader(waliToken),
      payload: { records: [{ studentId: first.id, status: "HADIR" }] },
    });
    assert.equal(edit.statusCode, 403);

    assert.deepEqual(await snapshot(context, school.id), before);
    assert.equal(await context.prisma.attendanceMeeting.count({ where: { id: draft.id, status: "DRAFT" } }), 1);
    assert.equal(await context.prisma.attendanceCorrection.count({ where: { schoolId: school.id } }), 0);
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id } }), 0);
  });
});

function subjectInfo(body: RecapBody, name: string) {
  const found = body.recap?.subjects.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function line(body: RecapBody, studentName: string, subjectName: string): SubjectLine {
  const student = body.recap?.students.find((item) => item.name === studentName);
  const found = student?.subjects.find((item) => item.name === subjectName);
  assert.ok(found, `${studentName} ${subjectName}`);
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
  records: Array<[string, Mark | null]>,
) {
  return context.prisma.attendanceMeeting.create({
    data: {
      schoolId,
      teachingAssignmentId: assignmentId,
      meetingDate: new Date(`${meetingDate}T00:00:00.000Z`),
      sessionNo,
      status,
      marker: "QC-05D",
      createdById,
      finalizedAt: status === "FINAL" ? new Date("2026-11-20T00:00:00.000Z") : null,
      records: { create: records.map(([studentId, mark]) => ({ schoolId, studentId, status: mark })) },
    },
  });
}

async function snapshot(context: TestContext, schoolId: string) {
  const meetings = await context.prisma.attendanceMeeting.findMany({
    where: { schoolId },
    select: { id: true, status: true, sessionNo: true },
    orderBy: { id: "asc" },
  });
  const records = await context.prisma.attendanceRecord.findMany({
    where: { schoolId },
    select: { meetingId: true, studentId: true, status: true },
    orderBy: [{ meetingId: "asc" }, { studentId: "asc" }],
  });
  return { meetings, records };
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
