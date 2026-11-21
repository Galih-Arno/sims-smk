import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import type { ApiErrorBody, LoginResponse } from "@sims/shared";
import { Prisma } from "@prisma/client";
import { readOfficialPrintSnapshot } from "../src/modules/academic/report-card/print-source.ts";
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
const NOTE = "Catatan resmi wali kelas untuk rapor siswa lengkap.";
const DESCRIPTION = "Menunjukkan penguasaan tujuan pembelajaran dan lingkup materi.";
const PKL = "PKL bengkel jaringan selama semester ini.";
const EKSKUL = "Pramuka dan rohani.";
const PKL_REVISI = "PKL bengkel jaringan direvisi setelah pengesahan.";

describe("Pemeriksaan dan pengesahan rapor", { concurrency: 1 }, () => {
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

  it("mengunci alur wali, wakakur, dan kepala sekolah pada data rapor lengkap", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Pengesahan", npsn: "10600081" });
    await context.prisma.school.update({ where: { id: school.id }, data: { principalName: "Kepala Uji" } });
    const other = await createSchool(context.prisma, { name: "SMK Pengesahan Lain", npsn: "10600082" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL",
        startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"),
        reportDate: new Date("2026-11-19T00:00:00.000Z"), isActive: true,
      },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KUMER", name: "KUMER1" } });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "TKJ001", name: "KJD", category: "KEJURUAN" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10, fase: "E" } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10, fase: "E" } });
    const sitiUser = await createUser(context.prisma, { email: "siti.pengesahan@uji.local", name: "Siti", password: PASSWORD });
    const tojiUser = await createUser(context.prisma, { email: "toji.pengesahan@uji.local", name: "TOJI", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.pengesahan.lain@uji.local", name: "Wali Lain", password: PASSWORD });
    const wakakurUser = await createUser(context.prisma, { email: "wakakur.pengesahan@uji.local", name: "Wakakur Uji", password: PASSWORD });
    const kepalaUser = await createUser(context.prisma, { email: "kepala.pengesahan@uji.local", name: "Kepala Uji", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.pengesahan.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: sitiUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: tojiUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakurUser.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: kepalaUser.id, roleCode: "KEPALA_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const toji = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: tojiUser.id, name: "TOJI", gender: "LAKI_LAKI" } });
    const siti = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: sitiUser.id, name: "Siti", gender: "PEREMPUAN" } });
    const otherWali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWaliUser.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: toji.id, subjectId: subject.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: siti.id, classId: schoolClass.id, academicPeriodId: period.id } });
    const otherHomeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWali.id, classId: otherClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: subject.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const lengkap = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060008101", nis: "01", name: "Siswa Lengkap", gender: "LAKI_LAKI" } });
    const belum = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060008102", nis: "02", name: "Siswa Belum", gender: "PEREMPUAN" } });
    const luar = await context.prisma.student.create({ data: { schoolId: school.id, classId: otherClass.id, nisn: "1060008103", nis: "03", name: "Siswa Lain", gender: "LAKI_LAKI" } });
    for (const studentId of [lengkap.id, belum.id]) {
      await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId, uh: 80 } });
      await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId, score: 70 } });
      await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId, sts: 90, sas: 100 } });
    }
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
    const rule = await context.prisma.attendanceCompletenessRule.create({
      data: { schoolId: school.id, academicPeriodId: period.id, status: "ACTIVE", activatedAt: new Date(), activatedById: wakakurUser.id },
    });
    await context.prisma.attendanceCalendarDay.create({
      data: { schoolId: school.id, ruleId: rule.id, date: new Date("2026-11-19T00:00:00.000Z"), kind: "PEMBELAJARAN" },
    });
    await context.prisma.dailyAttendance.create({
      data: {
        schoolId: school.id, homeroomAssignmentId: homeroom.id, attendanceDate: new Date("2026-11-19T00:00:00.000Z"),
        status: "FINAL", finalizedAt: new Date(), finalizedById: sitiUser.id, createdById: sitiUser.id,
        records: { create: [lengkap.id, belum.id].map((studentId) => ({ schoolId: school.id, studentId, status: "HADIR" as const })) },
      },
    });
    await context.prisma.studentReportActivity.create({
      data: { schoolId: school.id, studentId: lengkap.id, academicPeriodId: period.id, pklText: PKL, extracurricularText: EKSKUL },
    });

    const sitiToken = await token(context, sitiUser.email);
    const tojiToken = await token(context, tojiUser.email);
    const otherToken = await token(context, otherWaliUser.email);
    const wakakurToken = await token(context, wakakurUser.email);
    const kepalaToken = await token(context, kepalaUser.email);
    const descriptionUrl = `/api/v1/schools/${school.id}/competency-descriptions`;
    const described = await send(context.app, "PUT", descriptionUrl, tojiToken, {
      assignmentId: assignment.id,
      students: [{ studentId: lengkap.id, text: DESCRIPTION }, { studentId: belum.id, text: DESCRIPTION }],
    });
    assert.equal(described.statusCode, 200, described.body);
    const submittedDescription = await send(context.app, "POST", `${descriptionUrl}/submit`, tojiToken, { assignmentId: assignment.id });
    assert.equal(submittedDescription.statusCode, 200, submittedDescription.body);
    const noted = await send(context.app, "POST", `/api/v1/schools/${school.id}/homeroom-notes/finalize`, sitiToken, {
      homeroomId: homeroom.id, studentId: lengkap.id, text: NOTE,
    });
    assert.equal(noted.statusCode, 200, noted.body);

    const examUrl = `/api/v1/schools/${school.id}/report-examinations`;
    const board = jsonBody<ExamBody>(await send(context.app, "GET", `${examUrl}?homeroomId=${homeroom.id}`, sitiToken));
    assert.deepEqual(board.rows.map((row) => row.name), ["Siswa Belum", "Siswa Lengkap"]);
    assert.equal(board.rows.find((row) => row.studentId === luar.id), undefined);
    const ready = rowOf(board, lengkap.id);
    const incomplete = rowOf(board, belum.id);
    assert.equal(ready.printStatus, "SIAP_CETAK");
    assert.equal(ready.reviewStatus, "BELUM_DIPERIKSA");
    assert.equal(incomplete.printStatus, "DRAF");
    assert.equal(board.summary.total, 2);
    assert.equal(board.summary.lengkap, 1);

    assert.equal((await send(context.app, "GET", examUrl, tojiToken)).statusCode, 403);
    assert.equal((await send(context.app, "GET", `${examUrl}?homeroomId=${homeroom.id}`, otherToken)).statusCode, 403);
    const neighborRead = await send(context.app, "GET", examUrl, await token(context, neighbor.email));
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");
    const otherBoard = jsonBody<ExamBody>(await send(context.app, "GET", `${examUrl}?homeroomId=${otherHomeroom.id}`, otherToken));
    assert.deepEqual(otherBoard.rows.map((row) => row.studentId), [luar.id]);

    const reviewBody = { homeroomId: homeroom.id, studentId: lengkap.id };
    const blockedSubmit = await send(context.app, "POST", `${examUrl}/submit`, sitiToken, reviewBody);
    assert.equal(blockedSubmit.statusCode, 409);
    const incompleteSubmit = await send(context.app, "POST", `${examUrl}/submit`, sitiToken, { homeroomId: homeroom.id, studentId: belum.id });
    assert.equal(incompleteSubmit.statusCode, 409);
    const otherReview = await send(context.app, "POST", `${examUrl}/review`, otherToken, reviewBody);
    assert.equal(otherReview.statusCode, 403);

    const reviewed = await send(context.app, "POST", `${examUrl}/review`, sitiToken, reviewBody);
    assert.equal(reviewed.statusCode, 200, reviewed.body);
    const review = await context.prisma.reportReview.findFirstOrThrow({ where: { studentId: lengkap.id } });
    assert.equal(review.reviewedById, sitiUser.id);
    assert.ok(review.reviewedAt instanceof Date);
    assert.equal(review.fingerprint.length, 64);
    await context.prisma.studentReportActivity.update({ where: { studentId_academicPeriodId: { studentId: lengkap.id, academicPeriodId: period.id } }, data: { pklText: PKL_REVISI } });
    const staleReview = jsonBody<ExamBody>(await send(context.app, "GET", `${examUrl}?homeroomId=${homeroom.id}`, sitiToken));
    assert.equal(rowOf(staleReview, lengkap.id).reviewStatus, "BELUM_DIPERIKSA");
    assert.equal((await send(context.app, "POST", `${examUrl}/submit`, sitiToken, reviewBody)).statusCode, 409);
    assert.equal(await context.prisma.reportReview.count({ where: { studentId: lengkap.id } }), 1);
    await context.prisma.studentReportActivity.update({ where: { studentId_academicPeriodId: { studentId: lengkap.id, academicPeriodId: period.id } }, data: { pklText: PKL } });
    assert.equal((await send(context.app, "POST", `${examUrl}/review`, sitiToken, reviewBody)).statusCode, 200);
    const filed = await send(context.app, "POST", `${examUrl}/submit`, sitiToken, reviewBody);
    assert.equal(filed.statusCode, 200, filed.body);
    assert.equal(jsonBody<{ status: string }>(filed).status, "DIAJUKAN");

    const validationUrl = `/api/v1/schools/${school.id}/report-validations`;
    const endorsementUrl = `/api/v1/schools/${school.id}/report-endorsements`;
    await context.prisma.studentReportActivity.update({ where: { studentId_academicPeriodId: { studentId: lengkap.id, academicPeriodId: period.id } }, data: { pklText: PKL_REVISI } });
    const staleApproval = await send(context.app, "POST", `${validationUrl}/decision`, wakakurToken, decision(lengkap.id, period.id, "approve"));
    assert.equal(staleApproval.statusCode, 409);
    await context.prisma.studentReportActivity.update({ where: { studentId_academicPeriodId: { studentId: lengkap.id, academicPeriodId: period.id } }, data: { pklText: PKL } });
    const shortReturn = await send(context.app, "POST", `${validationUrl}/decision`, wakakurToken, decision(lengkap.id, period.id, "return", "pendek"));
    assert.equal(shortReturn.statusCode, 400);
    const returned = await send(context.app, "POST", `${validationUrl}/decision`, wakakurToken, decision(lengkap.id, period.id, "return", "Deskripsi PKL perlu diperjelas."));
    assert.equal(returned.statusCode, 200, returned.body);
    assert.equal((await send(context.app, "POST", `${examUrl}/submit`, sitiToken, reviewBody)).statusCode, 409);
    assert.equal((await send(context.app, "POST", `${examUrl}/review`, sitiToken, reviewBody)).statusCode, 200);
    assert.equal((await send(context.app, "POST", `${examUrl}/submit`, sitiToken, reviewBody)).statusCode, 200);
    const approved = await send(context.app, "POST", `${validationUrl}/decision`, wakakurToken, decision(lengkap.id, period.id, "approve"));
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(jsonBody<{ status: string }>(approved).status, "DISETUJUI_WAKAKUR");

    await context.prisma.studentReportActivity.update({ where: { studentId_academicPeriodId: { studentId: lengkap.id, academicPeriodId: period.id } }, data: { pklText: PKL_REVISI } });
    assert.equal((await send(context.app, "POST", `${endorsementUrl}/decision`, kepalaToken, decision(lengkap.id, period.id, "endorse"))).statusCode, 409);
    await context.prisma.studentReportActivity.update({ where: { studentId_academicPeriodId: { studentId: lengkap.id, academicPeriodId: period.id } }, data: { pklText: PKL } });
    assert.equal((await send(context.app, "POST", `${endorsementUrl}/decision`, kepalaToken, decision(lengkap.id, period.id, "return", "pendek"))).statusCode, 400);
    const principalReturn = await send(context.app, "POST", `${endorsementUrl}/decision`, kepalaToken, decision(lengkap.id, period.id, "return", "Catatan pengesahan perlu dilengkapi."));
    assert.equal(principalReturn.statusCode, 200, principalReturn.body);
    assert.equal((await send(context.app, "POST", `${examUrl}/review`, sitiToken, reviewBody)).statusCode, 200);
    assert.equal((await send(context.app, "POST", `${examUrl}/submit`, sitiToken, reviewBody)).statusCode, 200);
    assert.equal((await send(context.app, "POST", `${validationUrl}/decision`, wakakurToken, decision(lengkap.id, period.id, "approve"))).statusCode, 200);
    const endorsed = await send(context.app, "POST", `${endorsementUrl}/decision`, kepalaToken, decision(lengkap.id, period.id, "endorse"));
    assert.equal(endorsed.statusCode, 200, endorsed.body);
    assert.equal(jsonBody<{ status: string }>(endorsed).status, "DISAHKAN");

    const firstSnapshot = await context.prisma.reportCardSnapshot.findFirstOrThrow({ where: { studentId: lengkap.id, version: 1 } });
    const firstPayload = JSON.stringify(firstSnapshot.payload);
    await context.prisma.studentReportActivity.update({ where: { studentId_academicPeriodId: { studentId: lengkap.id, academicPeriodId: period.id } }, data: { pklText: PKL_REVISI } });
    const unchanged = await context.prisma.reportCardSnapshot.findFirstOrThrow({ where: { id: firstSnapshot.id } });
    assert.equal(JSON.stringify(unchanged.payload), firstPayload);
    assert.equal(JSON.stringify(unchanged.payload).includes(PKL), true);
    assert.equal(JSON.stringify(unchanged.payload).includes(PKL_REVISI), false);
    const official = await readOfficialPrintSnapshot(context.prisma, school.id, lengkap.id, period.id);
    assert.equal(official?.id, firstSnapshot.id);

    const revision = await send(context.app, "POST", `${endorsementUrl}/revision`, kepalaToken, {
      studentId: lengkap.id, academicPeriodId: period.id, reason: "PKL diperbarui setelah pengesahan.",
    });
    assert.equal(revision.statusCode, 200, revision.body);
    assert.equal(await context.prisma.reportCardSnapshot.count({ where: { studentId: lengkap.id } }), 1);
    assert.equal((await context.prisma.reportCardWorkflow.findFirstOrThrow({ where: { studentId: lengkap.id } })).activeSnapshotId, null);
    assert.equal(await readOfficialPrintSnapshot(context.prisma, school.id, lengkap.id, period.id), null);
    assert.equal((await send(context.app, "POST", `${examUrl}/review`, sitiToken, reviewBody)).statusCode, 200);
    assert.equal((await send(context.app, "POST", `${examUrl}/submit`, sitiToken, reviewBody)).statusCode, 200);
    assert.equal((await send(context.app, "POST", `${validationUrl}/decision`, wakakurToken, decision(lengkap.id, period.id, "approve"))).statusCode, 200);
    assert.equal((await send(context.app, "POST", `${endorsementUrl}/decision`, kepalaToken, decision(lengkap.id, period.id, "endorse"))).statusCode, 200);
    const snapshots = await context.prisma.reportCardSnapshot.findMany({ where: { studentId: lengkap.id }, orderBy: { version: "asc" } });
    assert.deepEqual(snapshots.map((item) => item.version), [1, 2]);
    assert.equal(JSON.stringify(snapshots[0]?.payload).includes(PKL_REVISI), false);
    assert.equal(JSON.stringify(snapshots[1]?.payload).includes(PKL_REVISI), true);
    const workflow = await context.prisma.reportCardWorkflow.findFirstOrThrow({ where: { studentId: lengkap.id } });
    assert.equal(workflow.status, "DISAHKAN");
    assert.equal(workflow.activeSnapshotId, snapshots[1]?.id);
    assert.equal(await context.prisma.reportCardWorkflow.count({ where: { studentId: lengkap.id, academicPeriodId: period.id, status: "DISAHKAN" } }), 1);
    assert.ok(await context.prisma.reportCardEvent.count({ where: { workflowId: workflow.id } }) >= 8);

    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: lengkap.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
    assert.equal(await context.prisma.gradeFinalResult.count({ where: { schoolId: school.id } }), 0);
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id, status: "SUBMITTED" } }), 4);
    assert.equal((await context.prisma.competencyDescription.findFirstOrThrow({ where: { teachingAssignmentId: assignment.id } })).status, "SUBMITTED");
    assert.equal((await context.prisma.homeroomNote.findFirstOrThrow({ where: { studentId: lengkap.id } })).status, "FINAL");
    assert.equal((await context.prisma.homeroomNote.findFirstOrThrow({ where: { studentId: lengkap.id } })).text, NOTE);
    assert.equal(await context.prisma.dailyAttendance.count({ where: { schoolId: school.id } }), 1);
  });
});

type ExamRow = { studentId: string; name: string; printStatus: string; reviewStatus: string };
type ExamBody = { summary: { total: number; lengkap: number }; rows: ExamRow[] };

function rowOf(body: ExamBody, studentId: string): ExamRow {
  const row = body.rows.find((item) => item.studentId === studentId);
  assert.ok(row);
  return row;
}

function decision(studentId: string, academicPeriodId: string, kind: "approve" | "return" | "endorse", reason?: string) {
  return { studentId, academicPeriodId, decision: kind, reason };
}

async function send(app: FastifyInstance, method: "GET" | "POST" | "PUT", url: string, accessToken: string, payload?: object) {
  return app.inject({ method, url, headers: authHeader(accessToken), payload });
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
