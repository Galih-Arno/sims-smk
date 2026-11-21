import type { RoleCode } from "@sims/shared";
import { ROLE_DEFINITIONS, isRoleCode } from "@sims/shared";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.ts";

type AssignmentDb = Pick<PrismaClient, "role" | "userRole">;

export async function ensureRoles(prisma: Pick<PrismaClient, "role">): Promise<void> {
  for (const role of ROLE_DEFINITIONS) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        scope: role.scope,
      },
      create: {
        code: role.code,
        name: role.name,
        description: role.description,
        scope: role.scope,
      },
    });
  }
}

export async function grantAssignment(
  prisma: AssignmentDb,
  input: { userId: string; roleCode: RoleCode; schoolId: string | null },
) {
  const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
  if (!role || !isRoleCode(role.code)) {
    throw new AppError(500, "ROLE_MISSING", "Peran tidak ditemukan.");
  }

  if (role.scope === "PLATFORM" && input.schoolId) {
    throw new AppError(400, "INVALID_ASSIGNMENT", "Peran platform tidak boleh dikaitkan ke sekolah.");
  }

  if (role.scope === "SCHOOL" && !input.schoolId) {
    throw new AppError(400, "INVALID_ASSIGNMENT", "Peran sekolah wajib memiliki sekolah.");
  }

  const existing = await prisma.userRole.findFirst({
    where: {
      userId: input.userId,
      roleId: role.id,
      schoolId: input.schoolId,
    },
  });

  if (existing) {
    if (!existing.isActive) {
      return prisma.userRole.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    return existing;
  }

  return prisma.userRole.create({
    data: {
      userId: input.userId,
      roleId: role.id,
      schoolId: input.schoolId,
    },
  });
}
