import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { LoginResponse } from "@sims/shared";
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

describe("Fase 2: Smart Presensi Pegawai (GPS + Liveness) & E-Jurnal KBM", { concurrency: 1 }, () => {
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

  it("memvalidasi geofencing GPS, liveness selfie, dan idempotency saat sinyal putus-nyambung", async () => {
    const school = await createSchool(context.prisma, { name: "SMK PGRI Pasir Sakti", npsn: "10805501" });
    const admin = await createUser(context.prisma, { email: "admin@pgri.sch.id", name: "Admin Sekolah", password: "Password123!" });
    const guru = await createUser(context.prisma, { email: "guru@pgri.sch.id", name: "Budi Santoso, S.Pd", password: "Password123!" });

    await assignRole(context.prisma, { userId: admin.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });
    await assignRole(context.prisma, { userId: guru.id, roleCode: "GURU_MAPEL", schoolId: school.id });

    const adminToken = await accessTokenFor(context, admin.email, "Password123!");
    const guruToken = await accessTokenFor(context, guru.email, "Password123!");

    // 1. Admin mengatur titik koordinat sekolah & radius 100 meter
    const setRes = await context.app.inject({
      method: "PUT",
      url: `/api/v1/schools/${school.id}/staff-attendance/setting`,
      headers: authHeader(adminToken),
      payload: {
        latitude: -5.3210,
        longitude: 105.7890,
        radiusMeters: 100,
        workStartTime: "07:00",
        lateToleranceMin: 15,
        workEndTime: "15:30",
        requireLiveness: true,
      },
    });
    assert.equal(setRes.statusCode, 200);

    // 2. Guru mencoba absen di luar radius sekolah (jarak > 1 km) -> harus ditolak OUT_OF_GEOFENCE
    const farRes = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/staff-attendance/check-in`,
      headers: authHeader(guruToken),
      payload: {
        latitude: -5.3350,
        longitude: 105.7890,
        photoUrl: "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
      },
    });
    assert.equal(farRes.statusCode, 400);
    assert.equal(jsonBody<{ error: { code: string } }>(farRes).error.code, "OUT_OF_GEOFENCE");

    // 3. Guru absen di dalam radius tanpa foto selfie -> ditolak LIVENESS_REQUIRED
    const noPhotoRes = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/staff-attendance/check-in`,
      headers: authHeader(guruToken),
      payload: {
        latitude: -5.3211,
        longitude: 105.7891,
      },
    });
    assert.equal(noPhotoRes.statusCode, 400);
    assert.equal(jsonBody<{ error: { code: string } }>(noPhotoRes).error.code, "LIVENESS_REQUIRED");

    // 4. Guru absen valid + idempotencyKey (simulasi retry jaringan buruk)
    const idempKey = "punch-in-guru-001-retry";
    const okRes1 = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/staff-attendance/check-in`,
      headers: authHeader(guruToken),
      payload: {
        latitude: -5.3211,
        longitude: 105.7891,
        photoUrl: "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
        idempotencyKey: idempKey,
      },
    });
    assert.equal(okRes1.statusCode, 200);
    const body1 = jsonBody<{ record: { id: string }; deduplicated: boolean }>(okRes1);
    assert.equal(body1.deduplicated, false);

    // Retry request identik -> harus deduplicated = true dan ID sama
    const okRes2 = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/staff-attendance/check-in`,
      headers: authHeader(guruToken),
      payload: {
        latitude: -5.3211,
        longitude: 105.7891,
        photoUrl: "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
        idempotencyKey: idempKey,
      },
    });
    assert.equal(okRes2.statusCode, 200);
    const body2 = jsonBody<{ record: { id: string }; deduplicated: boolean }>(okRes2);
    assert.equal(body2.deduplicated, true);
    assert.equal(body2.record.id, body1.record.id);

    // 5. Absensi pulang berhasil
    const outRes = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/staff-attendance/check-out`,
      headers: authHeader(guruToken),
      payload: {
        latitude: -5.3210,
        longitude: 105.7890,
      },
    });
    assert.equal(outRes.statusCode, 200);
  });

  it("menyimpan dan membaca E-Jurnal pembelajaran guru", async () => {
    const school = await createSchool(context.prisma, { name: "SMK PGRI Pasir Sakti", npsn: "10805502" });
    const year = await context.prisma.academicYear.create({
      data: {
        schoolId: school.id,
        name: "2026/2027",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2027-06-30T00:00:00.000Z"),
        isActive: true,
      },
    });
    const period = await context.prisma.academicPeriod.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "Ganjil 2026/2027",
        semesterKind: "GANJIL",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
        isActive: true,
      },
    });
    const guruUser = await createUser(context.prisma, { email: "produktif@pgri.sch.id", name: "Guru Produktif", password: "Password123!" });
    await assignRole(context.prisma, { userId: guruUser.id, roleCode: "GURU_MAPEL", schoolId: school.id });

    const teacher = await context.prisma.teacher.create({
      data: {
        schoolId: school.id,
        userId: guruUser.id,
        name: "Guru Produktif",
        gender: "LAKI_LAKI",
      },
    });
    const schoolClass = await context.prisma.schoolClass.create({
      data: {
        schoolId: school.id,
        academicYearId: year.id,
        name: "XI TKR 1",
        gradeLevel: 11,
      },
    });
    const subject = await context.prisma.subject.create({
      data: {
        schoolId: school.id,
        code: "PMKR",
        name: "Pemeliharaan Mesin Kendaraan Ringan",
        category: "KEJURUAN",
      },
    });
    const assignment = await context.prisma.teachingAssignment.create({
      data: {
        schoolId: school.id,
        teacherId: teacher.id,
        subjectId: subject.id,
        classId: schoolClass.id,
        academicPeriodId: period.id,
      },
    });

    const token = await accessTokenFor(context, guruUser.email, "Password123!");
    const saveRes = await context.app.inject({
      method: "POST",
      url: `/api/v1/schools/${school.id}/journals`,
      headers: authHeader(token),
      payload: {
        teachingAssignmentId: assignment.id,
        journalDate: "2026-11-21",
        sessionNo: 1,
        topic: "Tune Up Sistem Injeksi EFI",
        activities: "Praktik pemeriksaan tekanan bahan bakar dan pembacaan scanner OBD2 di bengkel otomotif.",
        studentNotes: "Seluruh siswa mengikuti SOP K3 bengkel dengan baik.",
        idempotencyKey: "journal-efi-001",
      },
    });
    assert.equal(saveRes.statusCode, 200);

    const listRes = await context.app.inject({
      method: "GET",
      url: `/api/v1/schools/${school.id}/journals`,
      headers: authHeader(token),
    });
    assert.equal(listRes.statusCode, 200);
    const listBody = jsonBody<{ journals: Array<{ topic: string }> }>(listRes);
    assert.equal(listBody.journals.length, 1);
    assert.equal(listBody.journals[0]?.topic, "Tune Up Sistem Injeksi EFI");
  });
});
