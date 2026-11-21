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

type WriteResult = { created: boolean; temporaryPassword: string | null; item: { id: string; roles: Array<{ code: string }> } };

describe("Manajemen pengguna sekolah", { concurrency: 1 }, () => {
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

  it("mengelola peran sekolah tanpa menggandakan akun guru atau mengubah penugasan", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Pengguna", npsn: "10400031" });
    const other = await createSchool(context.prisma, { name: "SMK Pengguna Lain", npsn: "10400032" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const subject = await context.prisma.subject.create({ data: { schoolId: school.id, code: "MTK", name: "Matematika" } });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const adminUser = await createUser(context.prisma, { email: "admin.pengguna@uji.local", name: "Admin Pengguna", password: PASSWORD });
    const guruUser = await createUser(context.prisma, { email: "guru.pengguna@uji.local", name: "Guru Pengguna", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.pengguna.lain@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: adminUser.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const guru = await context.prisma.teacher.create({ data: { schoolId: school.id, userId: guruUser.id, name: "Guru Pengguna", gender: "LAKI_LAKI", email: guruUser.email } });
    const assignment = await context.prisma.teachingAssignment.create({
      data: { schoolId: school.id, teacherId: guru.id, subjectId: subject.id, classId: schoolClass.id, academicPeriodId: period.id },
    });

    const adminToken = await token(context, adminUser.email);
    const usersUrl = `/api/v1/schools/${school.id}/users`;
    const created = await context.app.inject({
      method: "POST",
      url: usersUrl,
      headers: authHeader(adminToken),
      payload: { name: "Wakakur Uji", email: "wakakur.uji@uji.local", roles: ["WAKAKUR"], teacherId: null },
    });
    assert.equal(created.statusCode, 201, created.body);
    const wakakur = jsonBody<WriteResult>(created);
    assert.equal(wakakur.created, true);
    assert.ok(wakakur.temporaryPassword);

    const wakakurLogin = await loginRequest(context.app, "wakakur.uji@uji.local", wakakur.temporaryPassword ?? "");
    assert.equal(wakakurLogin.statusCode, 200, wakakurLogin.body);
    const wakakurToken = jsonBody<LoginResponse>(wakakurLogin).accessToken;
    const changed = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: authHeader(wakakurToken),
      payload: { currentPassword: wakakur.temporaryPassword, newPassword: "WakakurUji!2026" },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    const wakakurNext = await token(context, "wakakur.uji@uji.local", "WakakurUji!2026");
    const policies = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/grade-report-policies?page=1&pageSize=10`,
      headers: authHeader(wakakurNext),
    });
    assert.equal(policies.statusCode, 200, policies.body);

    const ownerRole = await context.app.inject({
      method: "POST",
      url: usersUrl,
      headers: authHeader(adminToken),
      payload: { name: "Pemilik Palsu", email: "pemilik.palsu@uji.local", roles: ["SYSTEM_OWNER"], teacherId: null },
    });
    assert.equal(ownerRole.statusCode, 400);

    const neighborRead = await context.app.inject({ method: "GET", url: usersUrl, headers: authHeader(await token(context, neighbor.email)) });
    assert.equal(neighborRead.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborRead).error.code, "TENANT_FORBIDDEN");
    const guruRead = await context.app.inject({ method: "GET", url: usersUrl, headers: authHeader(await token(context, guruUser.email)) });
    assert.equal(guruRead.statusCode, 403);

    const linked = await context.app.inject({
      method: "POST",
      url: usersUrl,
      headers: authHeader(adminToken),
      payload: { name: "Guru Pengguna", email: guruUser.email, roles: ["GURU_MAPEL", "TU"], teacherId: guru.id },
    });
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(jsonBody<WriteResult>(linked).created, false);
    assert.equal(await context.prisma.user.count({ where: { email: guruUser.email } }), 1);
    assert.equal(await context.prisma.teachingAssignment.count({ where: { id: assignment.id } }), 1);

    const waliBlocked = await context.app.inject({
      method: "PATCH",
      url: `${usersUrl}/${guruUser.id}/roles`,
      headers: authHeader(adminToken),
      payload: { roles: ["GURU_MAPEL", "WALI_KELAS"], teacherId: guru.id },
    });
    assert.equal(waliBlocked.statusCode, 409, waliBlocked.body);
    await context.prisma.homeroomAssignment.create({ data: { schoolId: school.id, teacherId: guru.id, classId: schoolClass.id, academicPeriodId: period.id } });
    const waliReady = await context.app.inject({
      method: "PATCH",
      url: `${usersUrl}/${guruUser.id}/roles`,
      headers: authHeader(adminToken),
      payload: { roles: ["GURU_MAPEL", "WALI_KELAS", "TU"], teacherId: guru.id },
    });
    assert.equal(waliReady.statusCode, 200, waliReady.body);
    assert.equal(await context.prisma.homeroomAssignment.count({ where: { teacherId: guru.id } }), 1);
    assert.equal(await context.prisma.teachingAssignment.count({ where: { id: assignment.id } }), 1);
    const audits = await context.prisma.auditLog.count({ where: { action: "SCHOOL_USER_CREATED", schoolId: school.id } });
    assert.equal(audits, 1);
  });

  it("menolak guru tanpa data guru dan menyimpan dua peran setelah data lengkap", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Satu Uji", npsn: "10400041" });
    const other = await createSchool(context.prisma, { name: "SMK Dua Uji", npsn: "10400042" });
    const year = await context.prisma.academicYear.create({
      data: { schoolId: school.id, name: "2026/2027", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2027-06-30T00:00:00.000Z") },
    });
    const period = await context.prisma.academicPeriod.create({
      data: { schoolId: school.id, academicYearId: year.id, name: "Ganjil", semesterKind: "GANJIL", startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-12-31T00:00:00.000Z"), isActive: true },
    });
    const schoolClass = await context.prisma.schoolClass.create({ data: { schoolId: school.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 } });
    const owner = await createUser(context.prisma, { email: "owner.pengguna@uji.local", name: "Pemilik Uji", password: PASSWORD });
    await assignRole(context.prisma, { userId: owner.id, roleCode: "SYSTEM_OWNER", schoolId: null });
    const teacher = await context.prisma.teacher.create({ data: { schoolId: school.id, name: "Guru Belum Akun", gender: "PEREMPUAN" } });
    const otherTeacher = await context.prisma.teacher.create({ data: { schoolId: other.id, name: "Guru Sekolah Lain", gender: "LAKI_LAKI" } });
    const ownerToken = await token(context, owner.email);
    const usersUrl = `/api/v1/schools/${school.id}/users`;

    const teacherList = await context.app.inject({
      method: "GET",
      url: `${usersUrl}/teachers`,
      headers: authHeader(ownerToken),
    });
    assert.equal(teacherList.statusCode, 200, teacherList.body);
    const listed = jsonBody<{ items: Array<{ id: string }> }>(teacherList).items.map((item) => item.id);
    assert.deepEqual(listed, [teacher.id]);
    assert.equal(listed.includes(otherTeacher.id), false);

    const before = await context.prisma.user.count();
    const missingTeacher = await context.app.inject({
      method: "POST",
      url: usersUrl,
      headers: authHeader(ownerToken),
      payload: { name: "Filma Uji", email: "filma.uji@uji.local", roles: ["GURU_MAPEL", "WALI_KELAS"], teacherId: null },
    });
    assert.equal(missingTeacher.statusCode, 409, missingTeacher.body);
    assert.equal(jsonBody<ApiErrorBody>(missingTeacher).error.code, "USE_TEACHER_FORM");
    assert.equal(await context.prisma.user.count(), before);
    assert.equal(await context.prisma.user.count({ where: { email: "filma.uji@uji.local" } }), 0);

    const throughUsers = await context.app.inject({
      method: "POST",
      url: usersUrl,
      headers: authHeader(ownerToken),
      payload: { name: "Filma Uji", email: "filma.uji@uji.local", roles: ["GURU_MAPEL", "WALI_KELAS"], teacherId: teacher.id },
    });
    assert.equal(throughUsers.statusCode, 409, throughUsers.body);
    assert.equal(jsonBody<ApiErrorBody>(throughUsers).error.code, "USE_TEACHER_FORM");
    assert.equal(await context.prisma.user.count(), before);

    const created = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/teachers/with-account`,
      headers: authHeader(ownerToken),
      payload: { name: "Filma Uji", email: "filma.uji@uji.local", gender: "PEREMPUAN", roles: ["GURU_MAPEL", "WALI_KELAS"], isActive: true },
    });
    assert.equal(created.statusCode, 201, created.body);
    const account = jsonBody<{ created: boolean; temporaryPassword: string | null; item: { id: string; roleCodes: string[] } }>(created);
    assert.equal(account.created, true);
    assert.deepEqual(account.item.roleCodes.sort(), ["GURU_MAPEL", "WALI_KELAS"]);
    const login = await loginRequest(context.app, "filma.uji@uji.local", account.temporaryPassword ?? "");
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(jsonBody<LoginResponse>(login).user.mustChangePassword, true);
    assert.equal(await context.prisma.homeroomAssignment.count({ where: { classId: schoolClass.id, academicPeriodId: period.id } }), 0);

    const duplicate = await context.app.inject({
      method: "POST",
      url: usersUrl,
      headers: authHeader(ownerToken),
      payload: { name: "Filma Lain", email: "filma.uji@uji.local", roles: ["GURU_MAPEL"], teacherId: account.item.id },
    });
    assert.equal(duplicate.statusCode, 200, duplicate.body);
    assert.equal(jsonBody<WriteResult>(duplicate).created, false);
    assert.equal(await context.prisma.user.count({ where: { email: "filma.uji@uji.local" } }), 1);

    const secondAccount = await context.app.inject({
      method: "POST",
      url: usersUrl,
      headers: authHeader(ownerToken),
      payload: { name: "Akun Ganda", email: "ganda.uji@uji.local", roles: ["GURU_MAPEL"], teacherId: teacher.id },
    });
    assert.equal(secondAccount.statusCode, 409, secondAccount.body);
    assert.equal(await context.prisma.user.count({ where: { email: "ganda.uji@uji.local" } }), 0);

    const otherStaff = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${other.id}/users`,
      headers: authHeader(ownerToken),
      payload: { name: "TU Sekolah Dua", email: "tu.dua@uji.local", roles: ["TU"], teacherId: null },
    });
    assert.equal(otherStaff.statusCode, 201, otherStaff.body);
    const otherLogin = await loginRequest(context.app, "tu.dua@uji.local", jsonBody<WriteResult>(otherStaff).temporaryPassword ?? "");
    assert.equal(otherLogin.statusCode, 200, otherLogin.body);
  });
});

async function token(context: TestContext, email: string, password = PASSWORD): Promise<string> {
  const response = await loginRequest(context.app, email, password);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
