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

type NoteStudent = {
  studentId: string;
  name: string;
  subjects: Array<{ name: string; gradeStatus: string; score: number | null; description: { status: string; text: string | null } }>;
  attendance: { dataStatus: string; sakit: number | null };
  note: { status: string; text: string | null; locked: boolean };
};
type NoteBody = { homerooms: Array<{ id: string; className: string }>; sheet: { homeroomId: string; className: string; canEdit: boolean; students: NoteStudent[] } | null };
type PrepBody = { prep: { students: Array<{ status: string; homeroomNote: { status: string; text: string | null }; subjects: Array<{ score: number | null }> }> } | null };

describe("Catatan wali kelas rapor Kurikulum Merdeka", { concurrency: 1 }, () => {
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

  it("menyimpan catatan Siti untuk X TKJ 1 tanpa mengubah nilai atau absensi", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Catatan Wali", npsn: "10600031" });
    const other = await createSchool(context.prisma, { name: "SMK Catatan Lain", npsn: "10600032" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KUMER", name: "KUMER1" } });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "TKJ001", name: "KJD", category: "KEJURUAN" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const sitiUser = await createUser(context.prisma, { email: "siti.catatan@uji.local", name: "Siti", password: PASSWORD });
    const guruUser = await createUser(context.prisma, { email: "guru.catatan@uji.local", name: "Guru Lain", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.catatan.lain@uji.local", name: "Wali Lain", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.catatan.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: sitiUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Lain", gender: "LAKI_LAKI" } });
    const siti = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: sitiUser.id, name: "Siti", gender: "PEREMPUAN" } });
    const otherWali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWaliUser.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subject.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: siti.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWali.id, classId: otherClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: subject.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const student = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060003101", nis: "01", name: "Siswa Satu", gender: "LAKI_LAKI" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: student.id, uh: 80 } });
    await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: student.id, score: 70 } });
    await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId: student.id, sts: 90, sas: 100 } });
    await context.prisma.gradeReportPolicy.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        academicPeriodId: period.id,
        curriculumId: curriculum.id,
        status: "ACTIVE",
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
    for (const row of [
      { componentKey: `f:uh:${objective.id}`, kind: "FORMATIVE" as const, field: "UH" as const },
      { componentKey: `s:${scope.id}`, kind: "SUMMATIVE" as const, field: "SCORE" as const },
      { componentKey: "sts", kind: "STS" as const, field: "STS" as const },
      { componentKey: "sas", kind: "SAS" as const, field: "SAS" as const },
    ]) {
      await context.prisma.gradeComponentSubmission.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, ...row, status: "SUBMITTED" } });
    }

    const sitiToken = await token(context, sitiUser.email);
    const notesUrl = `/api/v1/schools/${school.id}/homeroom-notes`;
    const prepUrl = `/api/v1/schools/${school.id}/homeroom-report-prep`;
    const opened = await readNotes(context, notesUrl, sitiToken);
    assert.equal(opened.homerooms[0]?.className, "X TKJ 1");
    assert.equal(opened.sheet?.canEdit, true);
    assert.equal(opened.sheet?.students[0]?.name, "Siswa Satu");
    assert.equal(opened.sheet?.students[0]?.subjects[0]?.name, "KJD");
    assert.equal(opened.sheet?.students[0]?.subjects[0]?.score, 83);
    assert.equal(opened.sheet?.students[0]?.subjects[0]?.description.status, "BELUM_TERSEDIA");
    assert.equal(opened.sheet?.students[0]?.attendance.dataStatus, "BELUM_ADA_DATA");
    assert.equal(opened.sheet?.students[0]?.note.status, "BELUM_ADA");

    const blank = await context.app.inject({
      method: "PUT",
      url: notesUrl,
      headers: authHeader(sitiToken),
      payload: { homeroomId: homeroom.id, studentId: student.id, text: " " },
    });
    assert.equal(blank.statusCode, 400);

    const draft = await writeNote(context, "PUT", notesUrl, sitiToken, { homeroomId: homeroom.id, studentId: student.id, text: "Catatan draf yang belum resmi." });
    assert.equal(draft.sheet?.students[0]?.note.status, "DRAFT");
    assert.equal(draft.sheet?.students[0]?.note.locked, false);
    const draftPrep = await readPrep(context, prepUrl, sitiToken);
    assert.equal(draftPrep.prep?.students[0]?.homeroomNote.status, "BELUM_TERSEDIA");
    assert.equal(draftPrep.prep?.students[0]?.homeroomNote.text, null);
    assert.equal(draftPrep.prep?.students[0]?.status, "BELUM_LENGKAP");

    const finalized = await writeNote(context, "POST", `${notesUrl}/finalize`, sitiToken, { homeroomId: homeroom.id, studentId: student.id, text: "Catatan resmi wali kelas untuk rapor." });
    assert.equal(finalized.sheet?.students[0]?.note.status, "FINAL");
    assert.equal(finalized.sheet?.students[0]?.note.locked, true);
    const finalPrep = await readPrep(context, prepUrl, sitiToken);
    assert.equal(finalPrep.prep?.students[0]?.homeroomNote.status, "SIAP");
    assert.equal(finalPrep.prep?.students[0]?.homeroomNote.text, "Catatan resmi wali kelas untuk rapor.");
    assert.equal(finalPrep.prep?.students[0]?.subjects[0]?.score, 83);
    assert.equal(finalPrep.prep?.students[0]?.status, "BELUM_LENGKAP");
    assert.equal(await context.prisma.homeroomNote.count({ where: { studentId: student.id, academicPeriodId: period.id } }), 1);

    const locked = await context.app.inject({
      method: "PUT",
      url: notesUrl,
      headers: authHeader(sitiToken),
      payload: { homeroomId: homeroom.id, studentId: student.id, text: "Percobaan ubah tanpa alasan." },
    });
    assert.equal(locked.statusCode, 409);

    const shortReason = await context.app.inject({
      method: "POST",
      url: `${notesUrl}/correct`,
      headers: authHeader(sitiToken),
      payload: { homeroomId: homeroom.id, studentId: student.id, text: "Catatan dikoreksi.", reason: "pendek" },
    });
    assert.equal(shortReason.statusCode, 400);

    const corrected = await writeNote(context, "POST", `${notesUrl}/correct`, sitiToken, {
      homeroomId: homeroom.id,
      studentId: student.id,
      text: "Catatan resmi setelah koreksi beralasan.",
      reason: "Redaksi catatan final perlu diperbaiki.",
    });
    assert.equal(corrected.sheet?.students[0]?.note.status, "FINAL");
    assert.equal(corrected.sheet?.students[0]?.note.text, "Catatan resmi setelah koreksi beralasan.");
    const correctedPrep = await readPrep(context, prepUrl, sitiToken);
    assert.equal(correctedPrep.prep?.students[0]?.homeroomNote.text, "Catatan resmi setelah koreksi beralasan.");
    assert.equal(await context.prisma.homeroomNoteCorrection.count({ where: { schoolId: school.id } }), 1);
    const audit = await context.prisma.auditLog.findFirst({ where: { schoolId: school.id, action: "HOMEROOM_NOTE_CORRECTED" } });
    assert.equal((audit?.metadata as { reason?: string } | null)?.reason, "Redaksi catatan final perlu diperbaiki.");

    const guruRead = await context.app.inject({ method: "GET", url: `${notesUrl}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, guruUser.email)) });
    assert.equal(guruRead.statusCode, 403);
    const otherRead = await context.app.inject({ method: "GET", url: `${notesUrl}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, otherWaliUser.email)) });
    assert.equal(otherRead.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url: notesUrl, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: student.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
    assert.equal(await context.prisma.gradeFinalResult.count({ where: { teachingAssignmentId: assignment.id } }), 0);
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id, status: "SUBMITTED" } }), 4);
    assert.equal(await context.prisma.dailyAttendance.count({ where: { schoolId: school.id } }), 0);
    assert.equal(await context.prisma.competencyDescription.count({ where: { schoolId: school.id } }), 0);
    const stored = await context.prisma.homeroomNote.findFirstOrThrow({ where: { studentId: student.id } });
    assert.equal(stored.schoolId, school.id);
    assert.equal(stored.classId, schoolClass.id);
    assert.equal(stored.academicYearId, year.id);
    assert.equal(stored.academicPeriodId, period.id);
    assert.equal(stored.status, "FINAL");
  });
});

async function readNotes(context: TestContext, url: string, accessToken: string): Promise<NoteBody> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<NoteBody>(response);
}

async function readPrep(context: TestContext, url: string, accessToken: string): Promise<PrepBody> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<PrepBody>(response);
}

async function writeNote(context: TestContext, method: "PUT" | "POST", url: string, accessToken: string, payload: object): Promise<NoteBody> {
  const response = await context.app.inject({ method, url, headers: authHeader(accessToken), payload });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<NoteBody>(response);
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
