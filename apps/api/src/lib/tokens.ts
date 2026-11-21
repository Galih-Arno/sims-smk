import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config.ts";

export type AccessTokenPayload = {
  sub: string;
  typ: "access";
};

export function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const expiresIn = config.jwtAccessTtlSeconds;
  const token = jwt.sign({ sub: userId, typ: "access", jti: randomUUID() }, config.jwtAccessSecret, {
    expiresIn,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });
  return { token, expiresIn };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, config.jwtAccessSecret, {
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });

  if (!isAccessPayload(payload)) {
    throw new Error("Token akses tidak valid.");
  }

  return payload;
}

function isAccessPayload(payload: string | JwtPayload): payload is AccessTokenPayload & JwtPayload {
  return (
    typeof payload !== "string" &&
    payload.typ === "access" &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0
  );
}

export function newRefreshToken(familyId: string = randomUUID()): { raw: string; tokenHash: string; familyId: string } {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    tokenHash: hashRefreshToken(raw),
    familyId,
  };
}

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + config.jwtRefreshTtlDays * 24 * 60 * 60 * 1000);
}

export function refreshMaxAgeSeconds(): number {
  return config.jwtRefreshTtlDays * 24 * 60 * 60;
}
