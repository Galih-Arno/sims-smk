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
  assignmentId: string;
  status: string | null;
  locked: boolean;
  needsReview: boolean;
  students: Array<{ name: string; suggestion: string | null; warnings: string[]; text: string; finalScore: number | null }>;
};
type SheetBody = { assignments: Array<{ subjectName: string }>; sheet: Sheet | null };
type PrepBody = {
  prep: {
    students: Array<{ subjects: Array<{ name: string; score: number | null; description: { status: string; text: string | null } }> }>;
  } | null;
};
type WaliBody = { view: { subjects: Array<{ status: string; needsReview: boolean; students: Array<{ text: string | null; reviewStatus: string }> }> } | null };

describe("Deskripsi capaian kompetensi", { concurrency: 1 }, () => {
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

  it("mengirim deskripsi resmi dari bukti penilaian dan menahan draf serta perubahan nilai", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Deskripsi Capaian", npsn: "10600071" });
    const other = await createSchool(context.prisma, { name: "SMK Deskripsi Lain", npsn: "10600072" });
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
    const guruUser = await createUser(context.prisma, { email: "toji.deskripsi@uji.local", name: "TOJI", password: PASSWORD });
    const otherGuru = await createUser(context.prisma, { email: "guru.lain.deskripsi@uji.local", name: "Guru Lain", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.deskripsi@uji.local", name: "Wali Deskripsi", password: PASSWORD });
    const otherWali = await createUser(context.prisma, { email: "wali.lain.deskripsi@uji.local", name: "Wali Lain", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.deskripsi.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherGuru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWali.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "TOJI", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Deskripsi", gender: "PEREMPUAN" } });
    const otherWaliTeacher = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWali.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subjectRow.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWaliTeacher.id, classId: otherClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: subjectRow.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const first = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060007101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    const second = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060007102", nis: "02", name: "Siswa Dua", gender: "PEREMPUAN" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: first.id, uh: 80 } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: second.id, uh: 80 } });
    const firstSummative = await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: first.id, score: 70 } });
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

    const guruToken = await token(context, guruUser.email);
    const waliToken = await token(context, waliUser.email);
    const base = `/api/v1/schools/${school.id}/competency-descriptions`;
    const prepUrl = `/api/v1/schools/${school.id}/homeroom-report-prep`;
    const waliUrl = `/api/v1/schools/${school.id}/homeroom-competency-descriptions`;
    const opened = jsonBody<SheetBody>(await send(context, "GET", `${base}?assignmentId=${assignment.id}`, guruToken));
    assert.equal(opened.assignments[0]?.subjectName, "KJD");
    assert.equal(opened.sheet?.students[0]?.finalScore, 83);
    assert.match(opened.sheet?.students[0]?.suggestion ?? "", /baik pada TP1 Tujuan/);
    assert.match(opened.sheet?.students[0]?.suggestion ?? "", /cukup pada LM1 Lingkup/);
    assert.match(opened.sheet?.students[0]?.suggestion ?? "", /Nilai akhir 83/);
    assert.equal(opened.sheet?.students[0]?.warnings.length, 0);

    await context.prisma.summativeScore.update({ where: { id: firstSummative.id }, data: { score: null } });
    const incomplete = jsonBody<SheetBody>(await send(context, "GET", `${base}?assignmentId=${assignment.id}`, guruToken));
    assert.equal(student(incomplete, "Siswa Satu").suggestion, null);
    assert.equal(student(incomplete, "Siswa Satu").warnings.includes("Hasil lingkup materi belum lengkap."), true);
    const blocked = await send(context, "POST", `${base}/submit`, guruToken, { assignmentId: assignment.id });
    assert.equal(blocked.statusCode, 400);
    await context.prisma.summativeScore.update({ where: { id: firstSummative.id }, data: { score: 70 } });

    const draftText = "Deskripsi draf yang belum resmi.";
    const saved = jsonBody<{ sheet: Sheet }>(await send(context, "PUT", base, guruToken, {
      assignmentId: assignment.id,
      students: [{ studentId: first.id, text: draftText }, { studentId: second.id, text: draftText }],
    }));
    assert.equal(saved.sheet.status, "DRAFT");
    assert.equal(saved.sheet.locked, false);
    const draftPrep = await readPrep(context, prepUrl, waliToken);
    assert.equal(draftPrep.prep?.students[0]?.subjects[0]?.description.status, "BELUM_TERSEDIA");
    assert.equal(draftPrep.prep?.students[0]?.subjects[0]?.description.text, null);
    assert.equal(jsonBody<WaliBody>(await send(context, "GET", waliUrl, waliToken)).view?.subjects.length, 0);

    const submitted = jsonBody<{ sheet: Sheet }>(await send(context, "POST", `${base}/submit`, guruToken, { assignmentId: assignment.id }));
    assert.equal(submitted.sheet.status, "SUBMITTED");
    assert.equal(submitted.sheet.locked, true);
    const official = await readPrep(context, prepUrl, waliToken);
    assert.equal(official.prep?.students[0]?.subjects[0]?.description.status, "SIAP");
    assert.equal(official.prep?.students[0]?.subjects[0]?.description.text, draftText);
    assert.equal(official.prep?.students[0]?.subjects[0]?.score, 83);
    const waliView = jsonBody<WaliBody>(await send(context, "GET", waliUrl, waliToken));
    assert.equal(waliView.view?.subjects[0]?.students[0]?.text, draftText);

    await context.prisma.formativeScore.updateMany({ where: { formativeAssessmentId: formative.id }, data: { uh: 90 } });
    const reviewed = jsonBody<SheetBody>(await send(context, "GET", `${base}?assignmentId=${assignment.id}`, guruToken));
    assert.equal(reviewed.sheet?.needsReview, true);
    assert.equal(reviewed.sheet?.students[0]?.finalScore, 86);
    const stale = await readPrep(context, prepUrl, waliToken);
    assert.equal(stale.prep?.students[0]?.subjects[0]?.description.status, "PERLU_DITINJAU");
    assert.equal(stale.prep?.students[0]?.subjects[0]?.description.text, null);
    assert.equal(stale.prep?.students[0]?.subjects[0]?.score, 86);
    const locked = await send(context, "PUT", base, guruToken, {
      assignmentId: assignment.id,
      students: [{ studentId: first.id, text: "Diubah diam-diam" }, { studentId: second.id, text: "Diubah diam-diam" }],
    });
    assert.equal(locked.statusCode, 409);
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id, status: "SUBMITTED" } }), 4);

    const otherRead = await send(context, "GET", `${base}?assignmentId=${assignment.id}`, await token(context, otherGuru.email));
    assert.equal(otherRead.statusCode, 403);
    const neighborRead = await send(context, "GET", base, await token(context, neighbor.email));
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const revised = jsonBody<{ sheet: Sheet }>(await send(context, "POST", `${base}/revision`, guruToken, {
      assignmentId: assignment.id,
      reason: "Nilai akhir berubah setelah deskripsi dikirim",
    }));
    assert.equal(revised.sheet.status, "REVISION_REQUESTED");
    const stranger = await send(context, "POST", `${base}/decision`, await token(context, otherWali.email), { assignmentId: assignment.id, decision: "approve" });
    assert.equal(stranger.statusCode, 403);
    const approved = jsonBody<{ sheet: Sheet }>(await send(context, "POST", `${base}/decision`, waliToken, { assignmentId: assignment.id, decision: "approve", note: "Silakan perbarui" }));
    assert.equal(approved.sheet.status, "DRAFT");
    assert.equal(approved.sheet.locked, false);
    const nextText = "Deskripsi diperbarui setelah nilai berubah.";
    await send(context, "PUT", base, guruToken, {
      assignmentId: assignment.id,
      students: [{ studentId: first.id, text: nextText }, { studentId: second.id, text: nextText }],
    });
    await send(context, "POST", `${base}/submit`, guruToken, { assignmentId: assignment.id });
    const refreshed = await readPrep(context, prepUrl, waliToken);
    assert.equal(refreshed.prep?.students[0]?.subjects[0]?.description.status, "SIAP");
    assert.equal(refreshed.prep?.students[0]?.subjects[0]?.description.text, nextText);
    assert.equal(jsonBody<SheetBody>(await send(context, "GET", `${base}?assignmentId=${assignment.id}`, guruToken)).sheet?.needsReview, false);

    await send(context, "POST", `${base}/revision`, guruToken, { assignmentId: assignment.id, reason: "Perlu koreksi redaksi deskripsi" });
    const rejected = jsonBody<{ sheet: Sheet }>(await send(context, "POST", `${base}/decision`, waliToken, { assignmentId: assignment.id, decision: "reject" }));
    assert.equal(rejected.sheet.status, "SUBMITTED");
    assert.equal(rejected.sheet.locked, true);
    assert.equal(rejected.sheet.students[0]?.text, nextText);
    assert.equal((await send(context, "PUT", base, guruToken, { assignmentId: assignment.id, students: [] })).statusCode, 409);

    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { studentId: first.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(90).toString());
    assert.equal(await context.prisma.gradeFinalResult.count({ where: { schoolId: school.id } }), 0);
    assert.equal(await context.prisma.dailyAttendance.count({ where: { schoolId: school.id } }), 0);
    assert.equal(await context.prisma.attendanceMeeting.count({ where: { schoolId: school.id } }), 0);
  });
});

function student(body: SheetBody, name: string): Sheet["students"][number] {
  const found = body.sheet?.students.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
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
