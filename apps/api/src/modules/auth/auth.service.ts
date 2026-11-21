import type { PrismaClient } from "@prisma/client";
import { config } from "../../config.ts";
import { writeAudit } from "../../lib/audit.ts";
import { loadAuthState, toAuthUser, type AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { hashPassword, verifyPassword } from "../../lib/password.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import {
  hashRefreshToken,
  newRefreshToken,
  refreshExpiryDate,
  refreshMaxAgeSeconds,
  signAccessToken,
} from "../../lib/tokens.ts";
import type { ChangePasswordInput, LoginInput } from "./auth.schema.ts";

export type SessionResult = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenMaxAgeSeconds: number;
  user: ReturnType<typeof toAuthUser>;
};

export async function login(
  prisma: PrismaClient,
  input: LoginInput,
  meta: RequestMeta,
): Promise<SessionResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordOk = await verifyPassword(user?.passwordHash ?? null, input.password);

  if (!user) {
    await writeAudit(prisma, {
      action: "AUTH_LOGIN_FAILED",
      entityType: "User",
      metadata: { email: input.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError(401, "INVALID_CREDENTIALS", MSG.invalidCredentials);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await writeAudit(prisma, {
      actorId: user.id,
      action: "AUTH_LOGIN_BLOCKED",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError(423, "ACCOUNT_LOCKED", MSG.locked);
  }

  if (!passwordOk) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });

    if (updated.failedLoginAttempts >= config.loginMaxAttempts) {
      const lockedUntil = new Date(Date.now() + config.loginLockMinutes * 60_000);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil },
        }),
        prisma.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      await writeAudit(prisma, {
        actorId: user.id,
        action: "AUTH_ACCOUNT_LOCKED",
        entityType: "User",
        entityId: user.id,
        metadata: { email: user.email, attempts: updated.failedLoginAttempts },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new AppError(423, "ACCOUNT_LOCKED", MSG.locked);
    }

    await writeAudit(prisma, {
      actorId: user.id,
      action: "AUTH_LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError(401, "INVALID_CREDENTIALS", MSG.invalidCredentials);
  }

  if (!user.isActive) {
    await writeAudit(prisma, {
      actorId: user.id,
      action: "AUTH_LOGIN_DISABLED",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError(403, "ACCOUNT_DISABLED", MSG.disabled);
  }

  const refresh = newRefreshToken();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refresh.tokenHash,
        familyId: refresh.familyId,
        expiresAt: refreshExpiryDate(),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    await writeAudit(tx, {
      actorId: user.id,
      action: "AUTH_LOGIN_SUCCESS",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return issueSession(prisma, user.id, refresh.raw);
}

export async function refreshSession(
  prisma: PrismaClient,
  rawToken: string,
  meta: RequestMeta,
): Promise<SessionResult> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
  });

  if (!existing) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }

  if (existing.revokedAt) {
    await revokeTokenFamily(prisma, existing.familyId);
    await writeAudit(prisma, {
      actorId: existing.userId,
      action: "AUTH_REFRESH_REUSE",
      entityType: "RefreshToken",
      entityId: existing.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }

  const state = await loadAuthState(prisma, existing.userId);
  if (!state) {
    await revokeTokenFamily(prisma, existing.familyId);
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }

  const rotated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count !== 1) {
      await tx.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAudit(tx, {
        actorId: existing.userId,
        action: "AUTH_REFRESH_REUSE",
        entityType: "RefreshToken",
        entityId: existing.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return null;
    }

    const next = newRefreshToken(existing.familyId);
    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: next.tokenHash,
        familyId: next.familyId,
        expiresAt: refreshExpiryDate(),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { replacedById: created.id },
    });
    await writeAudit(tx, {
      actorId: existing.userId,
      action: "AUTH_REFRESH",
      entityType: "User",
      entityId: existing.userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return next.raw;
  });

  if (!rotated) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }

  return issueSession(prisma, existing.userId, rotated);
}

export async function logout(prisma: PrismaClient, rawToken: string | null, meta: RequestMeta): Promise<void> {
  if (!rawToken) {
    return;
  }

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawToken) },
  });

  if (!existing || existing.revokedAt) {
    return;
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  await writeAudit(prisma, {
    actorId: existing.userId,
    action: "AUTH_LOGOUT",
    entityType: "User",
    entityId: existing.userId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function changePassword(
  prisma: PrismaClient,
  auth: AuthState,
  input: ChangePasswordInput,
  meta: RequestMeta,
): Promise<AuthState> {
  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  const currentOk = await verifyPassword(user?.passwordHash ?? null, input.currentPassword);
  if (!user || !currentOk) {
    throw new AppError(400, "VALIDATION_ERROR", "Kata sandi saat ini tidak sesuai.");
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError(400, "VALIDATION_ERROR", "Kata sandi baru harus berbeda.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  await writeAudit(prisma, {
    actorId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const state = await loadAuthState(prisma, user.id);
  if (!state) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }
  return state;
}

export async function requireAuthState(prisma: PrismaClient, userId: string): Promise<AuthState> {
  const state = await loadAuthState(prisma, userId);
  if (!state) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }
  return state;
}

async function issueSession(prisma: PrismaClient, userId: string, refreshToken: string): Promise<SessionResult> {
  const state = await loadAuthState(prisma, userId);
  if (!state) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }
  const access = signAccessToken(userId);
  return {
    accessToken: access.token,
    accessTokenExpiresIn: access.expiresIn,
    refreshToken,
    refreshTokenMaxAgeSeconds: refreshMaxAgeSeconds(),
    user: toAuthUser(state),
  };
}

async function revokeTokenFamily(prisma: PrismaClient, familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
