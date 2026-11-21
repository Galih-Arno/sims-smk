import type { RoleCode } from "@sims/shared";
import type { PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { writeAudit } from "./audit.ts";
import type { AuthState } from "./auth-state.ts";
import { AppError } from "./errors.ts";
import { MSG } from "./messages.ts";

export type RequestMeta = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function requestMeta(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers["user-agent"];
  const rawAgent = Array.isArray(userAgent) ? userAgent[0] : userAgent;
  return {
    ipAddress: request.ip ? request.ip.slice(0, 64) : null,
    userAgent: rawAgent ? rawAgent.slice(0, 512) : null,
  };
}

export async function assertSchoolAccess(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<void> {
  if (auth.isSystemOwner) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) {
      throw new AppError(404, "SCHOOL_NOT_FOUND", MSG.schoolNotFound);
    }
    return;
  }

  const allowed = auth.assignments.some((assignment) => assignment.schoolId === schoolId);
  if (!allowed) {
    await denyTenant(prisma, auth, schoolId, meta);
  }
}

export async function assertSchoolRole(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  roles: readonly RoleCode[],
  meta: RequestMeta,
): Promise<void> {
  if (auth.isSystemOwner) {
    await assertSchoolAccess(prisma, auth, schoolId, meta);
    return;
  }

  const allowed = auth.assignments.some(
    (assignment) => assignment.schoolId === schoolId && roles.includes(assignment.roleCode),
  );
  if (!allowed) {
    await denyTenant(prisma, auth, schoolId, meta);
  }
}

async function denyTenant(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
): Promise<never> {
  await writeAudit(prisma, {
    actorId: auth.userId,
    action: "TENANT_ACCESS_DENIED",
    entityType: "School",
    entityId: schoolId,
    metadata: { schoolId },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  throw new AppError(403, "TENANT_FORBIDDEN", MSG.tenant);
}
