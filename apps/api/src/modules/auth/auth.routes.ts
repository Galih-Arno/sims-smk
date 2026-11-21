import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AUTH_COOKIE_PATH, REFRESH_COOKIE, config } from "../../config.ts";
import { AppError } from "../../lib/errors.ts";
import { MSG } from "../../lib/messages.ts";
import { enforceSchoolAccessStatus } from "../../lib/school-access.ts";
import { requestMeta } from "../../lib/tenant.ts";
import { verifyAccessToken } from "../../lib/tokens.ts";
import { parseInput } from "../../lib/validation.ts";
import { toAuthUser } from "../../lib/auth-state.ts";
import { changePassword, login, logout, refreshSession, requireAuthState } from "./auth.service.ts";
import { changePasswordSchema, loginSchema, refreshSchema } from "./auth.schema.ts";

function refreshCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    path: AUTH_COOKIE_PATH,
    maxAge,
  };
}

function setRefreshCookie(reply: FastifyReply, token: string, maxAge: number) {
  reply.setCookie(REFRESH_COOKIE, token, refreshCookieOptions(maxAge));
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, {
    path: AUTH_COOKIE_PATH,
    sameSite: "lax",
    httpOnly: true,
    secure: config.cookieSecure,
  });
}

function readRefreshToken(request: FastifyRequest, bodyToken?: string): string | null {
  if (bodyToken) {
    return bodyToken;
  }
  const cookie = request.cookies[REFRESH_COOKIE];
  return cookie || null;
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }

  const token = header.slice("Bearer ".length).trim();
  let userId = "";
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }

  request.auth = await requireAuthState(request.server.prisma, userId);
  if (request.auth.mustChangePassword) {
    const path = request.url.split("?")[0] ?? "";
    const allowed = path.endsWith("/auth/password") || path.endsWith("/auth/me") || path.endsWith("/auth/logout");
    if (!allowed) {
      throw new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Ganti kata sandi sebelum melanjutkan.");
    }
    return;
  }
  await enforceSchoolAccessStatus(request);
}

export function getAuth(request: FastifyRequest) {
  if (!request.auth) {
    throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
  }
  return request.auth;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  app.post(
    "/login",
    config.nodeEnv === "test"
      ? {}
      : {
          config: {
            rateLimit: {
              max: 10,
              timeWindow: "1 minute",
            },
          },
        },
    async (request, reply) => {
      const body = parseInput(loginSchema, request.body ?? {});
      const result = await login(app.prisma, body, requestMeta(request));
      setRefreshCookie(reply, result.refreshToken, result.refreshTokenMaxAgeSeconds);
      return {
        accessToken: result.accessToken,
        accessTokenExpiresIn: result.accessTokenExpiresIn,
        refreshToken: result.refreshToken,
        user: result.user,
      };
    },
  );

  app.post("/refresh", async (request, reply) => {
    const body = parseInput(refreshSchema, request.body ?? {});
    const rawToken = readRefreshToken(request, body.refreshToken);
    if (!rawToken) {
      throw new AppError(401, "UNAUTHENTICATED", MSG.unauthenticated);
    }
    const result = await refreshSession(app.prisma, rawToken, requestMeta(request));
    setRefreshCookie(reply, result.refreshToken, result.refreshTokenMaxAgeSeconds);
    return {
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  });

  app.post("/logout", async (request, reply) => {
    const body = parseInput(refreshSchema, request.body ?? {});
    await logout(app.prisma, readRefreshToken(request, body.refreshToken), requestMeta(request));
    clearRefreshCookie(reply);
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    return { user: toAuthUser(getAuth(request)) };
  });

  app.post("/password", { preHandler: requireAuth }, async (request) => {
    const body = parseInput(changePasswordSchema, request.body ?? {});
    const state = await changePassword(app.prisma, getAuth(request), body, requestMeta(request));
    return { user: toAuthUser(state) };
  });
}
