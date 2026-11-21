import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, LoginResponse, SchoolDto } from "@sims/shared";
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

describe("Status akses sekolah", { concurrency: 1 }, () => {
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

  it("menonaktifkan dan menangguhkan sekolah tanpa menghapus data, lalu mengaktifkan kembali", async () => {
    const closed = await createSchool(context.prisma, { name: "SMK Status Uji", npsn: "40100021" });
    const open = await createSchool(context.prisma, { name: "SMK Status Lain", npsn: "40100022" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: closed.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: closed.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const schoolClass = await context.prisma.schoolClass.create({
      data: { schoolId: closed.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 },
    });
    const subject = await context.prisma.subject.create({
      data: { schoolId: closed.id, code: "MTK", name: "Matematika" },
    });
    const teacher = await context.prisma.teacher.create({
      data: { schoolId: closed.id, name: "Guru Status", gender: "LAKI_LAKI" },
    });
    const student = await context.prisma.student.create({
      data: { schoolId: closed.id, nisn: "4010002101", name: "Siswa Status", gender: "PEREMPUAN", classId: schoolClass.id },
    });
    const teaching = await context.prisma.teachingAssignment.create({
      data: { schoolId: closed.id, teacherId: teacher.id, subjectId: subject.id, classId: schoolClass.id, academicPeriodId: period.id },
    });
    const owner = await createUser(context.prisma, { email: "owner.status@uji.local", name: "Pemilik Status", password: PASSWORD });
    const admin = await createUser(context.prisma, { email: "admin.status@uji.local", name: "Admin Status", password: PASSWORD });
    const guru = await createUser(context.prisma, { email: "guru.status@uji.local", name: "Guru Status", password: PASSWORD });
    const both = await createUser(context.prisma, { email: "multi.status@uji.local", name: "Multi Status", password: PASSWORD });
    await assignRole(context.prisma, { userId: owner.id, roleCode: "SYSTEM_OWNER", schoolId: null });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: closed.id });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: closed.id });
    await assignRole(context.prisma, { userId: both.id, roleCode: "ADMIN_SEKOLAH", schoolId: closed.id });
    await assignRole(context.prisma, { userId: both.id, roleCode: "ADMIN_SEKOLAH", schoolId: open.id });

    const ownerToken = await tokenFor(context, owner.email);
    const adminToken = await tokenFor(context, admin.email);
    const guruToken = await tokenFor(context, guru.email);
    const bothToken = await tokenFor(context, both.email);
    const teachersUrl = `/api/v1/schools/${closed.id}/teachers`;
    const before = {
      teachers: await context.prisma.teacher.count({ where: { schoolId: closed.id } }),
      students: await context.prisma.student.count({ where: { schoolId: closed.id } }),
      teachings: await context.prisma.teachingAssignment.count({ where: { id: teaching.id } }),
    };

    const missingReason = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/schools/${closed.id}/access-status`,
      headers: authHeader(ownerToken),
      payload: { status: "NONAKTIF", reason: "pendek" },
    });
    assert.equal(missingReason.statusCode, 400, missingReason.body);
    assert.equal((await context.prisma.school.findUniqueOrThrow({ where: { id: closed.id } })).accessStatus, "AKTIF");

    const denied = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/schools/${closed.id}/access-status`,
      headers: authHeader(adminToken),
      payload: { status: "NONAKTIF", reason: "Bukan pemilik sistem." },
    });
    assert.equal(denied.statusCode, 403, denied.body);

    const closedResult = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/schools/${closed.id}/access-status`,
      headers: authHeader(ownerToken),
      payload: { status: "NONAKTIF", reason: "Uji penonaktifan sekolah tanpa menghapus data." },
    });
    assert.equal(closedResult.statusCode, 200, closedResult.body);
    assert.equal(jsonBody<{ school: SchoolDto }>(closedResult).school.accessStatus, "NONAKTIF");
    assert.equal(jsonBody<{ school: SchoolDto }>(closedResult).school.isActive, false);

    const adminRead = await context.app.inject({ method: "GET", url: teachersUrl, headers: authHeader(adminToken) });
    assert.equal(adminRead.statusCode, 403, adminRead.body);
    assert.equal(jsonBody<ApiErrorBody>(adminRead).error.code, "SCHOOL_INACTIVE");
    const guruRead = await context.app.inject({ method: "GET", url: teachersUrl, headers: authHeader(guruToken) });
    assert.equal(guruRead.statusCode, 403, guruRead.body);
    const ownerRead = await context.app.inject({ method: "GET", url: teachersUrl, headers: authHeader(ownerToken) });
    assert.equal(ownerRead.statusCode, 200, ownerRead.body);
    const ownerWrite = await context.app.inject({
      method: "POST",
      url: teachersUrl,
      headers: authHeader(ownerToken),
      payload: { name: "Tidak boleh", gender: "LAKI_LAKI", isActive: true },
    });
    assert.equal(ownerWrite.statusCode, 403, ownerWrite.body);

    const otherSchool = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${open.id}/teachers`,
      headers: authHeader(bothToken),
    });
    assert.equal(otherSchool.statusCode, 200, otherSchool.body);
    const hidden = await context.app.inject({ method: "GET", url: "/api/v1/schools", headers: authHeader(bothToken) });
    assert.equal(jsonBody<{ schools: SchoolDto[] }>(hidden).schools.some((item) => item.id === closed.id), false);
    assert.equal(jsonBody<{ schools: SchoolDto[] }>(hidden).schools.some((item) => item.id === open.id), true);

    const suspended = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/schools/${closed.id}/access-status`,
      headers: authHeader(ownerToken),
      payload: { status: "DITANGGUHKAN", reason: "Uji penangguhan akses sekolah." },
    });
    assert.equal(suspended.statusCode, 200, suspended.body);
    const suspendedRead = await context.app.inject({ method: "GET", url: teachersUrl, headers: authHeader(adminToken) });
    assert.equal(suspendedRead.statusCode, 403, suspendedRead.body);
    assert.equal(jsonBody<ApiErrorBody>(suspendedRead).error.code, "SCHOOL_SUSPENDED");

    const restored = await context.app.inject({
      method: "PATCH",
      url: `/api/v1/schools/${closed.id}/access-status`,
      headers: authHeader(ownerToken),
      payload: { status: "AKTIF" },
    });
    assert.equal(restored.statusCode, 200, restored.body);
    assert.equal(jsonBody<{ school: SchoolDto }>(restored).school.accessStatus, "AKTIF");
    const restoredRead = await context.app.inject({ method: "GET", url: teachersUrl, headers: authHeader(adminToken) });
    assert.equal(restoredRead.statusCode, 200, restoredRead.body);

    assert.equal(await context.prisma.teacher.count({ where: { schoolId: closed.id } }), before.teachers);
    assert.equal(await context.prisma.student.count({ where: { schoolId: closed.id } }), before.students);
    assert.equal(await context.prisma.teachingAssignment.count({ where: { schoolId: closed.id } }), before.teachings);
    assert.equal(student.schoolId, closed.id);
    assert.equal((await context.prisma.school.findUniqueOrThrow({ where: { id: open.id } })).accessStatus, "AKTIF");
    const audits = await context.prisma.auditLog.findMany({
      where: { schoolId: closed.id, action: "SCHOOL_ACCESS_STATUS_CHANGED" },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(audits.length, 3);
    assert.equal(audits[0]?.actorId, owner.id);
    assert.deepEqual(audits[0]?.metadata, {
      before: "AKTIF",
      after: "NONAKTIF",
      reason: "Uji penonaktifan sekolah tanpa menghapus data.",
    });
    assert.equal(audits[2]?.actorId, owner.id);
    assert.equal((audits[2]?.metadata as { after?: string }).after, "AKTIF");
  });
});
