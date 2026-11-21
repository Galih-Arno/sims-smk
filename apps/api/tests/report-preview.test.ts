import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, LoginResponse } from "@sims/shared";
import { Prisma } from "@prisma/client";
import { assessPrintReadiness, type PrintSection } from "../src/modules/academic/report-card/print-readiness.ts";
import { buildReportPreview } from "../src/modules/academic/report-card/preview.ts";
import type { HomeroomReportPrepDto, PreparedStudentReport } from "../src/modules/academic/report-card/types.ts";
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
const SOURCED: PrintSection[] = [
  { key: "pkl", label: "PKL", status: "SIAP", value: "PKL resmi." },
  { key: "extracurricular", label: "Ekstrakurikuler", status: "SIAP", value: "Ekskul resmi." },
  { key: "reportDate", label: "Tanggal rapor", status: "SIAP", value: "19 November 2026" },
];

describe("pemeriksaan siap cetak", () => {
  it("membuka siap cetak hanya bila seluruh komponen wajib valid", () => {
    const ready = assessPrintReadiness(completeStudent(), "TERSEDIA", SOURCED);
    assert.equal(ready.printStatus, "SIAP_CETAK");
    assert.equal(ready.printLabel, "SIAP CETAK");
    assert.deepEqual(ready.blockers, []);

    const missingPkl = assessPrintReadiness(completeStudent(), "TERSEDIA", SOURCED.map((item) => item.key === "pkl" ? { ...item, status: "BELUM_TERSEDIA" as const, value: null } : item));
    assert.equal(missingPkl.printStatus, "DRAF");
    assert.equal(missingPkl.blockers.some((item) => item.includes("PKL")), true);

    const stale = completeStudent();
    stale.subjects[0] = { ...stale.subjects[0]!, description: { status: "PERLU_DITINJAU", text: null } };
    const reviewed = assessPrintReadiness(stale, "TERSEDIA", SOURCED);
    assert.equal(reviewed.printStatus, "DRAF");
    assert.equal(reviewed.blockers.some((item) => item.includes("ditinjau")), true);
  });

  it("tidak menyatakan siap cetak saat PKL, ekstrakurikuler, atau tanggal rapor belum bersumber", () => {
    const preview = buildReportPreview(prepOf(completeStudent()));
    assert.equal(preview.students[0]?.printStatus, "DRAF");
    assert.equal(preview.students[0]?.printLabel, "DRAF / BELUM LENGKAP");
    assert.equal(preview.students[0]?.sections.every((item) => item.status === "BELUM_TERSEDIA" && item.value === null), true);
    assert.equal(preview.students[0]?.subjects[0]?.score, 83);
    assert.equal(preview.students[0]?.subjects[0]?.description.text, "Deskripsi resmi.");
  });
});

describe("Pratinjau rapor Kurikulum Merdeka", { concurrency: 1 }, () => {
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

  it("menampilkan pratinjau X TKJ 1 untuk Siti tanpa nilai atau deskripsi fiktif", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Pratinjau", npsn: "10600041" });
    const other = await createSchool(context.prisma, { name: "SMK Pratinjau Lain", npsn: "10600042" });
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
    const sitiUser = await createUser(context.prisma, { email: "siti.pratinjau@uji.local", name: "Siti", password: PASSWORD });
    const tojiUser = await createUser(context.prisma, { email: "toji.pratinjau@uji.local", name: "TOJI", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.pratinjau.lain@uji.local", name: "Wali Lain", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.pratinjau.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: sitiUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: tojiUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
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
    const student = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1060004101", nis: "01", name: "Siswa Pratinjau", gender: "LAKI_LAKI" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: student.id, uh: 80 } });
    await context.prisma.gradeReportPolicy.create({
      data: {
        schoolId: school.id, academicYearId: year.id, academicPeriodId: period.id, curriculumId: curriculum.id, status: "ACTIVE",
        useFormative: true, useSummative: true, useSts: true, useSas: true, formativeMode: "COMBINED",
        weightFormative: 30, weightSummative: 30, weightSts: 20, weightSas: 20,
        remedialPolicy: "HIGHEST", emptyTreatment: "INCOMPLETE", roundingMode: "INTEGER",
      },
    });
    const description = await context.prisma.competencyDescription.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, status: "DRAFT" } });
    await context.prisma.competencyDescriptionEntry.create({
      data: { schoolId: school.id, descriptionId: description.id, studentId: student.id, text: "Deskripsi draf yang tidak boleh tampil." },
    });
    await context.prisma.homeroomNote.create({
      data: {
        schoolId: school.id, homeroomAssignmentId: homeroom.id, classId: schoolClass.id, studentId: student.id,
        academicYearId: year.id, academicPeriodId: period.id, text: "Catatan draf yang tidak boleh tampil.", status: "DRAFT", createdById: sitiUser.id,
      },
    });

    const tokenSiti = await token(context, sitiUser.email);
    const url = `/api/v1/schools/${school.id}/homeroom-report-preview`;
    const response = await context.app.inject({ method: "GET", url, headers: authHeader(tokenSiti) });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.body.includes("Deskripsi draf yang tidak boleh tampil."), false);
    assert.equal(response.body.includes("Catatan draf yang tidak boleh tampil."), false);
    const body = jsonBody<PreviewBody>(response);
    assert.equal(body.preview?.className, "X TKJ 1");
    assert.equal(body.preview?.composer, "KURIKULUM_MERDEKA_SMK");
    const row = body.preview?.students[0];
    assert.equal(row?.name, "Siswa Pratinjau");
    assert.equal(row?.subjects[0]?.name, "KJD");
    assert.equal(row?.subjects[0]?.teacherName, "TOJI");
    assert.equal(row?.subjects[0]?.score, null);
    assert.equal(row?.subjects[0]?.description.status, "BELUM_TERSEDIA");
    assert.equal(row?.subjects[0]?.description.text, null);
    assert.equal(row?.homeroomNote.status, "BELUM_TERSEDIA");
    assert.equal(row?.attendance.dataStatus, "BELUM_ADA_DATA");
    assert.equal(row?.printStatus, "DRAF");
    assert.equal(row?.printLabel, "DRAF / BELUM LENGKAP");
    assert.equal(row?.sections.find((item) => item.key === "pkl")?.status, "BELUM_TERSEDIA");
    assert.equal(row?.blockers.some((item) => item.includes("SIAP CETAK")), false);

    const guruRead = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, tojiUser.email)) });
    assert.equal(guruRead.statusCode, 403);
    const otherRead = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, otherWaliUser.email)) });
    assert.equal(otherRead.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: student.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
    assert.equal(await context.prisma.gradeFinalResult.count({ where: { schoolId: school.id } }), 0);
    assert.equal(await context.prisma.dailyAttendance.count({ where: { schoolId: school.id } }), 0);
    assert.equal((await context.prisma.competencyDescription.findFirstOrThrow({ where: { id: description.id } })).status, "DRAFT");
    assert.equal((await context.prisma.homeroomNote.findFirstOrThrow({ where: { studentId: student.id } })).status, "DRAFT");
  });
});

type PreviewBody = {
  preview: {
    className: string;
    composer: string | null;
    students: Array<{
      name: string;
      printStatus: string;
      printLabel: string;
      blockers: string[];
      subjects: Array<{ name: string; teacherName: string | null; score: number | null; description: { status: string; text: string | null } }>;
      homeroomNote: { status: string };
      attendance: { dataStatus: string };
      sections: Array<{ key: string; status: string }>;
    }>;
  } | null;
};

function completeStudent(): PreparedStudentReport {
  const field = (key: string, label: string, value: string) => ({ key, label, status: "SIAP" as const, value });
  return {
    studentId: "siswa",
    name: "Siswa Lengkap",
    nis: "01",
    status: "SIAP",
    siap: 1,
    belumLengkap: 0,
    fields: [
      field("school", "Sekolah", "SMK Uji"),
      field("npsn", "NPSN", "10600041"),
      field("address", "Alamat", "Jalan Uji"),
      field("student", "Nama siswa", "Siswa Lengkap"),
      field("nisn", "NISN", "1060004101"),
      field("nis", "NIS", "01"),
      field("year", "Tahun pelajaran", "2026/2027"),
      field("semester", "Semester", "Ganjil"),
      field("class", "Kelas", "X TKJ 1"),
      field("fase", "Fase", "E"),
      field("homeroom", "Wali kelas", "Siti"),
      field("principal", "Kepala sekolah", "Kepala Uji"),
    ],
    subjects: [{
      subjectId: "kjd",
      code: "TKJ001",
      name: "KJD",
      category: "KEJURUAN",
      teacherName: "TOJI",
      gradeStatus: "SIAP",
      score: 83,
      description: { status: "SIAP", text: "Deskripsi resmi." },
    }],
    attendance: {
      completeness: "LENGKAP",
      finalDays: 1,
      verifiedFrom: "2026-11-19",
      verifiedTo: "2026-11-19",
      requiredDays: 1,
      finalRequiredDays: 1,
      openRequiredDays: 0,
      dataStatus: "TERSEDIA",
      sakit: 0,
      izin: 0,
      alpa: 0,
      unverifiedDays: 0,
    },
    homeroomNote: { status: "SIAP", text: "Catatan final." },
  };
}

function prepOf(student: PreparedStudentReport): NonNullable<HomeroomReportPrepDto["prep"]> {
  return {
    homeroomId: "homeroom",
    className: "X TKJ 1",
    periodName: "Ganjil",
    yearName: "2026/2027",
    curriculumLabel: "Kurikulum Merdeka SMK · KUMER · KUMER1",
    composer: "KURIKULUM_MERDEKA_SMK",
    structureStatus: "TERSEDIA",
    attendance: {
      completeness: "LENGKAP",
      finalDays: 1,
      verifiedFrom: "2026-11-19",
      verifiedTo: "2026-11-19",
      requiredDays: 1,
      finalRequiredDays: 1,
      openRequiredDays: 0,
    },
    summary: { students: 1, siap: 1, belumLengkap: 0, belumDikonfigurasi: 0 },
    students: [student],
  };
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
