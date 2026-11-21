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

type ComponentRow = { label: string; state: string; required: boolean };
type StudentRow = { status: string; components: ComponentRow[] };
type SubjectRow = {
  name: string;
  teacherName: string | null;
  gradeStatus: string;
  submissionStatus: string;
  siap: number;
  belumLengkap: number;
  revisions: number;
  students: StudentRow[];
};
type MonitorBody = {
  homerooms: Array<{ id: string }>;
  monitor: {
    policyLabel: string | null;
    summary: { students: number; subjects: number; siap: number; belumLengkap: number; belumDikonfigurasi: number; belumDitugaskan: number; siswaSiap: number; revisi: number };
    subjects: SubjectRow[];
  } | null;
};

describe("Monitoring kelengkapan nilai wali kelas", { concurrency: 1 }, () => {
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

  it("memantau kelengkapan resmi tanpa mengubah nilai atau status pengiriman", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Monitor", npsn: "10500021" });
    const other = await createSchool(context.prisma, { name: "SMK Monitor Lain", npsn: "10500022" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const inactive = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Genap", semesterKind: "GENAP", startDate: new Date("2027-01-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z"), isActive: false },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KM", name: "Kurikulum Merdeka" } });
    const math = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const emptySubject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "BIN", name: "Bahasa Indonesia" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const otherClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 } });
    const guruUser = await createUser(context.prisma, { email: "guru.monitor@uji.local", name: "Guru Monitor", password: PASSWORD });
    const waliUser = await createUser(context.prisma, { email: "wali.monitor@uji.local", name: "Wali Monitor", password: PASSWORD });
    const otherWaliUser = await createUser(context.prisma, { email: "wali.lain.monitor@uji.local", name: "Wali Lain", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.monitor.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: waliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWaliUser.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Monitor", gender: "LAKI_LAKI" } });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: waliUser.id, name: "Wali Monitor", gender: "PEREMPUAN" } });
    const otherWali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: otherWaliUser.id, name: "Wali Lain", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: math.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const homeroom = await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: otherClass.id, academicPeriodId: inactive.id } });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: otherWali.id, classId: otherClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: math.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: emptySubject.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const scope = await context.prisma.materialScope.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "LM1", description: "Lingkup", sequence: 1 },
    });
    const summative = await context.prisma.summativeAssessment.create({ data: { schoolId: school.id, materialScopeId: scope.id } });
    const student = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1050002101", nis: "01", name: "Siswa Monitor", gender: "LAKI_LAKI" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: student.id, uh: 80, remedial: 75 } });
    await context.prisma.summativeScore.create({ data: { schoolId: school.id, summativeAssessmentId: summative.id, studentId: student.id, score: 70 } });
    await context.prisma.termExamScore.create({ data: { schoolId: school.id, teachingAssignmentId: assignment.id, studentId: student.id, sts: 90 } });
    const policy = await context.prisma.gradeReportPolicy.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        academicPeriodId: period.id,
        curriculumId: curriculum.id,
        label: "UJI-MONITOR",
        status: "DRAFT",
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

    const waliToken = await token(context, waliUser.email);
    const url = `/api/v1/schools/${school.id}/homeroom-grade-monitor`;
    const unconfigured = await readMonitor(context, url, waliToken);
    assert.deepEqual(unconfigured.homerooms.map((item) => item.id), [homeroom.id]);
    assert.equal(subject(unconfigured, "Matematika").gradeStatus, "BELUM_DIKONFIGURASI");
    assert.equal(subject(unconfigured, "Bahasa Indonesia").gradeStatus, "BELUM_DITUGASKAN");
    assert.equal(subject(unconfigured, "Bahasa Indonesia").teacherName, null);
    assert.equal(unconfigured.monitor?.summary.siswaSiap, 0);

    await context.prisma.gradeReportPolicy.update({ where: { id: policy.id }, data: { status: "ACTIVE" } });
    const draft = await readMonitor(context, url, waliToken);
    const draftMath = subject(draft, "Matematika");
    assert.equal(draftMath.gradeStatus, "BELUM_LENGKAP");
    assert.equal(draftMath.submissionStatus, "DRAFT");
    assert.equal(draftMath.belumLengkap, 1);
    assert.equal(draftMath.siap, 0);
    assert.equal(draftMath.students[0]?.status, "BELUM_LENGKAP");
    assert.equal(component(draftMath, "TP1 · UH")?.state, "DRAFT");
    assert.equal(component(draftMath, "TP1 · Remedial")?.required, false);
    assert.equal(component(draftMath, "TP1 · Tugas 2"), undefined);
    assert.equal(component(draftMath, "LM1 · Sumatif")?.state, "DRAFT");
    assert.equal(component(draftMath, "SAS")?.state, "KOSONG");
    assert.equal(draft.monitor?.policyLabel, "UJI-MONITOR");
    assert.equal(draft.monitor?.summary.siswaSiap, 0);

    const revision = await context.prisma.gradeComponentSubmission.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, componentKey: `f:uh:${objective.id}`, kind: "FORMATIVE", field: "UH", status: "REVISION_REQUESTED" },
    });
    const waiting = await readMonitor(context, url, waliToken);
    const waitingMath = subject(waiting, "Matematika");
    assert.equal(waitingMath.submissionStatus, "REVISION_REQUESTED");
    assert.equal(waitingMath.revisions, 1);
    assert.equal(component(waitingMath, "TP1 · UH")?.state, "REVISION_REQUESTED");
    assert.equal(waiting.monitor?.summary.revisi, 1);
    assert.equal(waitingMath.students[0]?.status, "BELUM_LENGKAP");

    await context.prisma.gradeComponentSubmission.update({ where: { id: revision.id }, data: { status: "SUBMITTED" } });
    await markSubmitted(context, school.id, assignment.id, scope.id);
    const missingSas = await readMonitor(context, url, waliToken);
    assert.equal(subject(missingSas, "Matematika").students[0]?.status, "BELUM_LENGKAP");
    assert.equal(component(subject(missingSas, "Matematika"), "SAS")?.state, "KOSONG");
    assert.equal(component(subject(missingSas, "Matematika"), "TP1 · UH")?.state, "SUBMITTED");

    await context.prisma.termExamScore.update({
      where: { teachingAssignmentId_studentId: { teachingAssignmentId: assignment.id, studentId: student.id } },
      data: { sas: 100 },
    });
    const ready = await readMonitor(context, url, waliToken);
    const readyMath = subject(ready, "Matematika");
    assert.equal(readyMath.gradeStatus, "SIAP");
    assert.equal(readyMath.siap, 1);
    assert.equal(readyMath.submissionStatus, "SUBMITTED");
    assert.equal(component(readyMath, "TP1 · Remedial")?.state, "DRAFT");
    assert.equal(subject(ready, "Bahasa Indonesia").gradeStatus, "BELUM_DITUGASKAN");
    assert.equal(ready.monitor?.summary.siap, 1);
    assert.equal(ready.monitor?.summary.belumDitugaskan, 1);
    assert.equal(ready.monitor?.summary.siswaSiap, 0);

    const guruRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, guruUser.email)) });
    assert.equal(guruRead.statusCode, 403);
    const otherRead = await context.app.inject({ method: "GET", url: `${url}?homeroomId=${homeroom.id}`, headers: authHeader(await token(context, otherWaliUser.email)) });
    assert.equal(otherRead.statusCode, 403);
    const neighborRead = await context.app.inject({ method: "GET", url, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");

    const uh = await context.prisma.formativeScore.findFirstOrThrow({ where: { formativeAssessmentId: formative.id, studentId: student.id } });
    assert.equal(uh.uh?.toString(), new Prisma.Decimal(80).toString());
    const storedRevision = await context.prisma.gradeComponentSubmission.findUniqueOrThrow({ where: { id: revision.id } });
    assert.equal(storedRevision.status, "SUBMITTED");
  });

  it("menandai tugas terpisah yang kosong tanpa mewajibkan remedial", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Monitor Pisah", npsn: "10500023" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const curriculum = await context.prisma.curriculum.create({ data: { schoolId: school.id, academicYearId: year.id, code: "KM", name: "Kurikulum Merdeka" } });
    const subjectRow = await context.prisma.subject.create({ data: { schoolId: school.id, code: "PKN", name: "Pendidikan Pancasila" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 3", gradeLevel: 10 } });
    const user = await createUser(context.prisma, { email: "wali.pisah@uji.local", name: "Wali Pisah", password: PASSWORD });
    const guruUser = await createUser(context.prisma, { email: "guru.pisah@uji.local", name: "Guru Pisah", password: PASSWORD });
    await assignRole(context.prisma, { userId: user.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    const wali = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: user.id, name: "Wali Pisah", gender: "PEREMPUAN" } });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Pisah", gender: "LAKI_LAKI" } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subjectRow.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: wali.id, classId: schoolClass.id, academicPeriodId: period.id } });
    await context.prisma.curriculumPlacement.create({ data: { schoolId: school.id, curriculumId: curriculum.id, classId: schoolClass.id, subjectId: subjectRow.id } });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, curriculumId: curriculum.id, code: "TP1", description: "Tujuan", sequence: 1 },
    });
    const formative = await context.prisma.formativeAssessment.create({ data: { schoolId: school.id, learningObjectiveId: objective.id } });
    const student = await context.prisma.student.create({ data: { schoolId: school.id, classId: schoolClass.id, nisn: "1050002301", nis: "01", name: "Siswa Pisah", gender: "LAKI_LAKI" } });
    await context.prisma.formativeScore.create({ data: { schoolId: school.id, formativeAssessmentId: formative.id, studentId: student.id, uh: 80 } });
    await context.prisma.gradeReportPolicy.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        academicPeriodId: period.id,
        curriculumId: curriculum.id,
        status: "ACTIVE",
        useFormative: true,
        useSummative: false,
        useSts: false,
        useSas: false,
        formativeMode: "SEPARATE",
        weightUh: 25,
        weightT1: 25,
        weightT2: 25,
        weightT3: 25,
        remedialPolicy: "HIGHEST",
        emptyTreatment: "INCOMPLETE",
        roundingMode: "INTEGER",
      },
    });

    const body = await readMonitor(context, `/api/v1/schools/${school.id}/homeroom-grade-monitor`, await token(context, user.email));
    const row = subject(body, "Pendidikan Pancasila");
    assert.equal(component(row, "TP1 · UH")?.state, "DRAFT");
    assert.equal(component(row, "TP1 · Tugas 2")?.state, "KOSONG");
    assert.equal(component(row, "TP1 · Tugas 2")?.required, true);
    assert.equal(component(row, "TP1 · Remedial"), undefined);
    assert.equal(row.students[0]?.status, "BELUM_LENGKAP");
  });
});

function subject(body: MonitorBody, name: string): SubjectRow {
  const found = body.monitor?.subjects.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

function component(row: SubjectRow, label: string): ComponentRow | undefined {
  return row.students[0]?.components.find((item) => item.label === label);
}

async function markSubmitted(context: TestContext, schoolId: string, assignmentId: string, scopeId: string) {
  const rows = [
    { componentKey: `s:${scopeId}`, kind: "SUMMATIVE" as const, field: "SCORE" as const },
    { componentKey: "sts", kind: "STS" as const, field: "STS" as const },
    { componentKey: "sas", kind: "SAS" as const, field: "SAS" as const },
  ];
  for (const row of rows) {
    await context.prisma.gradeComponentSubmission.create({
      data: { schoolId, teachingAssignmentId: assignmentId, ...row, status: "SUBMITTED" },
    });
  }
}

async function readMonitor(context: TestContext, url: string, accessToken: string): Promise<MonitorBody> {
  const response = await context.app.inject({ method: "GET", url, headers: authHeader(accessToken) });
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<MonitorBody>(response);
}

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
