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
  meeting: { id: string; status: string; sessionNo: number; marker: string | null; scheduleSlotId: string | null; canEdit: boolean; canCorrect: boolean };
  students: Array<{ studentId: string; status: string | null }>;
};
type Board = {
  assignments: Array<{ id: string; className: string; subjectName: string }>;
  summary: { finalMeetings: number; students: Array<{ name: string; hadir: number; sakit: number; izin: number; alpa: number }> };
  meetings: { total: number; items: Array<{ sessionNo: number; status: string; marker: string | null }> };
};

describe("Absensi siswa per mata pelajaran", { concurrency: 1 }, () => {
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

  it("mengelola draf dan final tanpa mengubah nilai atau mengisi kosong sebagai hadir", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Absensi", npsn: "10700021" });
    const other = await createSchool(context.prisma, { name: "SMK Absensi Lain", npsn: "10700022" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const inactive = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Genap", semesterKind: "GENAP", startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z"), isActive: false },
    });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "KJD", name: "KJD" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const guruUser = await createUser(context.prisma, { email: "toji.absen@uji.local", name: "TOJI", password: PASSWORD });
    const otherGuruUser = await createUser(context.prisma, { email: "guru.lain.absen@uji.local", name: "Guru Lain", password: PASSWORD });
    const wakakurUser = await createUser(context.prisma, { email: "wakakur.absen@uji.local", name: "Wakakur Absen", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.absen.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherGuruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakurUser.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "TOJI", gender: "LAKI_LAKI" } });
    const otherGuru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherGuruUser.id, name: "Guru Lain", gender: "PEREMPUAN" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subject.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subject.id, classId: otherClass.id, academicPeriodId: inactive.id },
    });
    await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: otherGuru.id, subjectId: subject.id, classId: otherClass.id, academicPeriodId: period.id },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KUMER", name: "KUMER1" } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const first = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1070002101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    const second = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1070002102", nis: "02", name: "Siswa Dua", gender: "PEREMPUAN" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: first.id, uh: 80 } });
    const slot = await context.prisma.classScheduleSlot.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, label: "Slot uji", dayOfWeek: 1, startTime: "07:00", endTime: "08:30" },
    });

    const guruToken = await token(context, guruUser.email);
    const base = `/api/v1/schools/${school.id}/attendance`;
    const board = await readBoard(context, base, guruToken);
    assert.deepEqual(board.assignments.map((item) => item.className), ["X TKJ 1"]);
    assert.equal(board.assignments[0]?.subjectName, "KJD");

    const created = await send<Sheet>(context, "POST", `${base}/meetings`, guruToken, {
      assignmentId: assignment.id,
      meetingDate: "2026-11-19",
      sessionNo: 1,
      marker: "QC-05C",
      scheduleSlotId: slot.id,
    });
    assert.equal(created.meeting.status, "DRAFT");
    assert.equal(created.meeting.marker, "QC-05C");
    assert.equal(created.meeting.scheduleSlotId, slot.id);
    assert.equal(created.students.every((item) => item.status === null), true);
    const secondSession = await send<Sheet>(context, "POST", `${base}/meetings`, guruToken, {
      assignmentId: assignment.id,
      meetingDate: "2026-11-19",
      sessionNo: 2,
    });
    assert.equal(secondSession.meeting.sessionNo, 2);
    const duplicate = await context.app.inject({
      method: "POST",
      url: `${base}/meetings`,
      headers: authHeader(guruToken),
      payload: { assignmentId: assignment.id, meetingDate: "2026-11-19", sessionNo: 1 },
    });
    assert.equal(duplicate.statusCode, 409);

    const draft = await send<Sheet>(context, "PUT", `${base}/meetings/${created.meeting.id}`, guruToken, {
      records: [{ studentId: first.id, status: "HADIR" }, { studentId: second.id, status: null }],
    });
    assert.equal(draft.meeting.canEdit, true);
    assert.equal(draft.students.find((item) => item.studentId === second.id)?.status, null);
    const afterDraft = await readBoard(context, `${base}?assignmentId=${assignment.id}`, guruToken);
    assert.equal(afterDraft.summary.students.find((item) => item.name === "Siswa Satu")?.hadir, 0);

    const tooEarly = await context.app.inject({
      method: "POST",
      url: `${base}/meetings/${created.meeting.id}/finalize`,
      headers: authHeader(guruToken),
      payload: { records: [{ studentId: first.id, status: "HADIR" }, { studentId: second.id, status: null }] },
    });
    assert.equal(tooEarly.statusCode, 409);
    assert.equal((await context.prisma.attendanceMeeting.findUniqueOrThrow({ where: { id: created.meeting.id } })).status, "DRAFT");

    const finalSheet = await send<Sheet>(context, "POST", `${base}/meetings/${created.meeting.id}/finalize`, guruToken, {
      records: [{ studentId: first.id, status: "HADIR" }, { studentId: second.id, status: "SAKIT" }],
    });
    assert.equal(finalSheet.meeting.status, "FINAL");
    assert.equal(finalSheet.meeting.canEdit, false);
    const locked = await context.app.inject({
      method: "PUT",
      url: `${base}/meetings/${created.meeting.id}`,
      headers: authHeader(guruToken),
      payload: { records: [{ studentId: first.id, status: "ALPA" }] },
    });
    assert.equal(locked.statusCode, 409);
    const teacherCorrect = await context.app.inject({
      method: "POST",
      url: `${base}/meetings/${created.meeting.id}/correct`,
      headers: authHeader(guruToken),
      payload: { reason: "Salah input", records: [{ studentId: first.id, status: "IZIN" }] },
    });
    assert.equal(teacherCorrect.statusCode, 403);
    const missingReason = await context.app.inject({
      method: "POST",
      url: `${base}/meetings/${created.meeting.id}/correct`,
      headers: authHeader(await token(context, wakakurUser.email)),
      payload: { reason: "no", records: [{ studentId: first.id, status: "IZIN" }] },
    });
    assert.equal(missingReason.statusCode, 400);
    const corrected = await send<Sheet>(context, "POST", `${base}/meetings/${created.meeting.id}/correct`, await token(context, wakakurUser.email), {
      reason: "Status sakit tercatat pada siswa yang salah.",
      records: [{ studentId: first.id, status: "IZIN" }, { studentId: second.id, status: "SAKIT" }],
    });
    assert.equal(corrected.meeting.status, "FINAL");
    assert.equal(corrected.students.find((item) => item.studentId === first.id)?.status, "IZIN");
    const summary = await readBoard(context, `${base}?q=QC-05C`, guruToken);
    assert.equal(summary.meetings.total, 1);
    assert.equal(summary.summary.finalMeetings, 1);
    assert.equal(summary.summary.students.find((item) => item.name === "Siswa Satu")?.izin, 1);
    assert.equal(summary.summary.students.find((item) => item.name === "Siswa Satu")?.hadir, 0);
    assert.equal(summary.summary.students.find((item) => item.name === "Siswa Dua")?.sakit, 1);

    const otherRead = await context.app.inject({ method: "GET", url: `${base}?assignmentId=${assignment.id}`, headers: authHeader(await token(context, otherGuruUser.email)) });
    assert.equal(otherRead.statusCode, 403);
    const otherWrite = await context.app.inject({
      method: "PUT",
      url: `${base}/meetings/${secondSession.meeting.id}`,
      headers: authHeader(await token(context, otherGuruUser.email)),
      payload: { records: [{ studentId: first.id, status: "HADIR" }] },
    });
    assert.equal(otherWrite.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url: base, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");
    const missingSlot = await context.app.inject({
      method: "POST",
      url: `${base}/meetings`,
      headers: authHeader(guruToken),
      payload: { assignmentId: assignment.id, meetingDate: "2026-11-20", sessionNo: 1, scheduleSlotId: "tidak-ada" },
    });
    assert.equal(missingSlot.statusCode, 404);

    const score = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: first.id } });
    assert.equal(score.uh?.toString(), new Prisma.Decimal(80).toString());
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id } }), 0);
    const audit = await context.prisma.auditLog.findFirst({ where: { schoolId: school.id, action: "ATTENDANCE_CORRECTED", entityId: created.meeting.id } });
    assert.ok(audit);
    assert.equal((audit.metadata as { reason?: string }).reason, "Status sakit tercatat pada siswa yang salah.");
  });
});

async function send<T>(context: TestContext, method: "POST" | "PUT", url: string, accessToken: string, payload: object): Promise<T> {
  const response = await context.app.inject({ method, url, headers: authHeader(accessToken), payload });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<T>(response);
}

async function readBoard(context: TestContext, url: string, accessToken: string): Promise<Board> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<Board>(response);
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
