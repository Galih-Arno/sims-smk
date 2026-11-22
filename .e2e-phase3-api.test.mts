import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildApp } from "./apps/api/src/app.ts";
import { hashPassword } from "./apps/api/src/lib/password.ts";
import { prisma } from "./apps/api/src/lib/prisma.ts";

const TAG = `e2e_p3_${Date.now()}`;
let app: Awaited<ReturnType<typeof buildApp>>;
let schoolId = "";
let adminToken = "";
let studentId = "";

before(async () => {
  app = await buildApp();

  const school = await prisma.school.create({
    data: {
      code: `${TAG}_SCH`,
      name: `SMK Uji E2E ${TAG}`,
      npsn: `${Date.now().toString().slice(-8)}`,
    },
  });
  schoolId = school.id;

  const passwordPlain = "PassE2E#2026";
  const user = await prisma.user.create({
    data: {
      email: `${TAG}_admin@example.test`,
      name: `Admin E2E ${TAG}`,
      passwordHash: await hashPassword(passwordPlain),
      isActive: true,
      assignments: {
        create: {
          schoolId,
          roleCode: "ADMIN_SEKOLAH",
        },
      },
    },
  });

  const loginRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: user.email, password: passwordPlain },
  });
  assert.equal(loginRes.statusCode, 200, `Login gagal: ${loginRes.body}`);
  adminToken = (loginRes.json() as { accessToken: string }).accessToken;

  const klass = await prisma.schoolClass.create({
    data: {
      schoolId,
      name: `XII-TJKT-${TAG.slice(-4)}`,
      gradeLevel: 12,
    },
  });

  const student = await prisma.student.create({
    data: {
      schoolId,
      classId: klass.id,
      nis: `NIS-${TAG.slice(-6)}`,
      nisn: `${Date.now().toString().slice(-10)}`,
      name: `Siswa Uji ${TAG}`,
    },
  });
  studentId = student.id;
});

after(async () => {
  if (schoolId) {
    await prisma.school.deleteMany({ where: { id: schoolId } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await app?.close();
});

test("E2E Fase 3: leave-requests (buat, baca, review)", async () => {
  const headers = { authorization: `Bearer ${adminToken}` };
  const createRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/leave-requests`,
    headers,
    payload: {
      leaveType: "DINAS_LUAR_SPD",
      startDate: "2026-11-22",
      endDate: "2026-11-23",
      reason: "Pendampingan siswa lomba kompetensi",
    },
  });
  assert.equal(createRes.statusCode, 200);
  const created = (createRes.json() as { request: { id: string; status: string } }).request;
  assert.equal(created.status, "MENUNGGU");

  const listRes = await app.inject({
    method: "GET",
    url: `/api/v1/schools/${schoolId}/leave-requests`,
    headers,
  });
  assert.equal(listRes.statusCode, 200);

  const reviewRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/leave-requests/${created.id}/review`,
    headers,
    payload: { status: "DISETUJUI", reviewNote: "Disetujui kepala sekolah" },
  });
  assert.equal(reviewRes.statusCode, 200);
  assert.equal((reviewRes.json() as { request: { status: string } }).request.status, "DISETUJUI");
});

test("E2E Fase 3: character-records & counseling-reports", async () => {
  const headers = { authorization: `Bearer ${adminToken}` };

  const charRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/character-records`,
    headers,
    payload: {
      studentId,
      recordType: "PRESTASI",
      category: "Lomba LKS",
      points: 25,
      note: "Juara 1 tingkat kabupaten",
    },
  });
  assert.equal(charRes.statusCode, 200);

  const charList = await app.inject({
    method: "GET",
    url: `/api/v1/schools/${schoolId}/character-records`,
    headers,
  });
  assert.equal(charList.statusCode, 200);
  const records = (charList.json() as { records: Array<{ netScore: number }> }).records;
  assert.equal(records[0]?.netScore, 25);

  const counsCreate = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/counseling-reports`,
    headers,
    payload: {
      studentId,
      isAnonymous: true,
      subject: "Konsultasi karir & magang",
      description: "Butuh arahan pemilihan tempat PKL sesuai minat.",
    },
  });
  assert.equal(counsCreate.statusCode, 200);
  const rep = (counsCreate.json() as { report: { id: string; status: string } }).report;

  const counsPatch = await app.inject({
    method: "PATCH",
    url: `/api/v1/schools/${schoolId}/counseling-reports/${rep.id}`,
    headers,
    payload: { status: "DIPROSES", counselorNote: "Jadwal sesi BK ditetapkan" },
  });
  assert.equal(counsPatch.statusCode, 200);
  assert.equal((counsPatch.json() as { report: { status: string } }).report.status, "DIPROSES");
});

test("E2E Fase 3: bills, payments & webhooks/payment-gateway (idempotency)", async () => {
  const headers = { authorization: `Bearer ${adminToken}` };

  const billRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/bills`,
    headers,
    payload: {
      studentId,
      title: "SPP November 2026",
      fundBucket: "KOMITE",
      amount: 100000,
    },
  });
  assert.equal(billRes.statusCode, 200);
  const bill = (billRes.json() as { bill: { id: string; status: string } }).bill;
  assert.equal(bill.status, "BELUM_LUNAS");

  const payRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/bills/${bill.id}/payments`,
    headers,
    payload: {
      amount: 40000,
      channel: "TUNAI",
      idempotencyKey: `${TAG}_idem_1`,
    },
  });
  assert.equal(payRes.statusCode, 200);
  assert.equal((payRes.json() as { bill: { status: string; paidAmount: number } }).bill.status, "SEBAGIAN");

  const orderId = `${TAG}_ord_99`;
  const wh1 = await app.inject({
    method: "POST",
    url: "/api/v1/webhooks/payment-gateway",
    payload: {
      schoolId,
      billId: bill.id,
      amount: 60000,
      channel: "MIDTRANS",
      orderId,
      transactionStatus: "SETTLEMENT",
    },
  });
  assert.equal(wh1.statusCode, 200);
  assert.equal((wh1.json() as { bill: { status: string; paidAmount: number } }).bill.status, "LUNAS");

  const wh2 = await app.inject({
    method: "POST",
    url: "/api/v1/webhooks/payment-gateway",
    payload: {
      schoolId,
      billId: bill.id,
      amount: 60000,
      channel: "MIDTRANS",
      orderId,
      transactionStatus: "SETTLEMENT",
    },
  });
  assert.equal(wh2.statusCode, 200);
  assert.equal((wh2.json() as { deduplicated: boolean }).deduplicated, true);
  assert.equal((wh2.json() as { bill: { paidAmount: number } }).bill.paidAmount, 100000);
});

test("E2E Fase 3: internship-placements & internship-logs (buat & verifikasi)", async () => {
  const headers = { authorization: `Bearer ${adminToken}` };

  const placeRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/internship-placements`,
    headers,
    payload: {
      studentId,
      companyName: "Bengkel & Lab Industri Pasir Sakti",
      supervisorName: "Pembimbing DUDI",
      startDate: "2026-11-22",
      endDate: "2026-12-22",
    },
  });
  assert.equal(placeRes.statusCode, 200);
  const placement = (placeRes.json() as { placement: { id: string } }).placement;

  const logRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/internship-logs`,
    headers,
    payload: {
      placementId: placement.id,
      logDate: "2026-11-22",
      activity: "Instalasi jaringan lokal & pengujian perangkat praktik",
      locationNote: "Divisi Teknik Jaringan",
    },
  });
  assert.equal(logRes.statusCode, 200);
  const logItem = (logRes.json() as { log: { id: string; status: string } }).log;
  assert.equal(logItem.status, "MENUNGGU");

  const verifyRes = await app.inject({
    method: "POST",
    url: `/api/v1/schools/${schoolId}/internship-logs/${logItem.id}/verify`,
    headers,
    payload: { status: "DISETUJUI" },
  });
  assert.equal(verifyRes.statusCode, 200);
  assert.equal((verifyRes.json() as { log: { status: string } }).log.status, "DISETUJUI");
});
