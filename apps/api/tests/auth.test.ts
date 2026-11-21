import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { ApiErrorBody, LoginResponse } from "@sims/shared";
import {
  REFRESH_COOKIE,
  assignRole,
  authHeader,
  closeTestContext,
  createTestContext,
  createUser,
  jsonBody,
  loginRequest,
  migrateTestDatabase,
  readRefreshCookie,
  resetDatabase,
  type TestContext,
} from "./helpers.ts";

const loginMaxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);

describe("Autentikasi", { concurrency: 1 }, () => {
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

  it("menolak login tanpa format yang valid", async () => {
    const response = await loginRequest(context.app, "bukan-email", "");
    const body = jsonBody<ApiErrorBody>(response);
    assert.equal(response.statusCode, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });

  it("memakai pesan yang sama untuk email asing dan kata sandi yang salah", async () => {
    await createUser(context.prisma, {
      email: "guru@sekolah.test",
      name: "Guru Uji",
      password: "RahasiaUji!2026",
    });

    const unknownUser = await loginRequest(context.app, "tidak.ada@sekolah.test", "RahasiaUji!2026");
    const wrongPassword = await loginRequest(context.app, "guru@sekolah.test", "salah-sekali");
    const unknownBody = jsonBody<ApiErrorBody>(unknownUser);
    const wrongBody = jsonBody<ApiErrorBody>(wrongPassword);

    assert.equal(unknownUser.statusCode, 401);
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownBody.error.message, wrongBody.error.message);
    assert.equal(unknownBody.error.message, "Email atau kata sandi tidak sesuai.");
    assert.doesNotMatch(unknownUser.body, /passwordHash/i);
  });

  it("menerbitkan sesi dan profil untuk login yang benar", async () => {
    const user = await createUser(context.prisma, {
      email: "owner.uji@sekolah.test",
      name: "Pemilik Uji",
      password: "RahasiaUji!2026",
    });
    await assignRole(context.prisma, {
      userId: user.id,
      roleCode: "SYSTEM_OWNER",
      schoolId: null,
    });

    const response = await loginRequest(context.app, "Owner.Uji@sekolah.test", "RahasiaUji!2026");
    const body = jsonBody<LoginResponse>(response);
    const refreshCookie = readRefreshCookie(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.user.email, "owner.uji@sekolah.test");
    assert.equal(body.user.assignments[0]?.roleCode, "SYSTEM_OWNER");
    assert.ok(body.accessToken.length > 20);
    assert.ok(refreshCookie);
    assert.doesNotMatch(response.body, /passwordHash/i);

    const profile = await context.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: authHeader(body.accessToken),
    });
    assert.equal(profile.statusCode, 200);
    assert.match(profile.body, /Pemilik Uji/);

    const unauthenticated = await context.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });
    assert.equal(unauthenticated.statusCode, 401);

    const audit = await context.prisma.auditLog.findFirst({
      where: { action: "AUTH_LOGIN_SUCCESS", actorId: user.id },
    });
    assert.ok(audit);
  });

  it("mengunci akun setelah percobaan gagal berulang", async () => {
    await createUser(context.prisma, {
      email: "kunci@sekolah.test",
      name: "Akun Terkunci",
      password: "RahasiaUji!2026",
    });

    for (let attempt = 1; attempt < loginMaxAttempts; attempt += 1) {
      const failed = await loginRequest(context.app, "kunci@sekolah.test", `salah-${attempt}`);
      assert.equal(failed.statusCode, 401);
    }

    const locked = await loginRequest(context.app, "kunci@sekolah.test", "masih-salah");
    const lockedBody = jsonBody<ApiErrorBody>(locked);
    assert.equal(locked.statusCode, 423);
    assert.equal(lockedBody.error.code, "ACCOUNT_LOCKED");

    const correctWhileLocked = await loginRequest(context.app, "kunci@sekolah.test", "RahasiaUji!2026");
    assert.equal(correctWhileLocked.statusCode, 423);
  });

  it("menolak akun nonaktif walaupun kata sandi benar", async () => {
    await createUser(context.prisma, {
      email: "nonaktif@sekolah.test",
      name: "Nonaktif",
      password: "RahasiaUji!2026",
      isActive: false,
    });

    const wrong = await loginRequest(context.app, "nonaktif@sekolah.test", "salah");
    assert.equal(wrong.statusCode, 401);

    const correct = await loginRequest(context.app, "nonaktif@sekolah.test", "RahasiaUji!2026");
    const body = jsonBody<ApiErrorBody>(correct);
    assert.equal(correct.statusCode, 403);
    assert.equal(body.error.code, "ACCOUNT_DISABLED");
  });

  it("memutar refresh token dan mendeteksi pemakaian ulang", async () => {
    const user = await createUser(context.prisma, {
      email: "rotasi@sekolah.test",
      name: "Rotasi",
      password: "RahasiaUji!2026",
    });

    const school = await context.prisma.school.create({
      data: { name: "SMK Rotasi", npsn: "20990001", isActive: true },
    });
    await assignRole(context.prisma, { userId: user.id, roleCode: "TU", schoolId: school.id });

    const login = await loginRequest(context.app, "rotasi@sekolah.test", "RahasiaUji!2026");
    const first = jsonBody<LoginResponse>(login);
    const firstRefresh = readRefreshCookie(login);
    assert.ok(firstRefresh);

    const rotated = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: `${REFRESH_COOKIE}=${firstRefresh}` },
    });
    const second = jsonBody<LoginResponse>(rotated);
    const secondRefresh = readRefreshCookie(rotated);
    assert.equal(rotated.statusCode, 200);
    assert.ok(secondRefresh);
    assert.notEqual(secondRefresh, firstRefresh);
    assert.notEqual(second.accessToken, first.accessToken);

    const reuse = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: `${REFRESH_COOKIE}=${firstRefresh}` },
    });
    assert.equal(reuse.statusCode, 401);

    const familyRevoked = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: secondRefresh },
    });
    assert.equal(familyRevoked.statusCode, 401);

    const reuseAudit = await context.prisma.auditLog.findFirst({
      where: { action: "AUTH_REFRESH_REUSE", actorId: user.id },
    });
    assert.ok(reuseAudit);
  });

  it("logout hanya mencabut token yang dikirim", async () => {
    const user = await createUser(context.prisma, {
      email: "keluar@sekolah.test",
      name: "Keluar",
      password: "RahasiaUji!2026",
    });
    const school = await context.prisma.school.create({
      data: { name: "SMK Keluar", npsn: "20990002", isActive: true },
    });
    await assignRole(context.prisma, { userId: user.id, roleCode: "ADMIN_SEKOLAH", schoolId: school.id });

    const login = await loginRequest(context.app, "keluar@sekolah.test", "RahasiaUji!2026");
    const firstRefresh = readRefreshCookie(login);
    assert.ok(firstRefresh);

    const rotated = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: firstRefresh },
    });
    const secondRefresh = jsonBody<LoginResponse>(rotated).refreshToken;
    assert.equal(rotated.statusCode, 200);

    const logoutOld = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: { refreshToken: firstRefresh },
    });
    assert.equal(logoutOld.statusCode, 204);

    const stillValid = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: secondRefresh },
    });
    assert.equal(stillValid.statusCode, 200);
    const thirdRefresh = jsonBody<LoginResponse>(stillValid).refreshToken;

    const logoutCurrent = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: { refreshToken: thirdRefresh },
    });
    assert.equal(logoutCurrent.statusCode, 204);

    const blocked = await context.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: thirdRefresh },
    });
    assert.equal(blocked.statusCode, 401);
  });
});
