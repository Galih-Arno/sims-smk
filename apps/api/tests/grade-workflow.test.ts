import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, GradeSheetDto, GradeWorkflowListDto, LoginResponse } from "@sims/shared";
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

async function tokenFor(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}

function component(sheet: GradeSheetDto, key: string) {
  const found = sheet.components.find((item) => item.key === key);
  assert.ok(found, key);
  return found;
}

describe("Pengiriman nilai per komponen", { concurrency: 1 }, () => {
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

  it("mengunci hanya komponen yang dikirim dan menyerahkan revisi ke wali kelas", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Komponen", npsn: "20124031" });
    const other = await createSchool(context.prisma, { name: "SMK Komponen Lain", npsn: "20124032" });
    const guru = await createUser(context.prisma, { email: "guru.komponen@sekolah.test", name: "Guru Komponen", password: PASSWORD });
    const otherGuru = await createUser(context.prisma, { email: "guru.komponen.lain@sekolah.test", name: "Guru Lain", password: PASSWORD });
    const wali = await createUser(context.prisma, { email: "wali.komponen@sekolah.test", name: "Wali Komponen", password: PASSWORD });
    const otherWali = await createUser(context.prisma, { email: "wali.komponen.lain@sekolah.test", name: "Wali Lain", password: PASSWORD });
    const wakakur = await createUser(context.prisma, { email: "wakakur.komponen@sekolah.test", name: "Wakakur Komponen", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.komponen.lain@sekolah.test", name: "Admin Tetangga", password: PASSWORD });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherGuru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: wali.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: otherWali.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakur.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });

    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), isActive: true },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "2026/2027 Ganjil",
        semesterKind: "GANJIL",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
      },
    });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const classRow = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 },
    });
    const otherClass = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 },
    });
    const teacher = await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Guru Komponen", gender: "LAKI_LAKI", userId: guru.id },
    });
    const waliTeacher = await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Wali Komponen", gender: "PEREMPUAN", userId: wali.id },
    });
    const otherWaliTeacher = await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Wali Lain", gender: "LAKI_LAKI", userId: otherWali.id },
    });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: teacher.id, subjectId: subject.id, classId: classRow.id, academicPeriodId: period.id },
    });
    await context.prisma.homeroomAssignment.create({
      data: { schoolId: school.id, teacherId: waliTeacher.id, classId: classRow.id, academicPeriodId: period.id },
    });
    await context.prisma.homeroomAssignment.create({
      data: { schoolId: school.id, teacherId: otherWaliTeacher.id, classId: otherClass.id, academicPeriodId: period.id },
    });
    const student = await context.prisma.student.create({
      data: { schoolId: school.id, nisn: "3234567890", name: "Siswa Satu", gender: "PEREMPUAN", classId: classRow.id },
    });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, code: "TP1", description: "Memahami konsep", sequence: 1 },
    });
    const uhKey = `f:uh:${objective.id}`;
    const t1Key = `f:t1:${objective.id}`;
    const t2Key = `f:t2:${objective.id}`;
    const t3Key = `f:t3:${objective.id}`;

    const guruToken = await tokenFor(context, guru.email);
    const otherToken = await tokenFor(context, otherGuru.email);
    const waliToken = await tokenFor(context, wali.email);
    const otherWaliToken = await tokenFor(context, otherWali.email);
    const wakakurToken = await tokenFor(context, wakakur.email);
    const neighborToken = await tokenFor(context, neighbor.email);
    const url = `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/scores`;

    const draft = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 80, t1: 70 }] },
    });
    assert.equal(draft.statusCode, 200, draft.body);
    const draftSheet = jsonBody<{ sheet: GradeSheetDto }>(draft).sheet;
    assert.equal(component(draftSheet, uhKey).status, "DRAFT");
    assert.equal(component(draftSheet, uhKey).filled, 1);
    assert.equal(component(draftSheet, t1Key).status, "DRAFT");
    assert.equal(draftSheet.formative[0]?.cells[0]?.uh, 80);
    assert.equal(draftSheet.formative[0]?.cells[0]?.t1, 70);
    assert.equal(draftSheet.recipientName, "Wali Komponen");

    const emptySubmit = await context.app.inject({
      method: "POST",
      url: `${url}/submit`,
      headers: authHeader(guruToken),
      payload: { componentKey: t2Key },
    });
    assert.equal(emptySubmit.statusCode, 400, emptySubmit.body);

    const submitUh = await context.app.inject({
      method: "POST",
      url: `${url}/submit`,
      headers: authHeader(guruToken),
      payload: { componentKey: uhKey },
    });
    assert.equal(submitUh.statusCode, 200, submitUh.body);
    const uhSheet = jsonBody<{ sheet: GradeSheetDto }>(submitUh).sheet;
    assert.equal(component(uhSheet, uhKey).status, "SUBMITTED");
    assert.equal(component(uhSheet, uhKey).locked, true);
    assert.equal(component(uhSheet, t1Key).status, "DRAFT");
    assert.equal(component(uhSheet, t2Key).status, "DRAFT");
    assert.equal(component(uhSheet, t3Key).status, "DRAFT");
    assert.equal(uhSheet.formative[0]?.cells[0]?.uh, 80);
    assert.equal(uhSheet.formative[0]?.cells[0]?.t1, 70);

    const lockedUh = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 90 }] },
    });
    assert.equal(lockedUh.statusCode, 409);
    assert.equal(jsonBody<ApiErrorBody>(lockedUh).error.code, "GRADE_LOCKED");

    const saveT1 = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, t1: 71 }] },
    });
    assert.equal(saveT1.statusCode, 200, saveT1.body);
    assert.equal(jsonBody<{ sheet: GradeSheetDto }>(saveT1).sheet.formative[0]?.cells[0]?.uh, 80);
    assert.equal(jsonBody<{ sheet: GradeSheetDto }>(saveT1).sheet.formative[0]?.cells[0]?.t1, 71);

    const submitT1 = await context.app.inject({
      method: "POST",
      url: `${url}/submit`,
      headers: authHeader(guruToken),
      payload: { componentKey: t1Key },
    });
    assert.equal(submitT1.statusCode, 200, submitT1.body);
    const both = jsonBody<{ sheet: GradeSheetDto }>(submitT1).sheet;
    assert.equal(component(both, uhKey).status, "SUBMITTED");
    assert.equal(component(both, t1Key).status, "SUBMITTED");
    assert.equal(both.formative[0]?.cells[0]?.uh, 80);

    const otherSubmit = await context.app.inject({
      method: "POST",
      url: `${url}/submit`,
      headers: authHeader(otherToken),
      payload: { componentKey: t2Key },
    });
    assert.equal(otherSubmit.statusCode, 403);
    const otherSchool = await context.app.inject({
      method: "POST",
      url: `${url}/submit`,
      headers: authHeader(neighborToken),
      payload: { componentKey: uhKey },
    });
    assert.equal(otherSchool.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(otherSchool).error.code, "TENANT_FORBIDDEN");

    const revision = await context.app.inject({
      method: "POST",
      url: `${url}/revision-request`,
      headers: authHeader(guruToken),
      payload: { componentKey: uhKey, reason: "UH perlu diperbaiki karena salah input." },
    });
    assert.equal(revision.statusCode, 200, revision.body);
    const revised = jsonBody<{ sheet: GradeSheetDto }>(revision).sheet;
    assert.equal(component(revised, uhKey).status, "REVISION_REQUESTED");
    assert.equal(component(revised, t1Key).status, "SUBMITTED");
    assert.equal(revised.formative[0]?.cells[0]?.uh, 80);
    assert.equal(revised.formative[0]?.cells[0]?.t1, 71);

    const wakakurDecision = await context.app.inject({
      method: "POST",
      url: `${url}/revision-decision`,
      headers: authHeader(wakakurToken),
      payload: { componentKey: uhKey, decision: "approve" },
    });
    assert.equal(wakakurDecision.statusCode, 403);
    const otherWaliDecision = await context.app.inject({
      method: "POST",
      url: `${url}/revision-decision`,
      headers: authHeader(otherWaliToken),
      payload: { componentKey: uhKey, decision: "approve" },
    });
    assert.equal(otherWaliDecision.statusCode, 403);

    const rejected = await context.app.inject({
      method: "POST",
      url: `${url}/revision-decision`,
      headers: authHeader(waliToken),
      payload: { componentKey: uhKey, decision: "reject", note: "Nilai UH tetap." },
    });
    assert.equal(rejected.statusCode, 200, rejected.body);
    const rejectedSheet = jsonBody<{ sheet: GradeSheetDto }>(rejected).sheet;
    assert.equal(component(rejectedSheet, uhKey).status, "SUBMITTED");
    assert.equal(component(rejectedSheet, t1Key).status, "SUBMITTED");
    assert.equal(rejectedSheet.formative[0]?.cells[0]?.uh, 80);

    const revisionAgain = await context.app.inject({
      method: "POST",
      url: `${url}/revision-request`,
      headers: authHeader(guruToken),
      payload: { componentKey: uhKey, reason: "Masih perlu membuka UH saja." },
    });
    assert.equal(revisionAgain.statusCode, 200, revisionAgain.body);
    const approved = await context.app.inject({
      method: "POST",
      url: `${url}/revision-decision`,
      headers: authHeader(waliToken),
      payload: { componentKey: uhKey, decision: "approve" },
    });
    assert.equal(approved.statusCode, 200, approved.body);
    const opened = jsonBody<{ sheet: GradeSheetDto }>(approved).sheet;
    assert.equal(component(opened, uhKey).status, "DRAFT");
    assert.equal(component(opened, t1Key).status, "SUBMITTED");
    assert.equal(opened.formative[0]?.cells[0]?.uh, 80);
    assert.equal(opened.formative[0]?.cells[0]?.t1, 71);

    const saveUh = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 81 }] },
    });
    assert.equal(saveUh.statusCode, 200, saveUh.body);
    assert.equal(jsonBody<{ sheet: GradeSheetDto }>(saveUh).sheet.formative[0]?.cells[0]?.t1, 71);

    const saveT2 = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, t2: 60 }] },
    });
    assert.equal(saveT2.statusCode, 200, saveT2.body);
    await context.prisma.homeroomAssignment.deleteMany({ where: { classId: classRow.id } });
    const held = await context.app.inject({
      method: "POST",
      url: `${url}/submit`,
      headers: authHeader(guruToken),
      payload: { componentKey: t2Key },
    });
    assert.equal(held.statusCode, 409);
    assert.equal(jsonBody<ApiErrorBody>(held).error.code, "SUBMISSION_HELD");
    const heldSheet = await context.app.inject({ method: "GET", url, headers: authHeader(guruToken) });
    const afterHold = jsonBody<{ sheet: GradeSheetDto }>(heldSheet).sheet;
    assert.equal(component(afterHold, t2Key).status, "DRAFT");
    assert.equal(afterHold.formative[0]?.cells[0]?.t2, 60);
    assert.equal(afterHold.formative[0]?.cells[0]?.uh, 81);
    assert.match(afterHold.submissionHold ?? "", /pengiriman ditahan/i);

    const audits = await context.prisma.auditLog.findMany({
      where: { schoolId: school.id, entityType: "GradeComponentSubmission" },
      orderBy: { createdAt: "asc" },
      select: { action: true, metadata: true },
    });
    assert.deepEqual(
      audits.map((item) => item.action),
      ["GRADE_SUBMITTED", "GRADE_SUBMITTED", "GRADE_REVISION_REQUESTED", "GRADE_REVISION_REJECTED", "GRADE_REVISION_REQUESTED", "GRADE_REVISION_APPROVED"],
    );
    const keys = audits.map((item) => (item.metadata as { componentKey?: string }).componentKey);
    assert.deepEqual(keys, [uhKey, t1Key, uhKey, uhKey, uhKey, uhKey]);

    const staff = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=staff`,
      headers: authHeader(wakakurToken),
    });
    assert.equal(staff.statusCode, 200, staff.body);
    const staffItems = jsonBody<{ workflows: GradeWorkflowListDto }>(staff).workflows.items;
    assert.equal(staffItems.some((item) => item.components.some((entry) => entry.canDecide)), false);
  });

  it("menahan status lama yang ambigu dan tidak membuka nilainya", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Lama", npsn: "20124041" });
    const guru = await createUser(context.prisma, { email: "guru.lama@sekolah.test", name: "Guru Lama", password: PASSWORD });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), isActive: true },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "2026/2027 Ganjil",
        semesterKind: "GANJIL",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
      },
    });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "KJD", name: "KJD" } });
    const classRow = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 },
    });
    const teacher = await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Guru Lama", gender: "LAKI_LAKI", userId: guru.id },
    });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: teacher.id, subjectId: subject.id, classId: classRow.id, academicPeriodId: period.id },
    });
    const student = await context.prisma.student.create({
      data: { schoolId: school.id, nisn: "4234567890", name: "Siswa Lama", gender: "LAKI_LAKI", classId: classRow.id },
    });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, code: "TP1", description: "Lama", sequence: 1 },
    });
    const token = await tokenFor(context, guru.email);
    const url = `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/scores`;
    const saved = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(token),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 55, t1: 40 }] },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    await context.prisma.gradeSubmission.create({
      data: {
        schoolId: school.id,
        teachingAssignmentId: assignment.id,
        status: "REVISION_REQUESTED",
        revisionReason: "salah input",
        submittedAt: new Date(),
        revisionRequestedAt: new Date(),
      },
    });
    const locked = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(token),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, t1: 41 }] },
    });
    assert.equal(locked.statusCode, 409);
    assert.equal(jsonBody<ApiErrorBody>(locked).error.code, "GRADE_LOCKED");
    const sheet = jsonBody<{ sheet: GradeSheetDto }>(await context.app.inject({ method: "GET", url, headers: authHeader(token) })).sheet;
    assert.equal(sheet.legacyLock?.status, "REVISION_REQUESTED");
    assert.equal(sheet.formative[0]?.cells[0]?.uh, 55);
    assert.equal(sheet.formative[0]?.cells[0]?.t1, 40);
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id } }), 0);
  });

  it("menampilkan penerimaan wali sesuai penugasan aktif tanpa membuat wali otomatis", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Wali", npsn: "20124021" });
    const other = await createSchool(context.prisma, { name: "SMK Wali Lain", npsn: "20124022" });
    const mapel = await createUser(context.prisma, { email: "guru.wali.nilai@sekolah.test", name: "Guru Mapel", password: PASSWORD });
    const wali = await createUser(context.prisma, { email: "wali.nilai@sekolah.test", name: "Wali Aktif", password: PASSWORD });
    const emptyWali = await createUser(context.prisma, { email: "wali.kosong@sekolah.test", name: "Wali Kosong", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "wali.tetangga@sekolah.test", name: "Wali Tetangga", password: PASSWORD });
    await assignRole(context.prisma, { userId: mapel.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: wali.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: emptyWali.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "WALI_KELAS", schoolId: other.id });

    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), isActive: true },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "2026/2027 Ganjil",
        semesterKind: "GANJIL",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
      },
    });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "BIN", name: "Bahasa Indonesia" } });
    const ownClass = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 },
    });
    const otherClass = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 2", gradeLevel: 10 },
    });
    const teacher = await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Guru Mapel", gender: "PEREMPUAN", userId: mapel.id },
    });
    const waliTeacher = await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Wali Aktif", gender: "LAKI_LAKI", userId: wali.id },
    });
    await context.prisma.teacher.create({
      data: { schoolId: school.id, name: "Wali Kosong", gender: "PEREMPUAN", userId: emptyWali.id },
    });
    const ownAssignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: teacher.id, subjectId: subject.id, classId: ownClass.id, academicPeriodId: period.id },
    });
    await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: teacher.id, subjectId: subject.id, classId: otherClass.id, academicPeriodId: period.id },
    });
    await context.prisma.homeroomAssignment.create({
      data: { schoolId: school.id, teacherId: waliTeacher.id, classId: ownClass.id, academicPeriodId: period.id },
    });

    const waliToken = await tokenFor(context, wali.email);
    const emptyToken = await tokenFor(context, emptyWali.email);
    const neighborToken = await tokenFor(context, neighbor.email);
    const guruToken = await tokenFor(context, mapel.email);

    const before = await context.prisma.homeroomAssignment.count({ where: { schoolId: school.id } });
    const missing = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=wali`,
      headers: authHeader(emptyToken),
    });
    assert.equal(missing.statusCode, 200, missing.body);
    const missingBody = jsonBody<{ workflows: GradeWorkflowListDto }>(missing).workflows;
    assert.equal(missingBody.homeroomMissing, true);
    assert.match(missingBody.message ?? "", /tidak dibuat otomatis/);
    assert.equal(missingBody.items.length, 0);
    assert.equal(await context.prisma.homeroomAssignment.count({ where: { schoolId: school.id } }), before);

    const received = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=wali`,
      headers: authHeader(waliToken),
    });
    assert.equal(received.statusCode, 200, received.body);
    const items = jsonBody<{ workflows: GradeWorkflowListDto }>(received).workflows.items;
    assert.deepEqual(items.map((item) => item.assignmentId), [ownAssignment.id]);
    assert.ok(items[0]?.components.every((item) => item.status === "DRAFT" && item.canDecide === false));

    const guruList = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=guru`,
      headers: authHeader(guruToken),
    });
    assert.equal(guruList.statusCode, 200, guruList.body);
    assert.equal(jsonBody<{ workflows: GradeWorkflowListDto }>(guruList).workflows.items.length, 2);

    const isolated = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=wali`,
      headers: authHeader(neighborToken),
    });
    assert.equal(isolated.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(isolated).error.code, "TENANT_FORBIDDEN");
  });

  it("menyelesaikan status lama hanya setelah konfirmasi admin dan tetap mengunci komponen terkirim", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Legacy", npsn: "20124051" });
    const other = await createSchool(context.prisma, { name: "SMK Legacy Lain", npsn: "20124052" });
    const guru = await createUser(context.prisma, { email: "guru.legacy@sekolah.test", name: "Guru Legacy", password: PASSWORD });
    const admin = await createUser(context.prisma, { email: "admin.legacy@sekolah.test", name: "Admin Legacy", password: PASSWORD });
    const wakakur = await createUser(context.prisma, { email: "wakakur.legacy@sekolah.test", name: "Wakakur Legacy", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.legacy.lain@sekolah.test", name: "Admin Legacy Lain", password: PASSWORD });
    const wali = await createUser(context.prisma, { email: "wali.legacy@sekolah.test", name: "Wali Legacy", password: PASSWORD });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakur.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    await assignRole(context.prisma, { userId: wali.id, roleCode: "WALI_KELAS", schoolId: school.id });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), isActive: true },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "2026/2027 Ganjil",
        semesterKind: "GANJIL",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
      },
    });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "KJD", name: "KJD" } });
    const classRow = await context.prisma.schoolClass.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 },
    });
    const teacher = await context.prisma.teacher.create({ data: { schoolId: school.id, name: "Guru Legacy", gender: "LAKI_LAKI", userId: guru.id } });
    const waliTeacher = await context.prisma.teacher.create({ data: { schoolId: school.id, name: "Wali Legacy", gender: "PEREMPUAN", userId: wali.id } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: teacher.id, subjectId: subject.id, classId: classRow.id, academicPeriodId: period.id },
    });
    const student = await context.prisma.student.create({
      data: { schoolId: school.id, nisn: "5234567890", name: "Siswa Legacy", gender: "LAKI_LAKI", classId: classRow.id },
    });
    const objective = await context.prisma.learningObjective.create({
      data: { schoolId: school.id, teachingAssignmentId: assignment.id, code: "TP1", description: "Legacy", sequence: 1 },
    });
    const guruToken = await tokenFor(context, guru.email);
    const adminToken = await tokenFor(context, admin.email);
    const wakakurToken = await tokenFor(context, wakakur.email);
    const neighborToken = await tokenFor(context, neighbor.email);
    const waliToken = await tokenFor(context, wali.email);
    const url = `/api/v1/schools/${school.id}/teaching-assignments/${assignment.id}/scores`;
    const uhKey = `f:uh:${objective.id}`;
    const t1Key = `f:t1:${objective.id}`;
    assert.equal((await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 67, t1: 40 }] },
    })).statusCode, 200);
    const legacy = await context.prisma.gradeSubmission.create({
      data: {
        schoolId: school.id,
        teachingAssignmentId: assignment.id,
        status: "REVISION_REQUESTED",
        revisionReason: "salah input",
        submittedAt: new Date(),
        revisionRequestedAt: new Date(),
      },
    });
    const held = await context.prisma.gradeComponentSubmission.create({
      data: {
        schoolId: school.id,
        teachingAssignmentId: assignment.id,
        componentKey: "s:held",
        kind: "SUMMATIVE",
        field: "SCORE",
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    const blockedResolve = await context.app.inject({
      method: "POST",
      url: `${url}/resolve-legacy`,
      headers: authHeader(adminToken),
      payload: { confirm: true, note: "Komponen terkirim tidak boleh ditebak." },
    });
    assert.equal(blockedResolve.statusCode, 409, blockedResolve.body);
    assert.equal((await context.prisma.gradeComponentSubmission.findUnique({ where: { id: held.id } }))?.status, "SUBMITTED");
    assert.equal((await context.prisma.gradeSubmission.findUnique({ where: { id: legacy.id } }))?.legacyResolvedAt, null);
    await context.prisma.gradeComponentSubmission.delete({ where: { id: held.id } });

    const stillLocked = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 68 }] },
    });
    assert.equal(stillLocked.statusCode, 409);
    for (const [token, code] of [
      [guruToken, "FORBIDDEN"],
      [wakakurToken, "FORBIDDEN"],
      [neighborToken, "TENANT_FORBIDDEN"],
    ] as const) {
      const denied = await context.app.inject({
        method: "POST",
        url: `${url}/resolve-legacy`,
        headers: authHeader(token),
        payload: { confirm: true, note: "Percobaan tanpa wewenang admin." },
      });
      assert.equal(denied.statusCode, 403, denied.body);
      assert.equal(jsonBody<ApiErrorBody>(denied).error.code, code);
    }
    const unconfirmed = await context.app.inject({
      method: "POST",
      url: `${url}/resolve-legacy`,
      headers: authHeader(adminToken),
      payload: { confirm: false, note: "Belum dikonfirmasi oleh admin." },
    });
    assert.equal(unconfirmed.statusCode, 400, unconfirmed.body);

    const staffBefore = jsonBody<{ workflows: GradeWorkflowListDto }>(await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=staff`,
      headers: authHeader(adminToken),
    })).workflows.items.find((item) => item.assignmentId === assignment.id);
    assert.equal(staffBefore?.canResolveLegacy, true);
    const wakakurList = jsonBody<{ workflows: GradeWorkflowListDto }>(await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=staff`,
      headers: authHeader(wakakurToken),
    })).workflows.items.find((item) => item.assignmentId === assignment.id);
    assert.equal(wakakurList?.canResolveLegacy, false);

    const resolved = await context.app.inject({
      method: "POST",
      url: `${url}/resolve-legacy`,
      headers: authHeader(adminToken),
      payload: { confirm: true, note: "Status lama diselesaikan tanpa membuka komponen terkirim." },
    });
    assert.equal(resolved.statusCode, 200, resolved.body);
    const opened = jsonBody<{ sheet: GradeSheetDto }>(resolved).sheet;
    assert.equal(opened.legacyLock, null);
    assert.equal(component(opened, uhKey).status, "DRAFT");
    assert.equal(component(opened, t1Key).status, "DRAFT");
    assert.equal(opened.formative[0]?.cells[0]?.uh, 67);
    assert.equal(opened.formative[0]?.cells[0]?.t1, 40);
    const stored = await context.prisma.gradeSubmission.findUnique({ where: { id: legacy.id } });
    assert.equal(stored?.status, "REVISION_REQUESTED");
    assert.ok(stored?.legacyResolvedAt);
    assert.equal(await context.prisma.gradeComponentSubmission.count({ where: { teachingAssignmentId: assignment.id } }), 0);

    const edited = await context.app.inject({
      method: "PATCH",
      url,
      headers: authHeader(guruToken),
      payload: { formative: [{ learningObjectiveId: objective.id, studentId: student.id, uh: 68 }] },
    });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(jsonBody<{ sheet: GradeSheetDto }>(edited).sheet.formative[0]?.cells[0]?.t1, 40);
    await context.prisma.homeroomAssignment.create({
      data: { schoolId: school.id, teacherId: waliTeacher.id, classId: classRow.id, academicPeriodId: period.id },
    });
    const submitted = await context.app.inject({
      method: "POST",
      url: `${url}/submit`,
      headers: authHeader(guruToken),
      payload: { componentKey: uhKey },
    });
    assert.equal(submitted.statusCode, 200, submitted.body);
    const sent = jsonBody<{ sheet: GradeSheetDto }>(submitted).sheet;
    assert.equal(component(sent, uhKey).status, "SUBMITTED");
    assert.equal(component(sent, t1Key).status, "DRAFT");
    assert.equal(component(sent, `f:t2:${objective.id}`).status, "DRAFT");
    assert.equal(component(sent, `f:t3:${objective.id}`).status, "DRAFT");
    assert.equal(sent.formative[0]?.cells[0]?.uh, 68);
    const waliInbox = jsonBody<{ workflows: GradeWorkflowListDto }>(await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-workflows?view=wali`,
      headers: authHeader(waliToken),
    })).workflows.items.find((item) => item.assignmentId === assignment.id);
    assert.equal(waliInbox?.components.find((item) => item.key === uhKey)?.status, "SUBMITTED");
    assert.equal(waliInbox?.components.find((item) => item.key === t1Key)?.status, "DRAFT");
    const revision = await context.app.inject({
      method: "POST",
      url: `${url}/revision-request`,
      headers: authHeader(guruToken),
      payload: { componentKey: uhKey, reason: "UH TP1 perlu diperbaiki sendiri." },
    });
    assert.equal(revision.statusCode, 200, revision.body);
    const approved = await context.app.inject({
      method: "POST",
      url: `${url}/revision-decision`,
      headers: authHeader(waliToken),
      payload: { componentKey: uhKey, decision: "approve", note: "UH dibuka kembali." },
    });
    assert.equal(approved.statusCode, 200, approved.body);
    const after = jsonBody<{ sheet: GradeSheetDto }>(approved).sheet;
    assert.equal(component(after, uhKey).status, "DRAFT");
    assert.equal(component(after, t1Key).status, "DRAFT");
    assert.equal(after.formative[0]?.cells[0]?.uh, 68);
    assert.equal(after.formative[0]?.cells[0]?.t1, 40);
    const audit = await context.prisma.auditLog.findMany({
      where: { schoolId: school.id, action: { in: ["GRADE_LEGACY_RESOLVED", "GRADE_SUBMITTED", "GRADE_REVISION_REQUESTED", "GRADE_REVISION_APPROVED"] } },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(audit.map((item) => item.action), ["GRADE_LEGACY_RESOLVED", "GRADE_SUBMITTED", "GRADE_REVISION_REQUESTED", "GRADE_REVISION_APPROVED"]);
    assert.equal(audit[0]?.entityType, "GradeSubmission");
    assert.equal(audit[0]?.entityId, legacy.id);
  });
});
