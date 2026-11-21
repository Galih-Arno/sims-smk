import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { LightMyRequestResponse } from "fastify";
import type { ApiErrorBody, ImportPreviewDto, LoginResponse, PageResult, StudentDto } from "@sims/shared";
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

describe("Master data akademik", { concurrency: 1 }, () => {
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

  it("mengelola data sekolah dan menolak duplikasi", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Alfa", npsn: "20120001" });
    const other = await createSchool(context.prisma, { name: "SMK Beta", npsn: "20120002" });
    const admin = await createUser(context.prisma, { email: "admin.akademik@sekolah.test", name: "Admin Alfa", password: PASSWORD });
    const owner = await createUser(context.prisma, { email: "owner.akademik@sekolah.test", name: "Pemilik", password: PASSWORD });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: owner.id, roleCode: "SYSTEM_OWNER", schoolId: null });
    const token = await tokenFor(context, admin.email);
    const ownerToken = await tokenFor(context, owner.email);
    const base = `/api/v1/schools/${school.id}`;

    const deniedSchool = await call(context, "POST", "/api/v1/schools", token, { name: "Sekolah Admin", npsn: "20120009" });
    assert.equal(deniedSchool.statusCode, 403, deniedSchool.body);

    const createdSchool = await call(context, "POST", "/api/v1/schools", ownerToken, { name: "SMK Baru", npsn: "20120009" });
    assert.equal(createdSchool.statusCode, 201, createdSchool.body);

    const year = await call(context, "POST", `${base}/academic-years`, token, {
      name: "2027/2028",
      startDate: "2027-07-01",
      endDate: "2028-06-30",
      isActive: true,
    });
    assert.equal(year.statusCode, 201, year.body);
    const yearId = jsonBody<{ item: { id: string } }>(year).item.id;

    const semester = await call(context, "POST", `${base}/semesters`, token, {
      academicYearId: yearId,
      name: "2027/2028 Ganjil",
      semesterKind: "GANJIL",
      startDate: "2027-07-01",
      endDate: "2027-12-20",
      isActive: true,
    });
    assert.equal(semester.statusCode, 201, semester.body);
    const periodId = jsonBody<{ item: { id: string } }>(semester).item.id;

    const field = await call(context, "POST", `${base}/expertise-fields`, token, { code: "tik", name: "Teknologi Informasi", isActive: true });
    assert.equal(field.statusCode, 201, field.body);
    const fieldId = jsonBody<{ item: { id: string; code: string } }>(field).item;
    assert.equal(fieldId.code, "TIK");

    const program = await call(context, "POST", `${base}/expertise-programs`, token, {
      fieldId: fieldId.id,
      code: "rpl",
      name: "Rekayasa Perangkat Lunak",
      isActive: true,
    });
    assert.equal(program.statusCode, 201, program.body);
    const programId = jsonBody<{ item: { id: string } }>(program).item.id;

    const concentration = await call(context, "POST", `${base}/expertise-concentrations`, token, {
      programId,
      code: "pplg",
      name: "Pengembangan Perangkat Lunak",
      isActive: true,
    });
    assert.equal(concentration.statusCode, 201, concentration.body);

    const teacher = await call(context, "POST", `${base}/teachers`, token, {
      name: "Guru Satu",
      nip: "12345678",
      gender: "LAKI_LAKI",
      isActive: true,
    });
    assert.equal(teacher.statusCode, 201, teacher.body);
    const teacherId = jsonBody<{ item: { id: string } }>(teacher).item.id;
    const duplicateTeacher = await call(context, "POST", `${base}/teachers`, token, {
      name: "Guru Duplikat",
      nip: "12345678",
      gender: "PEREMPUAN",
      isActive: true,
    });
    assert.equal(duplicateTeacher.statusCode, 409, duplicateTeacher.body);
    assert.equal(jsonBody<ApiErrorBody>(duplicateTeacher).error.code, "DUPLICATE");

    const subject = await call(context, "POST", `${base}/subjects`, token, { code: "pweb", name: "Pemrograman Web", category: "KEJURUAN", isActive: true });
    assert.equal(subject.statusCode, 201, subject.body);
    const subjectId = jsonBody<{ item: { id: string } }>(subject).item.id;

    const schoolClass = await call(context, "POST", `${base}/classes`, token, {
      name: "XII PPLG 1",
      gradeLevel: 12,
      academicYearId: yearId,
      capacity: 36,
      isActive: true,
    });
    assert.equal(schoolClass.statusCode, 201, schoolClass.body);
    const classId = jsonBody<{ item: { id: string } }>(schoolClass).item.id;
    const otherClass = await call(context, "POST", `${base}/classes`, token, {
      name: "XII PPLG 2",
      gradeLevel: 12,
      academicYearId: yearId,
      capacity: 36,
      isActive: true,
    });
    const otherClassId = jsonBody<{ item: { id: string } }>(otherClass).item.id;

    const student = await call(context, "POST", `${base}/students`, token, {
      name: "Siswa Rahasia",
      nisn: "9988776655",
      nis: "1001",
      gender: "PEREMPUAN",
      classId,
      isActive: true,
    });
    assert.equal(student.statusCode, 201, student.body);
    const duplicateNisn = await call(context, "POST", `/api/v1/schools/${other.id}/students`, ownerToken, {
      name: "Siswa Lain",
      nisn: "9988776655",
      gender: "LAKI_LAKI",
      isActive: true,
    });
    assert.equal(duplicateNisn.statusCode, 409, duplicateNisn.body);

    const teaching = await call(context, "POST", `${base}/teaching-assignments`, token, {
      teacherId,
      subjectId,
      classId,
      academicPeriodId: periodId,
    });
    assert.equal(teaching.statusCode, 201, teaching.body);
    const duplicateTeaching = await call(context, "POST", `${base}/teaching-assignments`, token, {
      teacherId,
      subjectId,
      classId,
      academicPeriodId: periodId,
    });
    assert.equal(duplicateTeaching.statusCode, 409, duplicateTeaching.body);

    const secondTeacher = await call(context, "POST", `${base}/teachers`, token, { name: "Guru Dua", gender: "LAKI_LAKI", isActive: true });
    const secondTeacherId = jsonBody<{ item: { id: string } }>(secondTeacher).item.id;
    const homeroom = await call(context, "POST", `${base}/homeroom-assignments`, token, {
      teacherId,
      classId,
      academicPeriodId: periodId,
    });
    assert.equal(homeroom.statusCode, 201, homeroom.body);
    const duplicateHomeroom = await call(context, "POST", `${base}/homeroom-assignments`, token, {
      teacherId: secondTeacherId,
      classId,
      academicPeriodId: periodId,
    });
    assert.equal(duplicateHomeroom.statusCode, 409, duplicateHomeroom.body);
    const teacherBusy = await call(context, "POST", `${base}/homeroom-assignments`, token, {
      teacherId,
      classId: otherClassId,
      academicPeriodId: periodId,
    });
    assert.equal(teacherBusy.statusCode, 409, teacherBusy.body);

    const invalidPage = await call(context, "GET", `${base}/students?pageSize=15`, token);
    assert.equal(invalidPage.statusCode, 400, invalidPage.body);

    const found = await call(context, "GET", `${base}/students?q=Rahasia`, token);
    assert.equal(found.statusCode, 200, found.body);
    const page = jsonBody<PageResult<StudentDto>>(found);
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.name, "Siswa Rahasia");

    const hidden = await call(context, "GET", `/api/v1/schools/${other.id}/students?q=Rahasia`, ownerToken);
    const otherPage = jsonBody<PageResult<StudentDto>>(hidden);
    assert.equal(otherPage.total, 0);
    assert.equal(hidden.body.includes("Siswa Rahasia"), false);
  });

  it("mengisolasi guru, wali kelas, dan sekolah lain", async () => {
    const schoolA = await createSchool(context.prisma, { name: "SMK Alfa", npsn: "20121001" });
    const schoolB = await createSchool(context.prisma, { name: "SMK Beta", npsn: "20121002" });
    const adminA = await createUser(context.prisma, { email: "admin.a.akademik@sekolah.test", name: "Admin A", password: PASSWORD });
    const adminB = await createUser(context.prisma, { email: "admin.b.akademik@sekolah.test", name: "Admin B", password: PASSWORD });
    const guru = await createUser(context.prisma, { email: "guru.akademik@sekolah.test", name: "Guru Mapel", password: PASSWORD });
    const wali = await createUser(context.prisma, { email: "wali.akademik@sekolah.test", name: "Wali Kelas", password: PASSWORD });
    await assignRole(context.prisma, { userId: adminA.id, roleCode: "ADMIN_SEKOLAH", schoolId: schoolA.id });
    await assignRole(context.prisma, { userId: adminB.id, roleCode: "ADMIN_SEKOLAH", schoolId: schoolB.id });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: schoolA.id });
    await assignRole(context.prisma, { userId: wali.id, roleCode: "WALI_KELAS", schoolId: schoolA.id });

    const adminToken = await tokenFor(context, adminA.email);
    const base = `/api/v1/schools/${schoolA.id}`;
    const year = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/academic-years`, adminToken, {
      name: "2027/2028", startDate: "2027-07-01", endDate: "2028-06-30", isActive: true,
    }));
    const period = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/semesters`, adminToken, {
      academicYearId: year.item.id, name: "Ganjil", semesterKind: "GANJIL", startDate: "2027-07-01", endDate: "2027-12-20", isActive: true,
    }));
    const subject = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/subjects`, adminToken, {
      code: "mtk", name: "Matematika", category: "UMUM", isActive: true,
    }));
    const classOne = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/classes`, adminToken, {
      name: "X A", gradeLevel: 10, academicYearId: year.item.id, capacity: 32, isActive: true,
    }));
    const classTwo = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/classes`, adminToken, {
      name: "X B", gradeLevel: 10, academicYearId: year.item.id, capacity: 32, isActive: true,
    }));
    const teacherGuru = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/teachers`, adminToken, {
      name: "Guru Mapel", gender: "LAKI_LAKI", userId: guru.id, isActive: true,
    }));
    const teacherWali = jsonBody<{ item: { id: string } }>(await call(context, "POST", `${base}/teachers`, adminToken, {
      name: "Wali Kelas", gender: "PEREMPUAN", userId: wali.id, isActive: true,
    }));
    await call(context, "POST", `${base}/students`, adminToken, {
      name: "Siswa Kelas A", nisn: "1111111111", gender: "LAKI_LAKI", classId: classOne.item.id, isActive: true,
    });
    await call(context, "POST", `${base}/students`, adminToken, {
      name: "Siswa Kelas B", nisn: "2222222222", gender: "PEREMPUAN", classId: classTwo.item.id, isActive: true,
    });
    await call(context, "POST", `${base}/teaching-assignments`, adminToken, {
      teacherId: teacherGuru.item.id, subjectId: subject.item.id, classId: classOne.item.id, academicPeriodId: period.item.id,
    });
    await call(context, "POST", `${base}/homeroom-assignments`, adminToken, {
      teacherId: teacherWali.item.id, classId: classTwo.item.id, academicPeriodId: period.item.id,
    });

    const guruToken = await tokenFor(context, guru.email);
    const waliToken = await tokenFor(context, wali.email);
    const adminBToken = await tokenFor(context, adminB.email);

    const writeDenied = await call(context, "POST", `${base}/students`, guruToken, {
      name: "Tidak Boleh", nisn: "3333333333", gender: "LAKI_LAKI", isActive: true,
    });
    assert.equal(writeDenied.statusCode, 403, writeDenied.body);
    assert.equal(jsonBody<ApiErrorBody>(writeDenied).error.code, "FORBIDDEN");

    const guruStudents = jsonBody<PageResult<StudentDto>>(await call(context, "GET", `${base}/students`, guruToken));
    assert.deepEqual(guruStudents.items.map((item) => item.name), ["Siswa Kelas A"]);
    const waliStudents = jsonBody<PageResult<StudentDto>>(await call(context, "GET", `${base}/students`, waliToken));
    assert.deepEqual(waliStudents.items.map((item) => item.name), ["Siswa Kelas B"]);

    const cross = await call(context, "GET", `${base}/students`, adminBToken);
    assert.equal(cross.statusCode, 403, cross.body);
    assert.equal(cross.body.includes("Siswa Kelas A"), false);
    assert.equal(cross.body.includes("Siswa Kelas B"), false);
  });

  it("mempratinjau impor dan hanya menyimpan baris valid", async () => {
    const school = await createSchool(context.prisma, { name: "SMK Impor", npsn: "20122001" });
    const admin = await createUser(context.prisma, { email: "admin.impor@sekolah.test", name: "Admin Impor", password: PASSWORD });
    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    const token = await tokenFor(context, admin.email);
    const csv = "nisn,nama,jenis_kelamin\n1111111111,Siswa Valid,L\n22,Siswa Buruk,L\n1111111111,Siswa Duplikat,L\n";
    const boundary = "----sims-import";
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="siswa.csv"',
      "Content-Type: text/csv",
      "",
      csv,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const preview = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/imports/students/preview`,
      headers: { ...authHeader(token), "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    assert.equal(preview.statusCode, 200, preview.body);
    const previewBody = jsonBody<ImportPreviewDto>(preview);
    assert.equal(previewBody.validCount, 1);
    assert.equal(previewBody.invalidCount, 2);

    const commit = await call(context, "POST", `/api/v1/schools/${school.id}/imports/students/commit`, token, {
      rows: previewBody.rows.map((row) => row.data),
    });
    assert.equal(commit.statusCode, 200, commit.body);
    assert.equal(jsonBody<{ created: number; skipped: number }>(commit).created, 1);
    const saved = await context.prisma.student.findMany({ where: { schoolId: school.id } });
    assert.deepEqual(saved.map((item) => item.name), ["Siswa Valid"]);
  });
});
