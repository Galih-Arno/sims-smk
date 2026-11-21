import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, GradeReportPolicyDto, GradeReportPolicyPreviewDto, LoginResponse } from "@sims/shared";
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

function policy(scope: { academicYearId: string; academicPeriodId: string; curriculumId: string }, extra: Record<string, unknown> = {}) {
  return {
    academicYearId: scope.academicYearId,
    academicPeriodId: scope.academicPeriodId,
    curriculumId: scope.curriculumId,
    useFormative: true,
    useSummative: true,
    useSts: true,
    useSas: true,
    formativeMode: "COMBINED",
    weightFormative: 40,
    weightUh: null,
    weightT1: null,
    weightT2: null,
    weightT3: null,
    weightSummative: 30,
    weightSts: 20,
    weightSas: 10,
    remedialPolicy: "HIGHEST",
    remedialCap: null,
    emptyTreatment: "INCOMPLETE",
    roundingMode: "ONE_DECIMAL",
    ...extra,
  };
}

describe("Kebijakan pengolahan nilai rapor", { concurrency: 1 }, () => {
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

  it("memvalidasi bobot, membatasi aktivasi pada wakakur, dan mencatat audit tanpa mengubah nilai", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Kebijakan", npsn: "10400001" });
    const other = await createSchool(context.prisma, { name: "SMK Lain", npsn: "10400002" });
    const year = await context.prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026/2027",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2027-06-30T00:00:00.000Z"),
      },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Ganjil",
        semesterKind: "GANJIL",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
      },
    });
    const curriculum = await context.prisma.curriculum.create({
      data: { schoolId: school.id, academicYearId: year.id, code: "KM", name: "Kurikulum Merdeka" },
    });
    const scope = { academicYearId: year.id, academicPeriodId: period.id, curriculumId: curriculum.id };
    const admin = await createUser(context.prisma, { email: "admin.kebijakan@uji.local", name: "Admin Kebijakan", password: PASSWORD });
    const wakakur = await createUser(context.prisma, { email: "wakakur.kebijakan@uji.local", name: "Wakakur Kebijakan", password: PASSWORD });
    const guru = await createUser(context.prisma, { email: "guru.kebijakan@uji.local", name: "Guru Kebijakan", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.lain.kebijakan@uji.local", name: "Admin Lain", password: PASSWORD });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakur.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    const adminToken = await token(context, admin.email);
    const wakakurToken = await token(context, wakakur.email);
    const guruToken = await token(context, guru.email);
    const neighborToken = await token(context, neighbor.email);
    const base = `/api/v1/schools/${school.id}/grade-report-policies`;

    const invalid = await context.app.inject({
      method: "POST",
      url: base,
      headers: authHeader(adminToken),
      payload: policy(scope, { weightSas: 5 }),
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(jsonBody<ApiErrorBody>(invalid).error.code, "VALIDATION_ERROR");

    const separate = await context.app.inject({
      method: "POST",
      url: `${base}/preview`,
      headers: authHeader(adminToken),
      payload: policy(scope, {
        formativeMode: "SEPARATE",
        weightFormative: null,
        weightUh: 10,
        weightT1: 10,
        weightT2: 10,
        weightT3: 10,
        weightSummative: 20,
        weightSts: 15,
        weightSas: 15,
      }),
    });
    assert.equal(separate.statusCode, 200);
    assert.equal(jsonBody<{ preview: GradeReportPolicyPreviewDto }>(separate).preview.valid, false);
    assert.equal(await context.prisma.gradeReportPolicy.count(), 0);

    const zero = await context.app.inject({
      method: "POST",
      url: base,
      headers: authHeader(adminToken),
      payload: policy(scope, { emptyTreatment: "ZERO" }),
    });
    assert.equal(zero.statusCode, 400);

    const cap = await context.app.inject({
      method: "POST",
      url: base,
      headers: authHeader(adminToken),
      payload: policy(scope, { remedialPolicy: "CAPPED", remedialCap: null }),
    });
    assert.equal(cap.statusCode, 400);

    const created = await context.app.inject({
      method: "POST",
      url: base,
      headers: authHeader(adminToken),
      payload: policy(scope),
    });
    assert.equal(created.statusCode, 201, created.body);
    const item = jsonBody<{ item: GradeReportPolicyDto }>(created).item;
    assert.equal(item.status, "DRAFT");
    assert.equal(item.weightFormative, 40);

    const guruDenied = await context.app.inject({ method: "GET", url: base, headers: authHeader(guruToken) });
    assert.equal(guruDenied.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(guruDenied).error.code, "FORBIDDEN");
    const neighborDenied = await context.app.inject({ method: "GET", url: base, headers: authHeader(neighborToken) });
    assert.equal(neighborDenied.statusCode, 403);
    assert.equal(jsonBody<ApiErrorBody>(neighborDenied).error.code, "TENANT_FORBIDDEN");

    const adminActivate = await context.app.inject({
      method: "POST",
      url: `${base}/${item.id}/activate`,
      headers: authHeader(adminToken),
    });
    assert.equal(adminActivate.statusCode, 403);

    const activated = await context.app.inject({
      method: "POST",
      url: `${base}/${item.id}/activate`,
      headers: authHeader(wakakurToken),
    });
    assert.equal(activated.statusCode, 200, activated.body);
    assert.equal(jsonBody<{ item: GradeReportPolicyDto }>(activated).item.status, "ACTIVE");

    const locked = await context.app.inject({
      method: "PATCH",
      url: `${base}/${item.id}`,
      headers: authHeader(wakakurToken),
      payload: policy(scope, { weightFormative: 50, weightSas: 0 }),
    });
    assert.equal(locked.statusCode, 409);

    const audits = await context.prisma.auditLog.findMany({
      where: { entityType: "GradeReportPolicy", entityId: item.id },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(audits.map((entry) => entry.action), ["GRADE_POLICY_CREATED", "GRADE_POLICY_ACTIVATED"]);
    assert.equal(await context.prisma.formativeScore.count(), 0);
    assert.equal(await context.prisma.summativeScore.count(), 0);
    assert.equal(await context.prisma.termExamScore.count(), 0);
    assert.equal(await context.prisma.gradeSubmission.count(), 0);
  });
});

async function token(context: TestContext, email: string): Promise<string> {
  const response = await loginRequest(context.app, email, PASSWORD);
  assert.equal(response.statusCode, 200, response.body);
  return jsonBody<LoginResponse>(response).accessToken;
}
