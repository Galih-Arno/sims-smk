import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import ExcelJS from "exceljs";
import type { LightMyRequestResponse } from "fastify";
import type { ApiErrorBody, ImportPreviewDto, LoginResponse, StudentDto } from "@sims/shared";
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

async function call(context: TestContext, method: "POST" | "PATCH", url: string, token: string, payload: unknown) {
  return context.app.inject({ method, url, headers: authHeader(token), payload: payload as string });
}

function multipart(filename: string, content: Buffer) {
  const boundary = "----sims-nis-opsional";
  return {
    boundary,
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

describe("NIS siswa opsional", { concurrency: 1 }, () => {
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

  it("menyimpan siswa tanpa NIS dan menolak NIS ganda", async () => {
    const school = await createSchool(context.prisma, { name: "SMK NIS Opsional", npsn: "40110031" });
    const admin = await createUser(context.prisma, { email: "admin.nis@uji.local", name: "Admin NIS", password: PASSWORD });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    const token = await tokenFor(context, admin.email);
    const base = `/api/v1/schools/${school.id}`;
    const kept = await context.prisma.student.create({
      data: { schoolId: school.id, nisn: "3010000001", nis: "NIS-LAMA", name: "Siswa Lama", gender: "LAKI_LAKI" },
    });

    const first = await call(context, "POST", `${base}/students`, token, {
      name: "Siswa Tanpa NIS", nisn: "3010000002", gender: "PEREMPUAN", isActive: true,
    });
    assert.equal(first.statusCode, 201, first.body);
    const created = jsonBody<{ item: StudentDto }>(first).item;
    assert.equal(created.nis, null);
    assert.equal(created.nisn, "3010000002");

    const second = await call(context, "POST", `${base}/students`, token, {
      name: "Siswa Kosong Lain", nisn: "3010000003", nis: "   ", gender: "LAKI_LAKI", isActive: true,
    });
    assert.equal(second.statusCode, 201, second.body);
    assert.equal(jsonBody<{ item: StudentDto }>(second).item.nis, null);

    const duplicate = await call(context, "POST", `${base}/students`, token, {
      name: "Siswa NIS Ganda", nisn: "3010000004", nis: "NIS-LAMA", gender: "LAKI_LAKI", isActive: true,
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);
    assert.equal(jsonBody<ApiErrorBody>(duplicate).error.code, "DUPLICATE");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Siswa");
    sheet.addRow(["NISN", "NIS", "Nama Lengkap", "Jenis Kelamin"]);
    const row = sheet.addRow(["3010000005", "", "Siswa Impor Kosong", "L"]);
    row.getCell(1).value = "3010000005";
    row.getCell(1).numFmt = "@";
    row.getCell(2).value = "";
    row.getCell(2).numFmt = "@";
    const file = Buffer.from(await workbook.xlsx.writeBuffer());
    const body = multipart("siswa.xlsx", file);
    const preview = await context.app.inject({
      method: "POST",
      url: `${base}/imports/students/preview`,
      headers: { ...authHeader(token), "content-type": `multipart/form-data; boundary=${body.boundary}` },
      payload: body.payload,
    });
    assert.equal(preview.statusCode, 200, preview.body);
    const previewBody = jsonBody<ImportPreviewDto>(preview);
    assert.equal(previewBody.validCount, 1);
    assert.equal(previewBody.rows[0]?.data.nis ?? "", "");
    const commit = await call(context, "POST", `${base}/imports/students/commit`, token, {
      rows: previewBody.rows.map((item) => ({ rowNumber: item.rowNumber, data: item.data })),
    });
    assert.equal(commit.statusCode, 200, commit.body);
    const imported = await context.prisma.student.findUniqueOrThrow({ where: { nisn: "3010000005" } });
    assert.equal(imported.nis, null);
    assert.notEqual(imported.nis, imported.nisn);

    const unchanged = await context.prisma.student.findUniqueOrThrow({ where: { id: kept.id } });
    assert.equal(unchanged.nis, "NIS-LAMA");
    assert.equal(unchanged.nisn, "3010000001");
    assert.equal(unchanged.name, "Siswa Lama");
    assert.equal(await context.prisma.student.count({ where: { schoolId: school.id } }), 4);
  });
});
