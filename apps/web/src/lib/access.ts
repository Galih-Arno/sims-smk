import type { RoleCode } from "@sims/shared";
import type { AuthUserDto } from "@sims/shared";

const STAFF_ROLES: readonly RoleCode[] = ["ADMIN_SEKOLAH", "WAKAKUR", "KEPALA_SEKOLAH", "TU"];

export function rolesAtSchool(user: AuthUserDto | null, schoolId: string): RoleCode[] {
  if (!user) return [];
  return user.assignments
    .filter((assignment) => assignment.roleCode === "SYSTEM_OWNER" || assignment.schoolId === schoolId)
    .map((assignment) => assignment.roleCode);
}

export function isOwner(user: AuthUserDto | null): boolean {
  return user?.assignments.some((assignment) => assignment.roleCode === "SYSTEM_OWNER") ?? false;
}

export function isStaff(user: AuthUserDto | null, schoolId: string): boolean {
  if (isOwner(user)) return true;
  return rolesAtSchool(user, schoolId).some((role) => STAFF_ROLES.includes(role));
}

export function isSchoolAdmin(user: AuthUserDto | null, schoolId: string): boolean {
  return isOwner(user) || rolesAtSchool(user, schoolId).includes("ADMIN_SEKOLAH");
}

export function canCoordinate(user: AuthUserDto | null, schoolId: string): boolean {
  const roles = rolesAtSchool(user, schoolId);
  return isOwner(user) || roles.includes("ADMIN_SEKOLAH") || roles.includes("WAKAKUR");
}

export function canActivateGradePolicy(user: AuthUserDto | null, schoolId: string): boolean {
  return isOwner(user) || rolesAtSchool(user, schoolId).includes("WAKAKUR");
}

export function isGuru(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("GURU_MAPEL");
}

export function isWali(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("WALI_KELAS");
}

export function isWakakur(user: AuthUserDto | null, schoolId: string): boolean {
  return isOwner(user) || rolesAtSchool(user, schoolId).includes("WAKAKUR");
}

export function isPrincipal(user: AuthUserDto | null, schoolId: string): boolean {
  return isOwner(user) || rolesAtSchool(user, schoolId).includes("KEPALA_SEKOLAH");
}

export function jobTitle(user: AuthUserDto | null, schoolId: string, portal: "admin" | "guru" | "wali"): string {
  if (portal === "guru") return "Guru Mata Pelajaran";
  if (portal === "wali") return "Wali Kelas";
  if (isOwner(user)) return "Pemilik Sistem";
  const roles = rolesAtSchool(user, schoolId);
  if (roles.includes("KEPALA_SEKOLAH")) return "Kepala Sekolah";
  if (roles.includes("WAKAKUR")) return "Wakil Kepala Kurikulum";
  if (roles.includes("ADMIN_SEKOLAH")) return "Admin Sekolah";
  if (roles.includes("TU")) return "Tata Usaha";
  return "Pengguna";
}
