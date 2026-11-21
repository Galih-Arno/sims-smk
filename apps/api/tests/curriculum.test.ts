import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import ExcelJS from "exceljs";
import type { LightMyRequestResponse } from "fastify";
import type { AcademicOptionsDto, ApiErrorBody, CurriculumDto, ImportPreviewDto, LoginResponse, PageResult, PlanItemDto } from "@sims/shared";
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

async function call(
  context: TestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  token: string,
  payload?: unknown,
): Promise<LightMyRequestResponse> {
  return (await context.app.inject({
    method,
    url,
    headers: authHeader(token),
    payload: payload as string | undefined,
  })) as LightMyRequestResponse;
}

function multipart(filename: string, contentType: string, body: Buffer | string) {
  const boundary = "----sims-plan";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const content = typeof body === "string" ? Buffer.from(body) : body;
  return {
    boundary,
    payload: Buffer.concat([head, content, tail]),
  };
}

describe("Kurikulum, TP, dan LM", { concurrency: 1 }, () => {
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

  it("mengelola kurikulum, TP, LM, dan rangkap guru mapel dengan wali kelas", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Kurikulum", npsn: "20123001" });
    const other = await createSchool(context.prisma, { name: "SMK Tetangga", npsn: "20123002" });
    const admin = await createUser(context.prisma, { email: "admin.kurikulum@sekolah.test", name: "Admin Kurikulum", password: PASSWORD });
    const neighbor = await createUser(context.prisma, { email: "admin.tetangga@sekolah.test", name: "Admin Tetangga", password: PASSWORD });
    const dual = await createUser(context.prisma, { email: "rangkap.kurikulum@sekolah.test", name: "Guru Rangkap", password: PASSWORD });
    const wakakur = await createUser(context.prisma, { email: "wakakur.kurikulum@sekolah.test", name: "Wakakur Uji", password: PASSWORD });
    const kepala = await createUser(context.prisma, { email: "kepala.kurikulum@sekolah.test", name: "Kepala Uji", password: PASSWORD });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: neighbor.id, roleCode: "ADMIN_SEKOLAH", schoolId: other.id });
    await assignRole(context.prisma, { userId: dual.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    await assignRole(context.prisma, { userId: dual.id, roleCode: "WALI_KELAS", schoolId: school.id });
    await assignRole(context.prisma, { userId: wakakur.id, roleCode: "WAKAKUR", schoolId: school.id });
    await assignRole(context.prisma, { userId: kepala.id, roleCode: "KEPALA_SEKOLAH", schoolId: school.id });

    const adminToken = await tokenFor(context, admin.email);
    const dualToken = await tokenFor(context, dual.email);
    const wakakurToken = await tokenFor(context, wakakur.email);
    const kepalaToken = await tokenFor(context, kepala.email);
    const neighborToken = await tokenFor(context, neighbor.email);
    const base = `/api/v1/schools/${school.id}`;

    const year = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/academic-years`, adminToken, {
      name: "2027/2028", startDate: "2027-07-01", endDate: "2028-06-30", isActive: true,
    }));
    const otherYear = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/academic-years`, adminToken, {
      name: "2028/2029", startDate: "2028-07-01", endDate: "2029-06-30", isActive: false,
    }));
    const period = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/semesters`, adminToken, {
      academicYearId: year.item.id, name: "Ganjil", semesterKind: "GANJIL", startDate: "2027-07-01", endDate: "2027-12-20", isActive: true,
    }));
    const subject = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/subjects`, adminToken, {
      code: "mtk", name: "Matematika", category: "UMUM", isActive: true,
    }));
    const otherSubject = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/subjects`, adminToken, {
      code: "bind", name: "Bahasa Indonesia", category: "UMUM", isActive: true,
    }));
    const classOne = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/classes`, adminToken, {
      name: "X A", gradeLevel: 10, academicYearId: year.item.id, capacity: 32, isActive: true,
    }));
    const classOtherYear = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/classes`, adminToken, {
      name: "XI A", gradeLevel: 11, academicYearId: otherYear.item.id, capacity: 32, isActive: true,
    }));
    const teacher = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/teachers`, adminToken, {
      name: "Guru Rangkap", gender: "PEREMPUAN", userId: dual.id, isActive: true,
    }));
    const secondTeacher = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/teachers`, adminToken, {
      name: "Guru Lain", gender: "LAKI_LAKI", isActive: true,
    }));
    const duplicateAccount = await call(context, "POST", `${base}/teachers`, adminToken, {
      name: "Salinan Rangkap", gender: "PEREMPUAN", userId: dual.id, isActive: true,
    });
    assert.equal(duplicateAccount.statusCode, 409, duplicateAccount.body);
    assert.equal(duplicateAccount.body.includes("merangkap"), true);

    const teaching = await call(context, "POST", `${base}/teaching-assignments`, adminToken, {
      teacherId: teacher.item.id, subjectId: subject.item.id, classId: classOne.item.id, academicPeriodId: period.item.id,
    });
    assert.equal(teaching.statusCode, 201, teaching.body);
    const homeroom = await call(context, "POST", `${base}/homeroom-assignments`, adminToken, {
      teacherId: teacher.item.id, classId: classOne.item.id, academicPeriodId: period.item.id,
    });
    assert.equal(homeroom.statusCode, 201, homeroom.body);
    const secondHomeroom = await call(context, "POST", `${base}/homeroom-assignments`, adminToken, {
      teacherId: teacher.item.id, classId: classOtherYear.item.id, academicPeriodId: period.item.id,
    });
    assert.equal(secondHomeroom.statusCode, 409, secondHomeroom.body);
    await call(context, "POST", `${base}/teaching-assignments`, adminToken, {
      teacherId: secondTeacher.item.id, subjectId: otherSubject.item.id, classId: classOne.item.id, academicPeriodId: period.item.id,
    });

    const options = jsonBody<{ options: AcademicOptionsDto }>(await call(context, "GET", `${base}/academic-options`, adminToken));
    const member = options.options.members.find((item) => item.label.startsWith("Guru Rangkap"));
    assert.equal(member?.label.includes("Guru Mata Pelajaran"), true);
    assert.equal(member?.label.includes("Wali Kelas"), true);

    const curriculum = jsonBody<{ item: CurriculumDto }>(await call(context, "POST", `${base}/curricula`, adminToken, {
      academicYearId: year.item.id, code: "merdeka", name: "Kurikulum Rahasia", description: "Cakupan uji", isActive: true,
    }));
    assert.equal(curriculum.item.code, "MERDEKA");
    const placement = await call(context, "POST", `${base}/curriculum-placements`, adminToken, {
      curriculumId: curriculum.item.id, classId: classOne.item.id, subjectId: subject.item.id,
    });
    assert.equal(placement.statusCode, 201, placement.body);
    const duplicatePlacement = await call(context, "POST", `${base}/curriculum-placements`, adminToken, {
      curriculumId: curriculum.item.id, classId: classOne.item.id, subjectId: subject.item.id,
    });
    assert.equal(duplicatePlacement.statusCode, 409, duplicatePlacement.body);
    const wrongYear = await call(context, "POST", `${base}/curriculum-placements`, adminToken, {
      curriculumId: curriculum.item.id, classId: classOtherYear.item.id, subjectId: subject.item.id,
    });
    assert.equal(wrongYear.statusCode, 400, wrongYear.body);

    const guruDenied = await call(context, "POST", `${base}/curricula`, dualToken, {
      academicYearId: year.item.id, code: "guru", name: "Tidak Boleh", isActive: true,
    });
    assert.equal(guruDenied.statusCode, 403, guruDenied.body);
    assert.equal(jsonBody<ApiErrorBody>(guruDenied).error.code, "FORBIDDEN");
    const wakakurUpdate = await call(context, "PATCH", `${base}/curricula/${curriculum.item.id}`, wakakurToken, {
      academicYearId: year.item.id, code: "merdeka", name: "Kurikulum Rahasia", description: "Diubah wakakur", isActive: true,
    });
    assert.equal(wakakurUpdate.statusCode, 200, wakakurUpdate.body);

    const created: string[] = [];
    for (const description of ["Tujuan satu", "Tujuan dua", "Tujuan tiga"]) {
      const response = await call(context, "POST", `${base}/learning-objectives`, adminToken, {
        classId: classOne.item.id, subjectId: subject.item.id, academicPeriodId: period.item.id, description,
      });
      assert.equal(response.statusCode, 201, response.body);
      created.push(jsonBody<{ item: PlanItemDto }>(response).item.code);
    }
    assert.deepEqual(created, ["TP-1", "TP-2", "TP-3"]);
    const linked = jsonBody<{ item: PlanItemDto }>(await call(context, "POST", `${base}/learning-objectives`, dualToken, {
      classId: classOne.item.id, subjectId: subject.item.id, academicPeriodId: period.item.id, code: "tp-khusus", description: "Tujuan guru rangkap",
    }));
    assert.equal(linked.item.curriculumId, curriculum.item.id);
    const duplicateCode = await call(context, "POST", `${base}/learning-objectives`, dualToken, {
      classId: classOne.item.id, subjectId: subject.item.id, academicPeriodId: period.item.id, code: "TP-1", description: "Kode bentrok",
    });
    assert.equal(duplicateCode.statusCode, 409, duplicateCode.body);

    const foreignWrite = await call(context, "POST", `${base}/learning-objectives`, dualToken, {
      classId: classOne.item.id, subjectId: otherSubject.item.id, academicPeriodId: period.item.id, description: "Bukan mapel saya",
    });
    assert.equal(foreignWrite.statusCode, 403, foreignWrite.body);
    const wakakurScope = await call(context, "POST", `${base}/material-scopes`, wakakurToken, {
      classId: classOne.item.id, subjectId: otherSubject.item.id, academicPeriodId: period.item.id, code: "LM1", description: "Lingkup bahasa",
    });
    assert.equal(wakakurScope.statusCode, 201, wakakurScope.body);
    const kepalaWrite = await call(context, "POST", `${base}/material-scopes`, kepalaToken, {
      classId: classOne.item.id, subjectId: otherSubject.item.id, academicPeriodId: period.item.id, code: "LM2", description: "Kepala tidak menulis",
    });
    assert.equal(kepalaWrite.statusCode, 403, kepalaWrite.body);
    const kepalaRead = await call(context, "GET", `${base}/material-scopes?classId=${classOne.item.id}&subjectId=${otherSubject.item.id}&academicPeriodId=${period.item.id}`, kepalaToken);
    assert.equal(kepalaRead.statusCode, 200, kepalaRead.body);
    assert.equal(jsonBody<PageResult<PlanItemDto>>(kepalaRead).total, 1);

    const monitored = await call(context, "GET", `${base}/material-scopes?subjectId=${otherSubject.item.id}`, dualToken);
    assert.equal(monitored.statusCode, 200, monitored.body);
    assert.equal(jsonBody<PageResult<PlanItemDto>>(monitored).total, 1);
    const ownList = jsonBody<PageResult<PlanItemDto>>(await call(context, "GET", `${base}/learning-objectives?q=rangkap`, dualToken));
    assert.equal(ownList.total, 1);

    const hidden = await call(context, "GET", `${base}/curricula?q=Rahasia`, neighborToken);
    assert.equal(hidden.statusCode, 403, hidden.body);
    assert.equal(hidden.body.includes("Kurikulum Rahasia"), false);
    const invalidPage = await call(context, "GET", `${base}/learning-objectives?pageSize=15`, adminToken);
    assert.equal(invalidPage.statusCode, 400, invalidPage.body);

    const removed = await call(context, "DELETE", `${base}/learning-objectives/${linked.item.id}`, dualToken);
    assert.equal(removed.statusCode, 204, removed.body);
  });

  it("mempratinjau impor TP dan LM lalu menyimpan baris valid", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Impor Rencana", npsn: "20123003" });
    const admin = await createUser(context.prisma, { email: "admin.rencana@sekolah.test", name: "Admin Rencana", password: PASSWORD });
    const guru = await createUser(context.prisma, { email: "guru.rencana@sekolah.test", name: "Guru Rencana", password: PASSWORD });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: school.id });
    const adminToken = await tokenFor(context, admin.email);
    const guruToken = await tokenFor(context, guru.email);
    const base = `/api/v1/schools/${school.id}`;
    const year = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/academic-years`, adminToken, {
      name: "2027/2028", startDate: "2027-07-01", endDate: "2028-06-30", isActive: true,
    }));
    const period = jsonBody<{ item: { id: string; name: string } }>(await call(context, "POST", `${base}/semesters`, adminToken, {
      academicYearId: year.item.id, name: "Ganjil", semesterKind: "GANJIL", startDate: "2027-07-01", endDate: "2027-12-20", isActive: true,
    }));
    const subject = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/subjects`, adminToken, {
      code: "mtk", name: "Matematika", category: "UMUM", isActive: true,
    }));
    const otherSubject = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/subjects`, adminToken, {
      code: "bind", name: "Bahasa Indonesia", category: "UMUM", isActive: true,
    }));
    const classOne = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/classes`, adminToken, {
      name: "X A", gradeLevel: 10, academicYearId: year.item.id, capacity: 32, isActive: true,
    }));
    const teacher = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/teachers`, adminToken, {
      name: "Guru Rencana", gender: "LAKI_LAKI", userId: guru.id, isActive: true,
    }));
    const otherTeacher = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/teachers`, adminToken, {
      name: "Guru Bahasa", gender: "PEREMPUAN", isActive: true,
    }));
    await call(context, "POST", `${base}/teaching-assignments`, adminToken, {
      teacherId: teacher.item.id, subjectId: subject.item.id, classId: classOne.item.id, academicPeriodId: period.item.id,
    });
    await call(context, "POST", `${base}/teaching-assignments`, adminToken, {
      teacherId: otherTeacher.item.id, subjectId: otherSubject.item.id, classId: classOne.item.id, academicPeriodId: period.item.id,
    });

    const csv = [
      "kelas,mapel,semester,kode,deskripsi",
      "X A,MTK,Ganjil,TP9,Tujuan dari berkas",
      "X A,MTK,Ganjil,TP9,Duplikat berkas",
      "X Z,MTK,Ganjil,TP8,Kelas hilang",
      "X A,MTK,Ganjil,,Deskripsi tanpa kode",
    ].join("\n");
    const file = multipart("tujuan.csv", "text/csv", csv);
    const preview = await context.app.inject({
      method: "POST",
      url: `${base}/imports/learning-objectives/preview`,
      headers: { ...authHeader(adminToken), "content-type": `multipart/form-data; boundary=${file.boundary}` },
      payload: file.payload,
    });
    assert.equal(preview.statusCode, 200, preview.body);
    const previewBody = jsonBody<ImportPreviewDto>(preview);
    assert.equal(previewBody.validCount, 1);
    assert.equal(previewBody.invalidCount, 3);
    const commit = await call(context, "POST", `${base}/imports/learning-objectives/commit`, adminToken, {
      rows: previewBody.rows.map((row) => row.data),
    });
    assert.equal(commit.statusCode, 200, commit.body);
    assert.equal(jsonBody<{ created: number }>(commit).created, 1);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("LM");
    sheet.addRow(["kelas", "mapel", "semester", "kode", "deskripsi"]);
    sheet.addRow(["X A", "MTK", "Ganjil", "LM1", "Lingkup valid"]);
    sheet.addRow(["X A", "BIND", "Ganjil", "LM2", "Bukan penugasan saya"]);
    sheet.addRow(["X A", "MTK", "Ganjil", "LM1", "Duplikat berkas"]);
    const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
    const sheetFile = multipart("lingkup.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx);
    const xlsxPreview = await context.app.inject({
      method: "POST",
      url: `${base}/imports/material-scopes/preview`,
      headers: { ...authHeader(guruToken), "content-type": `multipart/form-data; boundary=${sheetFile.boundary}` },
      payload: sheetFile.payload,
    });
    assert.equal(xlsxPreview.statusCode, 200, xlsxPreview.body);
    const xlsxBody = jsonBody<ImportPreviewDto>(xlsxPreview);
    assert.equal(xlsxBody.validCount, 1);
    assert.equal(xlsxBody.invalidCount, 2);
    assert.equal(xlsxBody.rows.some((row) => row.errors.some((error) => error.includes("bukan milik Anda"))), true);
    const xlsxCommit = await call(context, "POST", `${base}/imports/material-scopes/commit`, guruToken, {
      rows: xlsxBody.rows.map((row) => row.data),
    });
    assert.equal(jsonBody<{ created: number }>(xlsxCommit).created, 1);
    const saved = await context.prisma.materialScope.findMany({ where: { schoolId: school.id } });
    assert.deepEqual(saved.map((item) => item.code), ["LM1"]);
  });
});
