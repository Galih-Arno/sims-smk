import { isOwner, rolesAtSchool } from "../lib/access.ts";
import type { DashboardPayload } from "../lib/dashboard.ts";
import { useAuth } from "../lib/auth.tsx";
import { useSchoolScope } from "../lib/school.tsx";
import { RoleDashboard } from "../components/dashboard/RoleDashboard.tsx";

function homeView(user: NonNullable<ReturnType<typeof useAuth>["user"]>, schoolId: string): DashboardPayload["view"] {
  if (isOwner(user)) return "owner";
  const roles = rolesAtSchool(user, schoolId);
  if (roles.includes("KEPALA_SEKOLAH")) return "kepala";
  if (roles.includes("WAKAKUR")) return "wakakur";
  return "admin";
}

const COPY: Record<DashboardPayload["view"], { title: string; subtitle: string }> = {
  owner: {
    title: "Beranda pemilik sistem",
    subtitle: "Ringkasan seluruh sekolah dan pengguna. Angka mengikuti data yang tersimpan.",
  },
  admin: {
    title: "Beranda admin sekolah",
    subtitle: "Ringkasan data pokok sekolah yang sedang dipilih.",
  },
  kepala: {
    title: "Beranda kepala sekolah",
    subtitle: "Ringkasan nilai, kehadiran, dan pengesahan rapor pada semester aktif.",
  },
  wakakur: {
    title: "Beranda wakil kepala kurikulum",
    subtitle: "Progres nilai, kelengkapan kurikulum, dan rapor yang menunggu validasi.",
  },
  guru: {
    title: "Dashboard guru",
    subtitle: "Kelas, mata pelajaran, dan status nilai sesuai penugasan Anda.",
  },
  wali: {
    title: "Dashboard wali kelas",
    subtitle: "Siswa binaan, kelengkapan nilai, absensi, dan status rapor.",
  },
};

export function DashboardPage() {
  const { user } = useAuth();
  const { schoolId } = useSchoolScope();
  if (!user) return null;
  const view = homeView(user, schoolId);
  const copy = COPY[view];
  return <RoleDashboard view={view} schoolId={schoolId} title={copy.title} subtitle={copy.subtitle} />;
}
