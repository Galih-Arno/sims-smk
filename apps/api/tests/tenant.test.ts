import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { ROLE_DEFINITIONS, type AcademicPeriodDto, type ApiErrorBody, type LoginResponse, type SchoolDto } from "@sims/shared";
import { AppError } from "../src/lib/errors.ts";
import { grantAssignment } from "../src/modules/access/assignments.ts";
import {
  assignRole,
  authHeader,
  closeTestContext,
  createPeriod,
  createSchool,
  createTestContext,
  createUser,
  jsonBody,
  loginRequest,
  migrateTestDatabase,
  resetDatabase,
  type TestContext,
} from "./helpers.ts";

async function accessTokenFor(context: TestContext, email: string, password: string): Promise<string> {
  const response = await loginRequest(context.app, email, password);
  assert.equal(response.statusCode, 200);
  return jsonBody<LoginResponse>(response).accessToken;
}

describe("Isolasi tenant", { concurrency: 1 }, () => {
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

  it("menjaga data sekolah, peran ganda, dan jejak audit", async () => {
    const schoolA = await createSchool(context.prisma, { name: "SMK Alfa", npsn: "20110001" });
    const schoolB = await createSchool(context.prisma, { name: "SMK Beta", npsn: "20110002" });
    await createPeriod(context.prisma, { schoolId: schoolA.id, name: "PERIODE-ALFA-RAHASIA" });
    await createPeriod(context.prisma, { schoolId: schoolB.id, name: "PERIODE-BETA-RAHASIA" });

    const adminA = await createUser(context.prisma, {
      email: "admin.a@sekolah.test",
      name: "Admin Alfa",
      password: "RahasiaUji!2026",
    });
    const adminB = await createUser(context.prisma, {
      email: "admin.b@sekolah.test",
      name: "Admin Beta",
      password: "RahasiaUji!2026",
    });
    const multi = await createUser(context.prisma, {
      email: "multi@sekolah.test",
      name: "Multi Peran",
      password: "RahasiaUji!2026",
    });
    const owner = await createUser(context.prisma, {
      email: "owner@sekolah.test",
      name: "Pemilik",
      password: "RahasiaUji!2026",
    });

    await assignRole(context.prisma, { userId: adminA.id, roleCode: "ADMIN_SEKOLAH", schoolId: schoolA.id });
    await assignRole(context.prisma, { userId: adminB.id, roleCode: "ADMIN_SEKOLAH", schoolId: schoolB.id });
    await assignRole(context.prisma, { userId: multi.id, roleCode: "GURU_MAPEL", schoolId: schoolA.id });
    await assignRole(context.prisma, { userId: multi.id, roleCode: "WALI_KELAS", schoolId: schoolA.id });
    await assignRole(context.prisma, { userId: multi.id, roleCode: "TU", schoolId: schoolB.id });
    await assignRole(context.prisma, { userId: owner.id, roleCode: "SYSTEM_OWNER", schoolId: null });

    const roles = await context.prisma.role.findMany();
    assert.equal(roles.length, ROLE_DEFINITIONS.length);

    const tokenA = await accessTokenFor(context, "admin.a@sekolah.test", "RahasiaUji!2026");
    const schoolsA = await context.app.inject({
      method: "GET",
      url: "/api/v1/schools",
      headers: authHeader(tokenA),
    });
    const schoolsABody = jsonBody<{ schools: SchoolDto[] }>(schoolsA);
    assert.equal(schoolsA.statusCode, 200);
    assert.deepEqual(
      schoolsABody.schools.map((school) => school.name),
      ["SMK Alfa"],
    );
    assert.doesNotMatch(schoolsA.body, /SMK Beta|PERIODE-BETA-RAHASIA/);

    const periodsA = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${schoolA.id}/academic-periods`,
      headers: authHeader(tokenA),
    });
    const periodsABody = jsonBody<{ academicPeriods: AcademicPeriodDto[] }>(periodsA);
    assert.equal(periodsA.statusCode, 200);
    assert.equal(periodsABody.academicPeriods[0]?.name, "PERIODE-ALFA-RAHASIA");
    assert.equal(periodsABody.academicPeriods[0]?.schoolId, schoolA.id);

    const leaked = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${schoolB.id}/academic-periods`,
      headers: authHeader(tokenA),
    });
    const leakedBody = jsonBody<ApiErrorBody>(leaked);
    assert.equal(leaked.statusCode, 403);
    assert.equal(leakedBody.error.code, "TENANT_FORBIDDEN");
    assert.doesNotMatch(leaked.body, /PERIODE-BETA-RAHASIA|SMK Beta/);

    const missingId = "clschooltidakada0000000001";
    const hiddenMissing = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${missingId}`,
      headers: authHeader(tokenA),
    });
    assert.equal(hiddenMissing.statusCode, 403);

    const tokenOwner = await accessTokenFor(context, "owner@sekolah.test", "RahasiaUji!2026");
    const ownerMissing = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${missingId}`,
      headers: authHeader(tokenOwner),
    });
    assert.equal(ownerMissing.statusCode, 404);

    const ownerSchools = await context.app.inject({
      method: "GET",
      url: "/api/v1/schools",
      headers: authHeader(tokenOwner),
    });
    const ownerSchoolBody = jsonBody<{ schools: SchoolDto[] }>(ownerSchools);
    assert.deepEqual(
      ownerSchoolBody.schools.map((school) => school.npsn),
      ["20110001", "20110002"],
    );

    const ownerPeriodsB = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${schoolB.id}/academic-periods`,
      headers: authHeader(tokenOwner),
    });
    assert.equal(ownerPeriodsB.statusCode, 200);
    assert.match(ownerPeriodsB.body, /PERIODE-BETA-RAHASIA/);

    const tokenMulti = await accessTokenFor(context, "multi@sekolah.test", "RahasiaUji!2026");
    const profile = await context.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(tokenMulti),
    });
    const profileBody = jsonBody<{ user: LoginResponse["user"] }>(profile);
    assert.equal(profileBody.user.assignments.length, 3);
    assert.deepEqual(
      profileBody.user.assignments.map((assignment) => assignment.roleCode).sort(),
      ["GURU_MAPEL", "TU", "WALI_KELAS"],
    );

    const multiPeriodsB = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${schoolB.id}/academic-periods`,
      headers: authHeader(tokenMulti),
    });
    assert.equal(multiPeriodsB.statusCode, 200);

    const guruAudit = await context.app.inject({
      method: "GET",
      url: `/api/v1/audit-logs?schoolId=${schoolA.id}`,
      headers: authHeader(tokenMulti),
    });
    assert.equal(guruAudit.statusCode, 403);

    const tuAudit = await context.app.inject({
      method: "GET",
      url: `/api/v1/audit-logs?schoolId=${schoolB.id}`,
      headers: authHeader(tokenMulti),
    });
    assert.equal(tuAudit.statusCode, 200);
    assert.doesNotMatch(tuAudit.body, /PERIODE-ALFA-RAHASIA|TENANT_ACCESS_DENIED/);

    const adminAuditB = await context.app.inject({
      method: "GET",
      url: `/api/v1/audit-logs?schoolId=${schoolB.id}`,
      headers: authHeader(tokenA),
    });
    assert.equal(adminAuditB.statusCode, 403);

    const ownerAudit = await context.app.inject({
      method: "GET",
      url: "/api/v1/audit-logs",
      headers: authHeader(tokenOwner),
    });
    assert.equal(ownerAudit.statusCode, 200);
    assert.match(ownerAudit.body, /TENANT_ACCESS_DENIED/);

    const tokenB = await accessTokenFor(context, "admin.b@sekolah.test", "RahasiaUji!2026");
    const betaOnly = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${schoolB.id}/academic-periods`,
      headers: authHeader(tokenB),
    });
    assert.equal(betaOnly.statusCode, 200);
    assert.match(betaOnly.body, /PERIODE-BETA-RAHASIA/);
    assert.doesNotMatch(betaOnly.body, /PERIODE-ALFA-RAHASIA/);
  });

  it("menolak penugasan peran yang melanggar cakupan sekolah", async () => {
    const user = await createUser(context.prisma, {
      email: "cakupan@sekolah.test",
      name: "Cakupan",
      password: "RahasiaUji!2026",
    });

    await assert.rejects(
      () => grantAssignment(context.prisma, { userId: user.id, roleCode: "GURU_MAPEL", schoolId: null }),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_ASSIGNMENT",
    );

    await assert.rejects(async () => {
      const role = await context.prisma.role.findUniqueOrThrow({ where: { code: "ADMIN_SEKOLAH" } });
      await context.prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          schoolId: null,
        },
      });
    }, /School role requires a school/);
  });
});
