# SAKTI-Ku — SIMS SMK Super-App (Multi-Role & Cross-SOP Orchestration)

Sistem Informasi Manajemen Sekolah (SIMS) terintegrasi untuk SMK dengan arsitektur **Multi-Role RBAC (14 Peran Organisasi)**, **Lintas Jurusan & Tahun Ajaran**, serta **Orkestrasi 8 SOP Terpadu** dari siklus PPDB hingga Alumni lintas angkatan.

---

## 1. Progres Pekerjaan Terkini (Completed Milestones)

1. **Multi-Role RBAC & Dynamic Super-App Home (`access.ts`, `SuperAppHome.tsx`)**
   - Mendukung penuh **14 peran organisasi sekolah**: `SYSTEM_OWNER`, `KEPALA_SEKOLAH`, `KOMITE_SEKOLAH`, `WAKAKUR`, `WAKA_KESISWAAN`, `WAKA_SARPRAS`, `WAKA_HUMAS`, `BENDAHARA`, `KAPROG`, `OPERATOR_SEKOLAH`, `ADMIN_SEKOLAH`, `TU`, `WALI_KELAS`, dan `GURU_MAPEL`.
   - Dukungan **Jabatan Rangkap (*Multi-Title Badges*)** pada *Hero Card* beranda (contoh: `Kepala Program Keahlian` + `Wali Kelas` + `Guru Mata Pelajaran`).
   - Komposisi menu *Layanan Utama* & *Semua Layanan* yang adaptif sesuai kewenangan peran aktif.
2. **Kerangka Master 8 SOP Terpadu (`/sop-kerja` — `sopWorkflow.ts`, `SopFrameworkPage.tsx`)**
   - Peta estafet kerja hulu-ke-hilir dengan filter **"SOP Tugas Saya"** dan **"Semua SOP (01–08)"** beserta tombol pintasan langsung ke form terkait.
3. **Implementasi Form Terpadu SOP-02 (`TeachingJournalPage.tsx` — `/guru/jurnal`)**
   - Menggabungkan **E-Jurnal Mengajar** dengan **Presensi Siswa 1-Ketuk (*Default Hadir*)** dalam 1 layar.
   - Mendukung antrean offline (*offline queue*) dan sinkronisasi otomatis ke pantauan **Wali Kelas (`/wali/absensi-harian`)**.

---

## 2. Rancangan & Peta Jalan Pengembangan Selanjutnya (Roadmap SOP 01–08)

| Tahap | Fokus SOP | Ruang Lingkup & Target Deliverables |
| :--- | :--- | :--- |
| **Klaster 1** | **SOP-01 & SOP-05**<br>*(Siklus Tahun Ajaran, Kenaikan Kelas & Alumni Lintas Angkatan)* | • **Wizard Kenaikan Kelas & Kelulusan Massal** lintas jurusan (X → XI → XII → status `ALUMNI`) dengan *snapshot* arsip semester lama yang terkunci (*read-only*).<br>• **Portal BKK & Tracer Study (BMW)** untuk arsip alumni terdahulu (impor/klaim akun) hingga alumni terbaru. |
| **Klaster 2** | **SOP-03 & SOP-04**<br>*(Penilaian Rapor Berjenjang & Vokasi Bengkel/Lab)* | • Penyempurnaan alur validasi **Guru Mapel → Wali Kelas → Wakakur → Pengesahan Kepsek**.<br>• **Form Inventaris & Pengajuan Bahan Praktik/Maintenance Bengkel** per konsentrasi keahlian (`Kaprog` → `Waka Sarpras` → `Bendahara`). |
| **Klaster 3** | **SOP-06, SOP-07 & SOP-08**<br>*(Kepegawaian, E-Payroll & Transparansi Keuangan)* | • Integrasi **Izin Guru + Penugasan Guru Pengganti** agar jam kosong kelas terkendali.<br>• Generator **E-Payroll** berbasis kehadiran GPS, total JP mengajar, dan tunjangan jabatan rangkap.<br>• Dasbor pengawasan realisasi anggaran untuk **Kepala Sekolah & Komite Sekolah**. |

---

## 3. Panduan Setup Lokal untuk Tim Pengembang

```bash
# 1. Clone atau tarik pembaruan terbaru dari branch main
git clone https://github.com/Galih-Arno/sims-smk.git
cd sims-smk

# 2. Instal dependensi monorepo
npm install

# 3. Siapkan environment & database (sesuaikan .env pada apps/api)
npm --workspace=@sims/api exec prisma generate
npm --workspace=@sims/api exec prisma migrate deploy

# 4. (Opsional) Seed akun organisasi & role sekolah
npm --workspace=@sims/api exec tsx prisma/seed-sakti-org.ts

# 5. Jalankan server API & Web secara bersamaan
npm run dev
```

---

## 4. Protokol Wajib Serah Terima Kerja (Team ↔ Lead Developer Handoff)

Setiap anggota tim yang menyelesaikan tugas atau mengoper pekerjaan kembali **WAJIB** menyertakan laporan ringkas pada *Pull Request* / pesan serah terima dengan format berikut:

1. **Ringkasan Perubahan (*What Was Done*):** Daftar file/modul yang diubah beserta fungsi yang sudah berjalan.
2. **Status Uji Coba (*Verification*):** Bukti lulus `tsc --noEmit` / tes API dan akun peran yang sudah diuji.
3. **Tindakan Lanjutan (*Next Action Items for Lead/Next Dev*):** Bagian yang belum selesai, penyesuaian skema database yang dibutuhkan, atau langkah konkret yang harus dikerjakan berikutnya saat pekerjaan dioper kembali.

---

## 5. Panduan & Master Prompt untuk Tim yang Menggunakan AI

Jika anggota tim menggunakan asisten AI (Gemini, Cursor, Copilot, Claude, dll.) untuk mempercepat pengembangan, **wajib salin dan tempel Master Prompt di bawah ini pada awal sesi chat AI** agar kode yang dihasilkan tetap mematuhi arsitektur **SAKTI-Ku (SIMS SMK)** dan tidak merusak integrasi yang sudah berjalan:

```text
Bertindaklah sebagai Senior Full-Stack Engineer untuk proyek SAKTI-Ku (SIMS SMK Super-App) berbasis monorepo TypeScript (React + Tailwind CSS di apps/web, Fastify + Prisma PostgreSQL di apps/api, dan kontrak tipe di packages/shared).

PATUHI PRINSIP ARSITEKTUR BERIKUT TANPA PENGECUALIAN:
1. Multi-Role RBAC (14 Peran Resmi): Gunakan RoleCode dari @sims/shared dan helper di apps/web/src/lib/access.ts (allJobTitles, rolesAtSchool, isKaprog, isWakakur, dll.). Satu akun dapat memegang jabatan rangkap (misal KAPROG + WALI_KELAS + GURU_MAPEL). Jangan pernah membuat role baru di luar 14 RoleCode.
2. Kontrak Layout & Mobile-First: Semua halaman fitur baru wajib dibungkus komponen AppPageShell (apps/web/src/components/shell/AppPageShell.tsx) dengan ruang aman bottom navigation dock, kontrak z-index yang bersih, dan tombol ramah sentuhan (min-h-11).
3. Orkestrasi Estafet 8 SOP (apps/web/src/lib/sopWorkflow.ts): Setiap form input harus mengikuti pendekatan riil di lapangan—gunakan smart defaults/pre-fill (seperti default "HADIR" pada presensi 1-ketuk di TeachingJournalPage.tsx), dukung offline queue bila perlu, dan pastikan output form otomatis tersambung ke peran berikutnya (handoff) sesuai SOP-01 s.d. SOP-08.
4. Longitudinal & Lintas Jurusan: Data akademik terikat pada Tahun Pelajaran/Semester dan Konsentrasi Keahlian. Arsip semester lalu bersifat immutable (read-only), dan kelulusan kelas XII bertransisi ke status ALUMNI lintas angkatan.
5. Verifikasi Sebelum Selesai: Pastikan tidak ada error TypeScript (npm --workspace=@sims/web exec tsc -- --noEmit) dan sertakan ringkasan perubahan + tindakan lanjutan untuk serah terima tim.

Tugas saya saat ini adalah: [TULIS TUGAS / SOP YANG AKAN DIKERJAKAN DI SINI]
```
