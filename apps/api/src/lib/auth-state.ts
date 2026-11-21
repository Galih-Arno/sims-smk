import type { AuthUserDto, RoleCode, RoleScope } from "@sims/shared";
import { isRoleCode } from "@sims/shared";
import type { PrismaClient } from "@prisma/client";

export type AssignmentState = {
  roleCode: RoleCode;
  roleName: string;
  scope: RoleScope;
  schoolId: string | null;
  schoolName: string | null;
};

export type AuthState = {
  userId: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  isSystemOwner: boolean;
  assignments: AssignmentState[];
};

export function toAuthUser(state: AuthState): AuthUserDto {
  return {
    id: state.userId,
    email: state.email,
    name: state.name,
    mustChangePassword: state.mustChangePassword,
    assignments: state.assignments.map((assignment) => ({
      roleCode: assignment.roleCode,
      roleName: assignment.roleName,
      scope: assignment.scope,
      schoolId: assignment.schoolId,
      schoolName: assignment.schoolName,
    })),
  };
}

export async function loadAuthState(prisma: PrismaClient, userId: string): Promise<AuthState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      assignments: {
        where: { isActive: true },
        include: {
          role: true,
          school: { select: { name: true } },
        },
      },
    },
  });

  if (!user?.isActive) {
    return null;
  }

  const assignments: AssignmentState[] = [];
  for (const assignment of user.assignments) {
    if (!isRoleCode(assignment.role.code)) {
      continue;
    }
    assignments.push({
      roleCode: assignment.role.code,
      roleName: assignment.role.name,
      scope: assignment.role.scope,
      schoolId: assignment.schoolId,
      schoolName: assignment.school?.name ?? null,
    });
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    mustChangePassword: user.mustChangePassword,
    isSystemOwner: assignments.some((assignment) => assignment.roleCode === "SYSTEM_OWNER"),
    assignments,
  };
}

export function assignedSchoolIds(auth: AuthState): string[] {
  const ids = new Set<string>();
  for (const assignment of auth.assignments) {
    if (assignment.schoolId) {
      ids.add(assignment.schoolId);
    }
  }
  return [...ids];
}
