import type { RoleCode } from "@sims/shared";
import type { AuthUserDto } from "@sims/shared";

const STAFF_ROLES: readonly RoleCode[] = [
  "ADMIN_SEKOLAH", "OPERATOR_SEKOLAH", "WAKAKUR", "KEPALA_SEKOLAH",
  "WAKA_KESISWAAN", "WAKA_SARPRAS", "WAKA_HUMAS", "BENDAHARA", "TU", "KOMITE_SEKOLAH"
];

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
  const r = rolesAtSchool(user, schoolId);
  return isOwner(user) || r.includes("ADMIN_SEKOLAH") || r.includes("OPERATOR_SEKOLAH");
}

export function canCoordinate(user: AuthUserDto | null, schoolId: string): boolean {
  const r = rolesAtSchool(user, schoolId);
  return isOwner(user) || r.includes("ADMIN_SEKOLAH") || r.includes("OPERATOR_SEKOLAH") || r.includes("WAKAKUR");
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

export function isKaprog(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("KAPROG");
}

export function isWakaKesiswaan(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("WAKA_KESISWAAN");
}

export function isWakaSarpras(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("WAKA_SARPRAS");
}

export function isWakaHumas(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("WAKA_HUMAS");
}

export function isBendahara(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("BENDAHARA");
}

export function isKomite(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("KOMITE_SEKOLAH");
}

export function isTu(user: AuthUserDto | null, schoolId: string): boolean {
  return rolesAtSchool(user, schoolId).includes("TU");
}

export function jobTitle(user: AuthUserDto | null, schoolId: string, portal: "admin" | "guru" | "wali"): string {
  if (portal === "guru") return "Guru Mata Pelajaran";
  if (portal === "wali") return "Wali Kelas";
  return allJobTitles(user, schoolId)[0] ?? "Pengguna";
}

export function allJobTitles(user: AuthUserDto | null, schoolId: string, hasTeachings = false, hasHomerooms = false): string[] {
  const titles: string[] = [];
  if (isOwner(user)) titles.push("Pemilik Sistem");
  const r = rolesAtSchool(user, schoolId);
  if (r.includes("KEPALA_SEKOLAH")) titles.push("Kepala Sekolah");
  if (r.includes("KOMITE_SEKOLAH")) titles.push("Komite Sekolah");
  if (r.includes("WAKAKUR")) titles.push("Wakil Kepala Kurikulum");
  if (r.includes("WAKA_KESISWAAN")) titles.push("Waka Kesiswaan");
  if (r.includes("WAKA_SARPRAS")) titles.push("Waka Sarpras");
  if (r.includes("WAKA_HUMAS")) titles.push("Waka Humas");
  if (r.includes("BENDAHARA")) titles.push("Bendahara Sekolah");
  if (r.includes("KAPROG")) titles.push("Kepala Program Keahlian");
  if (r.includes("OPERATOR_SEKOLAH")) titles.push("Operator Sekolah");
  if (r.includes("ADMIN_SEKOLAH")) titles.push("Admin Sekolah");
  if (r.includes("TU")) titles.push("Tata Usaha");
  if (r.includes("WALI_KELAS") || hasHomerooms) titles.push("Wali Kelas");
  if (r.includes("GURU_MAPEL") || hasTeachings) titles.push("Guru Mata Pelajaran");
  return titles.length > 0 ? titles : ["Pengguna"];
}
