import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import type { ApiErrorBody, LoginResponse } from "@sims/shared";
import { Prisma } from "@prisma/client";
import { renderReportPdf } from "../src/modules/academic/report-card/pdf.ts";
import type { ReportPrintDocument } from "../src/modules/academic/report-card/print-document.ts";
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
const DESCRIPTION = "Deskripsi resmi unik untuk rapor yang disahkan.";
const PKL = "PKL bengkel jaringan semester ganjil.";

describe("penyusun PDF rapor", () => {
  it("membubuhkan watermark hanya pada draf", async () => {
    const draft = pdfText(await renderReportPdf(sample("DRAFT")));
    const official = pdfText(await renderReportPdf(sample("OFFICIAL")));
    assert.equal(draft.includes("BELUM DISAHKAN"), true);
    assert.equal(official.includes("BELUM DISAHKAN"), false);
    assert.equal(official.includes("Versi snapshot 2"), true);
    assert.equal(official.includes("83"), true);
  });
});

describe("Cetak dan PDF rapor resmi", { concurrency: 1 }, () => {
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

  it("menolak cetak resmi sebelum disahkan dan menjaga snapshot setelah nilai berubah", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Cetak", npsn: "10600091" });
    await context.prisma.school.update({ where: { id: school.id }, data: { principalName: "Kepala Uji" } });
    const other = await createSchool(context.prisma, { name: "SMK Cetak Lain", npsn: "10600092" });
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
    const sitiUser = await createUser(context.prisma, { email: "siti.cetak@uji.local", name: "Siti", password: PASSWORD });
    const tojiUser = await createUser(context.prisma, { email: "toji.cetak@uji.local", name: "TOJI", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.cetak.lain@uji.local", name: "Wali Lain", password: PASSWORD });
    const wakakurUser = await createUser(context.prisma, { email: "wakakur.cetak@uji.local", name: "Wakakur Uji", password: PASSWORD });
    const kepalaUser = await createUser(context.prisma, { email: "kepala.cetak@uji.local", name: "Kepala Uji", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.cetak.lain@uji.local", name: "Admin Lain", password: PASSWORD });
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
    const student = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060009101", nis: "01", name: "Siswa Cetak", gender: "LAKI_LAKI" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: student.id, uh: 80 } });
    await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: student.id, score: 70 } });
    await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId: student.id, sts: 90, sas: 100 } });
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
        records: { create: [{ schoolId: school.id, studentId: student.id, status: "HADIR" }] },
      },
    });
    await context.prisma.studentReportActivity.create({
      data: { schoolId: school.id, studentId: student.id, academicPeriodId: period.id, pklText: PKL, extracurricularText: "Pramuka" },
    });

    const sitiToken = await token(context, sitiUser.email);
    const described = await send(context.app, "PUT", `/api/v1/schools/${school.id}/competency-descriptions`, await token(context, tojiUser.email), {
      assignmentId: assignment.id,
      students: [{ studentId: student.id, text: DESCRIPTION }],
    });
    assert.equal(described.statusCode, 200, described.body);
    assert.equal((await send(context.app, "POST", `/api/v1/schools/${school.id}/competency-descriptions/submit`, await token(context, tojiUser.email), { assignmentId: assignment.id })).statusCode, 200);
    assert.equal((await send(context.app, "POST", `/api/v1/schools/${school.id}/homeroom-notes/finalize`, sitiToken, {
      homeroomId: homeroom.id, studentId: student.id, text: "Catatan resmi wali kelas untuk rapor siswa cetak.",
    })).statusCode, 200);

    const pdfUrl = `/api/v1/schools/${school.id}/report-official-print.pdf?studentId=${student.id}&academicPeriodId=${period.id}`;
    const printUrl = `/api/v1/schools/${school.id}/report-official-print?studentId=${student.id}&academicPeriodId=${period.id}`;
    assert.equal((await send(context.app, "GET", pdfUrl, sitiToken)).statusCode, 409);
    assert.equal((await send(context.app, "GET", pdfUrl, await token(context, tojiUser.email))).statusCode, 403);
    assert.equal((await send(context.app, "GET", printUrl, await token(context, otherWaliUser.email))).statusCode, 403);
    const neighborRead = await send(context.app, "GET", pdfUrl, await token(context, neighbor.email));
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const review = { homeroomId: homeroom.id, studentId: student.id };
    assert.equal((await send(context.app, "POST", `/api/v1/schools/${school.id}/report-examinations/review`, sitiToken, review)).statusCode, 200);
    assert.equal((await send(context.app, "POST", `/api/v1/schools/${school.id}/report-examinations/submit`, sitiToken, review)).statusCode, 200);
    assert.equal((await send(context.app, "POST", `/api/v1/schools/${school.id}/report-validations/decision`, await token(context, wakakurUser.email), {
      studentId: student.id, academicPeriodId: period.id, decision: "approve",
    })).statusCode, 200);
    assert.equal((await send(context.app, "POST", `/api/v1/schools/${school.id}/report-endorsements/decision`, await token(context, kepalaUser.email), {
      studentId: student.id, academicPeriodId: period.id, decision: "endorse",
    })).statusCode, 200);

    const before = await context.prisma.reportCardSnapshot.findFirstOrThrow({ where: { studentId: student.id } });
    const beforePayload = JSON.stringify(before.payload);
    const pdf = await send(context.app, "GET", pdfUrl, sitiToken);
    assert.equal(pdf.statusCode, 200, pdf.body);
    assert.equal(pdf.headers["content-type"], "application/pdf");
    assert.match(String(pdf.headers["content-disposition"]), /rapor-01-v1\.pdf/);
    const bytes = Buffer.from(pdf.rawPayload);
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    const shown = pdfText(bytes);
    assert.equal(shown.includes(DESCRIPTION), true);
    assert.equal(shown.includes(PKL), true);
    assert.equal(shown.includes("BELUM DISAHKAN"), false);
    assert.equal(shown.includes("Versi snapshot 1"), true);
    const printed = jsonBody<ReportPrintDocument>(await send(context.app, "GET", printUrl, sitiToken));
    assert.equal(printed.mode, "OFFICIAL");
    assert.equal(printed.version, 1);
    assert.equal(printed.subjects[0]?.score, "83");
    assert.equal(printed.subjects[0]?.description, DESCRIPTION);

    await context.prisma.formativeScore.update({ where: { formativeAssessmentId_studentId: { formativeAssessmentId: formative.id, studentId: student.id } }, data: { uh: 90 } });
    const again = await send(context.app, "GET", pdfUrl, sitiToken);
    const againText = pdfText(Buffer.from(again.rawPayload));
    assert.equal(againText.includes(DESCRIPTION), true);
    assert.equal(againText.includes("86"), false);
    const after = await context.prisma.reportCardSnapshot.findFirstOrThrow({ where: { id: before.id } });
    assert.equal(JSON.stringify(after.payload), beforePayload);
    assert.equal((await context.prisma.reportCardWorkflow.findFirstOrThrow({ where: { studentId: student.id } })).status, "DISAHKAN");
    assert.equal(await context.prisma.auditLog.count({ where: { schoolId: school.id, action: "REPORT_CARD_PDF_DOWNLOADED" } }), 2);
    assert.equal(await context.prisma.auditLog.count({ where: { schoolId: school.id, action: "REPORT_CARD_PRINTED" } }), 1);
    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { studentId: student.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(90).toString());
    assert.equal(await context.prisma.gradeFinalResult.count({ where: { schoolId: school.id } }), 0);
    assert.equal((await context.prisma.competencyDescription.findFirstOrThrow({ where: { teachingAssignmentId: assignment.id } })).status, "SUBMITTED");
    assert.equal((await context.prisma.homeroomNote.findFirstOrThrow({ where: { studentId: student.id } })).text, "Catatan resmi wali kelas untuk rapor siswa cetak.");
    assert.equal(await context.prisma.dailyAttendance.count({ where: { schoolId: school.id } }), 1);
  });
});

function pdfText(buffer: Buffer): string {
  return [...buffer.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>/g)].map((match) => {
    const hex = match[1] ?? "";
    let text = "";
    for (let index = 0; index + 1 < hex.length; index += 2) text += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    return text;
  }).join("");
}

function sample(mode: "DRAFT" | "OFFICIAL"): ReportPrintDocument {
  return {
    mode,
    schoolName: "SMK Cetak",
    npsn: "10600091",
    address: "Alamat uji",
    curriculumLabel: "Kurikulum Merdeka SMK",
    studentName: "Siswa Cetak",
    nis: "01",
    nisn: "1060009101",
    className: "X TKJ 1",
    fase: "E",
    semester: "Ganjil",
    yearName: "2026/2027",
    periodName: "Ganjil",
    subjects: [{ name: "KJD", category: "KEJURUAN", teacherName: "TOJI", score: "83", description: DESCRIPTION }],
    sakit: "0",
    izin: "0",
    alpa: "0",
    attendanceCompleteness: "Lengkap",
    homeroomNote: "Catatan resmi.",
    pkl: PKL,
    extracurricular: "Pramuka",
    homeroomTeacher: "Siti",
    principalName: "Kepala Uji",
    reportDate: "19 November 2026",
    version: mode === "OFFICIAL" ? 2 : null,
    endorsedAt: mode === "OFFICIAL" ? "19 November 2026 pukul 22.00" : null,
  };
}

async function send(app: FastifyInstance, method: "GET" | "POST" | "PUT", url: string, accessToken: string, payload?: object) {
  return app.inject({ method, url, headers: authHeader(accessToken), payload });
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
