import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { LoginResponse } from "@sims/shared";
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

describe("Dasbor sesuai peran", () => {
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

  it("menghitung data sekolah sendiri dan menolak lintas peran", async () => {
    const alpha = await createSchool(context.prisma, { name: "SMK Dasbor A", npsn: "40120001" });
    const beta = await createSchool(context.prisma, { name: "SMK Dasbor B", npsn: "40120002" });
    await context.prisma.school.update({ where: { id: beta.id }, data: { accessStatus: "DITANGGUHKAN", isActive: false } });
    const owner = await createUser(context.prisma, { email: "owner.dash@uji.local", name: "Pemilik", password: PASSWORD });
    const admin = await createUser(context.prisma, { email: "admin.dash@uji.local", name: "Admin A", password: PASSWORD });
    const other = await createUser(context.prisma, { email: "admin.b@uji.local", name: "Admin B", password: PASSWORD });
    const guru = await createUser(context.prisma, { email: "guru.dash@uji.local", name: "Guru A", password: PASSWORD });
    await assignRole(context.prisma, { userId: owner.id, roleCode: "SYSTEM_OWNER", schoolId: null });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: alpha.id });
    await assignRole(context.prisma, { userId: other.id, roleCode: "ADMIN_SEKOLAH", schoolId: beta.id });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: alpha.id });

    const year = await context.prisma.academicYear.create({
      data: {
        schoolId: alpha.id,
        name: "2026/2027",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2027-06-30T00:00:00.000Z"),
        isActive: true,
      },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: alpha.id,
        academicYearId: year.id,
        name: "Ganjil",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        isActive: true,
      },
    });
    const subject = await context.prisma.subject.create({
      data: { schoolId: alpha.id, code: "MTK", name: "Matematika" },
    });
    const schoolClass = await context.prisma.schoolClass.create({
      data: { schoolId: alpha.id, academicYearId: year.id, name: "X TKJ 1", gradeLevel: 10 },
    });
    const teacher = await context.prisma.teacher.create({
      data: { schoolId: alpha.id, userId: guru.id, name: "Guru A", gender: "LAKI_LAKI" },
    });
    await context.prisma.teacher.create({
      data: { schoolId: alpha.id, name: "Guru Lain", gender: "PEREMPUAN" },
    });
    await context.prisma.teachingAssignment.create({
      data: {
        schoolId: alpha.id,
        teacherId: teacher.id,
        subjectId: subject.id,
        classId: schoolClass.id,
        academicPeriodId: period.id,
      },
    });
    await context.prisma.student.create({
      data: { schoolId: alpha.id, nisn: "4012000001", name: "Siswa A", gender: "LAKI_LAKI", classId: schoolClass.id },
    });
    await context.prisma.student.create({
      data: { schoolId: beta.id, nisn: "4012000002", name: "Siswa B", gender: "PEREMPUAN" },
    });

    const ownerToken = await tokenFor(context, owner.email);
    const adminToken = await tokenFor(context, admin.email);
    const otherToken = await tokenFor(context, other.email);
    const guruToken = await tokenFor(context, guru.email);

    const platform = await context.app.inject({ method: "GET", url: "/api/v1/dashboard", headers: authHeader(ownerToken) });
    assert.equal(platform.statusCode, 200, platform.body);
    const platformBody = jsonBody<{ schools: number; active: number; suspended: number; students: number }>(platform);
    assert.equal(platformBody.schools, 2);
    assert.equal(platformBody.active, 1);
    assert.equal(platformBody.suspended, 1);
    assert.equal(platformBody.students, 2);

    const deniedOwner = await context.app.inject({ method: "GET", url: "/api/v1/dashboard", headers: authHeader(adminToken) });
    assert.equal(deniedOwner.statusCode, 403);

    const school = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${alpha.id}/dashboard?view=admin`,
      headers: authHeader(adminToken),
    });
    assert.equal(school.statusCode, 200, school.body);
    const schoolBody = jsonBody<{ students: number; teachers: number; teachersWithoutAccount: number }>(school);
    assert.equal(schoolBody.students, 1);
    assert.equal(schoolBody.teachers, 2);
    assert.equal(schoolBody.teachersWithoutAccount, 1);

    const cross = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${alpha.id}/dashboard?view=admin`,
      headers: authHeader(otherToken),
    });
    assert.equal(cross.statusCode, 403);

    const mine = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${alpha.id}/dashboard?view=guru`,
      headers: authHeader(guruToken),
    });
    assert.equal(mine.statusCode, 200, mine.body);
    const mineBody = jsonBody<{ total: number; draft: number; items: { subjectName: string }[] }>(mine);
    assert.equal(mineBody.total, 1);
    assert.equal(mineBody.draft, 1);
    assert.equal(mineBody.items[0]?.subjectName, "Matematika");

    const guruAsAdmin = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${alpha.id}/dashboard?view=admin`,
      headers: authHeader(guruToken),
    });
    assert.equal(guruAsAdmin.statusCode, 403);
  });
});
