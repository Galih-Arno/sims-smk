# Status Implementasi Kerangka Kerja 8 SOP — SAKTI-Ku (SIMS SMK)

**Pembaruan Terakhir:** 22 November 2026
**Status Kompilasi TypeScript (@sims/web):** Lulus bersih (tsc --noEmit)

---

## 1. SOP yang Sudah Selesai Dikerjakan & Terintegrasi

### Kompas Operasional Terpadu (/sop-kerja)
- Pemetaan 8 SOP operasional sekolah berbasis peran (Role-Based Access Control).
- Filter "SOP Tugas Saya" dan pintasan estafet lintas peran langsung menuju modul terkait.

### SOP-01: Siklus Tahun Ajaran Baru, PPDB, & Kenaikan Kelas (/kenaikan-kelas)
- **Wizard Kenaikan Kelas & Kelulusan Massal (StudentPromotionPage.tsx):**
  - Transisi rombel lintas tingkat (X -> XI -> XII) secara massal tanpa merusak arsip nilai & rapor semester/tahun sebelumnya.
  - Mode kelulusan kelas XII menjadi Alumni (isActive: false, melepas classId aktif) dengan seleksi pengecualian siswa tinggal kelas/mutasi.
  - Terintegrasi ke menu beranda Admin/Operator/Wakakur dan pintasan langsung di /sop-kerja.

### SOP-02: E-Jurnal Mengajar & Presensi 1-Ketuk (/guru/jurnal)
- Pembaruan otomatis daftar siswa saat guru berpindah mata pelajaran/rombel (assignmentId).
- Status default Hadir (H) untuk seluruh siswa sehingga guru cukup mengetuk siswa yang berhalangan (S/I/A) dan data otomatis tersinkron ke Wali Kelas.

### SOP-03: Penilaian, Deskripsi Capaian, Validasi & Pengesahan Rapor (/guru/deskripsi-capaian, /validasi-rapor, /pengesahan-rapor)
- **Generator Deskripsi Capaian 1-Klik (CompetencyDescriptionPage.tsx):**
  - Tombol Generate & Simpan Usulan Kosong dan Perbarui Semua dari Nilai Terbaru untuk otomatis merangkum TP & Lingkup Materi tertinggi/terendah tiap siswa dan menyimpannya ke server.
- **Validasi & Pengesahan Massal (ReportDecisionPage.tsx):**
  - Tombol Setujui Massal untuk Waka Kurikulum (/validasi-rapor) dan Sahkan Massal untuk Kepala Sekolah (/pengesahan-rapor) bagi seluruh rapor berstatus SIAP_CETAK.

### SOP-05: BKK, Direktori Alumni Lintas Angkatan, & Tracer Study BMW (/vokasi/bkk)
- Perbaikan rute lintas peran di App.tsx dan standarisasi endpoint /api/v1/schools/:schoolId/vokasi/... pada VokasiPage.tsx.
- **Estafet Otomatis Lulusan SOP-01 -> Tracer Study:** Siswa yang baru diluluskan melalui Wizard Kelulusan otomatis tampil sebagai tombol cepat + Nama Siswa untuk pencatatan status BMW (Bekerja, Melanjutkan Kuliah, Wirausaha).
- **Direktori Alumni Lintas Angkatan:** Dilengkapi kartu rekapitulasi keterserapan BMW dan filter berdasarkan Tahun Angkatan serta Kompetensi Keahlian.

---

## 2. Roadmap Pekerjaan Selanjutnya (SOP Belum Selesai)

### SOP-04: Bengkel/Lab Praktik, Inventaris Jurusan, & UKK (/vokasi/inventaris)
- Filter inventaris alat praktik dan log peminjaman berdasarkan Bengkel/Lab per Jurusan (TJKT, TSM, AKL, BDP, PH).
- Alur Pengajuan Bahan Praktik & Perbaikan Alat Rusak berjenjang: Kaprog -> Waka Sarpras -> Bendahara.

### SOP-06: Presensi Pegawai, Izin Guru, & Penunjukan Guru Pengganti (/pegawai/presensi, /pegawai/izin)
- Saat guru mengajukan izin/cuti pada jam mengajar aktif, Waka Kurikulum/Piket dapat menunjuk Guru Pengganti (Inval) agar KBM dan jurnal kelas tetap berjalan.

### SOP-07: E-Payroll & Rekap Kehadiran Otomatis (/keuangan/payroll)
- Sinkronisasi otomatis rekap jam mengajar & kehadiran pegawai (dari SOP-02 & SOP-06) ke komponen perhitungan gaji/honor bulanan sebelum pencairan oleh Bendahara & Kepala Sekolah.

### SOP-08: Keuangan Sekolah, Tagihan Komite/SPP, & Portal Orang Tua (/keuangan/spp, /wali/portal)
- Pemantauan tunggakan per kelas/jurusan, cetak kuitansi/bukti bayar, serta penyelarasan status bebas administrasi menjelang ujian/kelulusan.
