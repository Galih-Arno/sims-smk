const LABELS: Record<string, string> = {
  "/": "Beranda",
  "/pengguna": "Manajemen Pengguna",
  "/profil": "Profil Sekolah",
  "/tahun-pelajaran": "Tahun Pelajaran",
  "/semester": "Semester",
  "/bidang": "Bidang Keahlian",
  "/program": "Program Keahlian",
  "/konsentrasi": "Konsentrasi Keahlian",
  "/guru": "Guru",
  "/siswa": "Siswa",
  "/kelas": "Kelas",
  "/mapel": "Mata Pelajaran",
  "/kurikulum": "Kurikulum",
  "/pengaturan-nilai": "Pengaturan Nilai",
  "/pengaturan-absensi": "Kelengkapan Absensi",
  "/pembelajaran": "TP & Lingkup Materi",
  "/penugasan": "Penugasan Mengajar",
  "/wali-kelas": "Wali Kelas",
  "/nilai/penerimaan": "Penerimaan Nilai",
  "/validasi-rapor": "Validasi Rapor",
  "/pengesahan-rapor": "Pengesahan Rapor",
  "/impor": "Impor Data",
  "/guru/beranda": "Dashboard Guru",
  "/guru/kelas": "Kelas Saya",
  "/guru/nilai": "Input Nilai",
  "/guru/nilai-akhir": "Nilai Akhir",
  "/guru/deskripsi-capaian": "Deskripsi Capaian",
  "/guru/status-nilai": "Status Nilai",
  "/guru/absensi": "Absensi Siswa",
  "/wali/beranda": "Dashboard Wali Kelas",
  "/wali/penerimaan": "Penerimaan Nilai",
  "/wali/monitoring-nilai": "Monitoring Nilai",
  "/wali/persiapan-rapor": "Persiapan Rapor",
  "/wali/pratinjau-rapor": "Pratinjau Rapor",
  "/wali/pemeriksaan-rapor": "Pemeriksaan Rapor",
  "/wali/catatan-wali": "Catatan Wali Kelas",
  "/wali/deskripsi-capaian": "Deskripsi Capaian",
  "/wali/rekap-absensi": "Rekap Absensi",
  "/wali/absensi-harian": "Absensi Harian",
  "/wali/nilai-akhir": "Nilai Akhir",
  "/wali/rekap-nilai": "Rekap Nilai Akhir",
  "/akun": "Profil Saya",
  "/akun/sandi": "Ubah Password",
};

export function crumbsFor(pathname: string): { label: string; to?: string }[] {
  if (pathname === "/") return [{ label: "Beranda" }];
  const label = LABELS[pathname] ?? "Halaman";
  const home = pathname.startsWith("/guru") ? "/guru/beranda" : pathname.startsWith("/wali") ? "/wali/beranda" : "/";
  if (pathname === home) return [{ label }];
  return [{ label: "Beranda", to: home }, { label }];
}
