import type { RoleCode } from "@sims/shared";

export type SopStep = {
  actor: string;
  roles: RoleCode[];
  action: string;
  formName: string;
  actionTo: string;
  actionLabel: string;
  handoffTo: string;
};

export type SopItem = {
  code: string;
  title: string;
  domain: string;
  trigger: string;
  outcome: string;
  steps: SopStep[];
};

export const SOP_FRAMEWORK: SopItem[] = [
  {
    code: "SOP-01",
    title: "Siklus Tahun Ajaran, PPDB & Kenaikan Kelas",
    domain: "Fondasi Longitudinal & Multi-Jurusan",
    trigger: "Pergantian Tahun Pelajaran / Semester Baru",
    outcome: "Arsip tahun lalu terkunci; siswa naik kelas/lulus menjadi alumni; jadwal & wali kelas aktif.",
    steps: [
      { actor: "Operator / Admin", roles: ["OPERATOR_SEKOLAH", "ADMIN_SEKOLAH"], action: "Membuka tahun ajaran baru, promosi kenaikan kelas (X→XI→XII→Alumni), & konversi rombel PPDB.", formName: "Wizard Kenaikan Kelas & Impor PPDB", actionTo: "/kelas", actionLabel: "Kelola Kelas", handoffTo: "Waka Kurikulum" },
      { actor: "Waka Kurikulum", roles: ["WAKAKUR"], action: "Menyusun kurikulum per konsentrasi keahlian, SK mengajar guru mapel, & penetapan wali kelas.", formName: "Form Penugasan Mengajar & Wali Kelas", actionTo: "/penugasan", actionLabel: "Penugasan Guru", handoffTo: "Guru Mapel & Wali Kelas" },
    ],
  },
  {
    code: "SOP-02",
    title: "KBM Harian, Presensi & Eskalasi Disiplin",
    domain: "Operasional Kelas Real-Time",
    trigger: "Jadwal pelajaran harian berlangsung",
    outcome: "Jurnal & kehadiran terekam per jam; ketidakhadiran langsung ditindaklanjuti Wali/BK.",
    steps: [
      { actor: "Guru Mapel", roles: ["GURU_MAPEL"], action: "Mengisi jurnal materi/TP dan presensi siswa 1-ketuk (default Hadir) langsung di kelas.", formName: "Form Jurnal & Presensi KBM Terpadu", actionTo: "/guru/jurnal", actionLabel: "Isi Jurnal", handoffTo: "Wali Kelas" },
      { actor: "Wali Kelas", roles: ["WALI_KELAS"], action: "Menerima peringatan siswa Alpa/bolos antar-jam dan mencatat konfirmasi orang tua.", formName: "Form Tindak Lanjut Absensi Wali", actionTo: "/wali/absensi-harian", actionLabel: "Absensi Harian", handoffTo: "Waka Kesiswaan / BK" },
      { actor: "Waka Kesiswaan / BK", roles: ["WAKA_KESISWAAN", "KEPALA_SEKOLAH"], action: "Menangani eskalasi pelanggaran/alpa berulang lewat sesi konseling & panggilan orang tua.", formName: "Form Konseling & Pembinaan Karakter", actionTo: "/kesiswaan/karakter-bk", actionLabel: "Karakter & BK", handoffTo: "Arsip Sikap Rapor" },
    ],
  },
  {
    code: "SOP-03",
    title: "Penilaian, Rapor & Pengesahan Berjenjang",
    domain: "Penjaminan Mutu Akademik",
    trigger: "Periode STS / SAS / Akhir Semester",
    outcome: "Rapor berstatus Draf → Diajukan → Disetujui Wakakur → Disahkan Kepsek & siap cetak.",
    steps: [
      { actor: "Guru Mapel", roles: ["GURU_MAPEL"], action: "Menginput nilai formatif/sumatif/ujian & deskripsi capaian TP, lalu mengirim ke Wali Kelas.", formName: "Grid Nilai Cepat & Generator Deskripsi", actionTo: "/guru/nilai", actionLabel: "Input Nilai", handoffTo: "Wali Kelas" },
      { actor: "Wali Kelas", roles: ["WALI_KELAS"], action: "Memeriksa kelengkapan nilai semua mapel, mengisi catatan wali & ekskul, lalu mengajukan paket rapor.", formName: "Form Persiapan & Pemeriksaan Rapor", actionTo: "/wali/persiapan-rapor", actionLabel: "Persiapan Rapor", handoffTo: "Waka Kurikulum" },
      { actor: "Waka Kurikulum", roles: ["WAKAKUR"], action: "Memvalidasi ketuntasan KKTP & kelengkapan rapor kelas sebelum diteruskan ke Kepala Sekolah.", formName: "Panel Validasi Rapor Kurikulum", actionTo: "/validasi-rapor", actionLabel: "Validasi Rapor", handoffTo: "Kepala Sekolah" },
      { actor: "Kepala Sekolah", roles: ["KEPALA_SEKOLAH"], action: "Meninjau ringkasan kelayakan akademik & mengesahkan rapor digital.", formName: "Panel Pengesahan Rapor Digital", actionTo: "/pengesahan-rapor", actionLabel: "Pengesahan Rapor", handoffTo: "Portal Wali & Cetak" },
    ],
  },
  {
    code: "SOP-04",
    title: "Tata Kelola Vokasi: Bengkel/Lab & Uji Kompetensi",
    domain: "Kekhasan Kejuruan Lintas Jurusan",
    trigger: "Kebutuhan praktik semesteran & UKK Kelas XII",
    outcome: "Aset bengkel per jurusan terawat, bahan praktik terpenuhi, & hasil UKK terdata.",
    steps: [
      { actor: "Kaprog (Tiap Jurusan)", roles: ["KAPROG"], action: "Mendata inventaris alat bengkel, mengajukan bahan praktik/perbaikan alat, & input hasil UKK jurusan.", formName: "Form Inventaris & Pengajuan RAB Jurusan", actionTo: "/vokasi/inventaris", actionLabel: "Bengkel & Lab", handoffTo: "Waka Sarpras" },
      { actor: "Waka Sarpras", roles: ["WAKA_SARPRAS"], action: "Memverifikasi kondisi teknis sarana praktik & meneruskan kebutuhan pengadaan ke Bendahara.", formName: "Form Inspeksi & Persetujuan Sarpras", actionTo: "/vokasi/inventaris", actionLabel: "Cek Sarpras", handoffTo: "Bendahara Sekolah" },
    ],
  },
  {
    code: "SOP-05",
    title: "Prakerin (PKL) & Jejaring BKK Alumni Lintas Angkatan",
    domain: "Kemitraan Industri & Penelusuran Tamatan",
    trigger: "Penempatan PKL Kelas XI/XII & Kelulusan Siswa",
    outcome: "Nilai PKL masuk rapor; alumni terdahulu s.d. terbaru terpetakan dalam Tracer Study BMW.",
    steps: [
      { actor: "Waka Humas & BKK", roles: ["WAKA_HUMAS"], action: "Mendaftarkan mitra DUDI, MoU industri, lowongan BKK, & rekap tracer study alumni lintas angkatan.", formName: "Form Mitra DUDI & Tracer Study BMW", actionTo: "/vokasi/bkk", actionLabel: "BKK & Alumni", handoffTo: "Kaprog & Alumni" },
      { actor: "Kaprog & Pembimbing", roles: ["KAPROG", "GURU_MAPEL"], action: "Memetakan penempatan siswa PKL sesuai konsentrasi keahlian & memantau jurnal/nilai industri.", formName: "Form Penempatan & Monitoring PKL", actionTo: "/kesiswaan/pkl", actionLabel: "Prakerin / PKL", handoffTo: "Nilai Rapor & BKK" },
    ],
  },
  {
    code: "SOP-06",
    title: "Kepegawaian, Absen GPS, Izin/Cuti & Guru Pengganti",
    domain: "Kedisiplinan & Kontinuitas Kelas",
    trigger: "Kehadiran harian & pengajuan izin pegawai",
    outcome: "Rekap presensi tervalidasi; jam mengajar guru yang izin terisi tugas/pengganti.",
    steps: [
      { actor: "Semua Pegawai", roles: ["GURU_MAPEL", "WALI_KELAS", "KAPROG", "WAKAKUR", "WAKA_KESISWAAN", "WAKA_SARPRAS", "WAKA_HUMAS", "BENDAHARA", "OPERATOR_SEKOLAH", "ADMIN_SEKOLAH", "TU", "KEPALA_SEKOLAH"], action: "Melakukan check-in/out GPS harian & mengajukan izin/cuti beserta tugas kelas bila mengajar.", formName: "Form Absensi GPS & Izin Terintegrasi Jadwal", actionTo: "/pegawai/presensi", actionLabel: "Absen GPS", handoffTo: "TU & Kepala Sekolah" },
      { actor: "Tata Usaha & Kepsek", roles: ["TU", "KEPALA_SEKOLAH"], action: "Memverifikasi pengajuan izin/cuti & mengunci rekap kehadiran bulanan.", formName: "Panel Persetujuan Izin & Rekap HR", actionTo: "/pegawai/izin", actionLabel: "Izin & Cuti", handoffTo: "Bendahara (Payroll)" },
    ],
  },
  {
    code: "SOP-07",
    title: "E-Payroll Terintegrasi Beban Kerja & Jabatan Rangkap",
    domain: "Kesejahteraan Pegawai",
    trigger: "Tutup buku presensi bulanan",
    outcome: "Slip gaji digital terbit otomatis ke kartu hero tiap pegawai sesuai kehadiran & jabatan aktif.",
    steps: [
      { actor: "Bendahara & Kepala TU", roles: ["BENDAHARA", "TU", "ADMIN_SEKOLAH"], action: "Menarik rekap kehadiran GPS, beban JP mengajar, & tunjangan multi-role untuk menerbitkan slip gaji.", formName: "Generator Payroll Lintas Modul", actionTo: "/keuangan/payroll", actionLabel: "Kelola Payroll", handoffTo: "Seluruh Pegawai" },
    ],
  },
  {
    code: "SOP-08",
    title: "Keuangan Siswa (SPP/Komite) & Transparansi Komite",
    domain: "Akuntabilitas Keuangan Sekolah",
    trigger: "Tagihan bulanan & laporan realisasi program",
    outcome: "Status pembayaran tampil real-time di Portal Wali; Komite & Kepsek memantau transparansi.",
    steps: [
      { actor: "Bendahara Sekolah", roles: ["BENDAHARA", "ADMIN_SEKOLAH"], action: "Mencatat pembayaran SPP/komite siswa (mendukung cicilan & beasiswa) serta realisasi anggaran.", formName: "Form Loket SPP & Realisasi Anggaran", actionTo: "/keuangan/spp", actionLabel: "Keuangan SPP", handoffTo: "Kepala Sekolah & Komite" },
      { actor: "Kepala Sekolah & Komite", roles: ["KEPALA_SEKOLAH", "KOMITE_SEKOLAH"], action: "Memantau transparansi realisasi penerimaan & belanja program sekolah.", formName: "Dasbor Pengawasan Keuangan & Komite", actionTo: "/keuangan/spp", actionLabel: "Pantau Keuangan", handoffTo: "Portal Wali Murid" },
    ],
  },
];
