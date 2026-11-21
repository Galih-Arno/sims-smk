import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "./auth-state.ts";
import { AppError } from "./errors.ts";

const SCHOOL_PATH = /\/schools\/([^/?]+)/;
const STATUS_PATH = /\/schools\/[^/]+\/access-status$/;

export async function enforceSchoolAccessStatus(request: FastifyRequest): Promise<void> {
  const auth = request.auth;
  if (!auth) return;
  const path = request.url.split("?")[0] ?? "";
  const schoolId = schoolIdFromPath(path);
  if (!schoolId) return;
  if (request.method === "PATCH" && STATUS_PATH.test(path)) return;
  await assertSchoolOperational(request.server.prisma, auth, schoolId, request.method);
}

export async function assertSchoolOperational(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  method: string,
): Promise<void> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { accessStatus: true },
  });
  if (!school || school.accessStatus === "AKTIF") return;
  if (auth.isSystemOwner && method === "GET") return;
  throw new AppError(
    403,
    school.accessStatus === "DITANGGUHKAN" ? "SCHOOL_SUSPENDED" : "SCHOOL_INACTIVE",
    school.accessStatus === "DITANGGUHKAN"
      ? "Sekolah ini ditangguhkan. Operasi sekolah tidak dapat dilakukan."
      : "Sekolah ini nonaktif. Operasi sekolah tidak dapat dilakukan.",
  );
}

function schoolIdFromPath(path: string): string | null {
  const match = SCHOOL_PATH.exec(path);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
