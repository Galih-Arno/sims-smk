# SAKTI-Ku — SIMS SMK Super-App (Multi-Role & Cross-SOP Orchestration)

Sistem Informasi Manajemen Sekolah (SIMS) terintegrasi untuk SMK yang dirancang dengan arsitektur **Multi-Role RBAC (14 Peran Organisasi)**, **Lintas Jurusan & Tahun Ajaran**, serta **Orkestrasi 8 SOP Terpadu** dari siklus PPDB hingga Alumni lintas angkatan.

---

## 1. Rekap Progres Arsitektur & Transformasi UI/UX (Completed Milestones)

### A. Fondasi Akses & Multi-Role RBAC (`packages/shared`, `apps/web/src/lib/access.ts`)
- **Dukungan Penuh 14 Peran Organisasi SMK:** `SYSTEM_OWNER`, `KEPALA_SEKOLAH`, `KOMITE_SEKOLAH`, `WAKAKUR`, `WAKA_KESISWAAN`, `WAKA_SARPRAS`, `WAKA_HUMAS`, `BENDAHARA`, `KAPROG` (Kepala Program Keahlian seperti TJKT, TSM, AKL, BDP, PH), `OPERATOR_SEKOLAH`, `ADMIN_SEKOLAH`, `TU`, `WALI_KELAS`, dan `GURU_MAPEL`.
- **Jabatan Rangkap (*Multi-Title Badges*):** Melalui fungsi `allJobTitles()`, satu akun pegawai otomatis menampilkan seluruh jabatan aktifnya secara bersamaan (misalnya `Kepala Program Keahlian` + `Wali Kelas` + `Guru Mata Pelajaran`).
- **Pemisahan Wewenang Penugasan:** Admin Sekolah/Operator mengelola hak akses struktural di `/pengguna`, sementara Waka Kurikulum mengelola distribusi jam mengajar (`/penugasan`) dan penetapan wali kelas per rombel (`/wali-kelas`).

### B. Transformasi UI/UX Super-App Home & Kontrak Layout (`SuperAppHome.tsx`, `AppPageShell.tsx`)
- **Dynamic Multi-Role Hero Card:**
  - Menampilkan daftar *pill* seluruh jabatan aktif pengguna (bukan sekadar satu peran statis).
  - Menampilkan metrik tengah yang adaptif terhadap konteks tugas (`Kelas Diampu` untuk pengajar, `Kelas Wali` untuk wali kelas, atau `Jabatan Aktif` untuk pimpinan/struktural).
  - Menampilkan status presensi GPS harian serta ringkasan slip gaji dengan fitur privasi nominal (*toggle* sembunyikan/tampilkan angka).
- **Task-Driven Service Grid & Drawer (*Layanan Utama* & *Semua Layanan*):**
  - Menyusun ulang urutan 8 ikon utama bergradasi (*squircle icons*) secara otomatis berdasarkan prioritas tugas jabatan masing-masing (misalnya Kaprog langsung melihat *Bengkel & Lab*, *Prakerin / PKL*, dan *BKK & Alumni*; Bendahara melihat *Kelola Payroll* & *Keuangan SPP*; Kepala Sekolah melihat *Pengesahan Rapor*).
  - Tombol aksi cepat pada header *Layanan Utama* menyesuaikan rute paling krusial tiap peran (`Jadwal Kelas →`, `Kurikulum →`, `Pengesahan →`, atau `Data Siswa →`).
- **Standar Kontrak Layout `AppPageShell` & Mobile-First:**
  - Konsistensi *safe-area padding* bawah agar konten tidak pernah tertutup *floating bottom navigation dock* pada layar ponsel maupun tablet.
  - Kontrak `z-index` bertingkat yang bersih antara *sticky header*, *floating dock*, dan *modal/drawer* pencarian layanan.

### C. Kerangka Master 8 SOP Terpadu (`/sop-kerja` — `sopWorkflow.ts`, `SopFrameworkPage.tsx`)
- **Peta Estafet Lintas Peran & Lintas Jurusan:** Merangkum seluruh proses bisnis sekolah dari **SOP-01** (Siklus Tahun Ajaran, PPDB & Kenaikan Kelas X→XI→XII→Alumni) hingga **SOP-08** (Keuangan Siswa & Transparansi Komite).
- **Filter Interaktif:** Tab **"SOP Tugas Saya"** otomatis menyorot langkah kerja sesuai peran aktif pengguna lengkap dengan informasi penerima estafet berikutnya (`→ Estafet ke: ...`) dan tombol pintasan langsung ke form terkait, sementara **"Semua SOP (01–08)"** menampilkan alur lengkap sekolah untuk koordinasi dan audit.

### D. Implementasi Form Riil Lapangan SOP-02 (`TeachingJournalPage.tsx` — `/guru/jurnal`)
- **E-Jurnal & Presensi Siswa 1-Ketuk (*Default Hadir*):**
  - Menyatukan pengisian jurnal materi mengajar dan absensi siswa dalam satu layar tanpa perlu berpindah halaman.
  - Begitu kelas & mapel dipilih, daftar siswa aktif rombel otomatis dimuat dengan status awal **`H` (Hadir)** sehingga guru cukup mengetuk tombol ringkas **`S` (Sakit)**, **`I` (Izin)**, atau **`A` (Alpa)** bagi siswa yang berhalangan, lengkap dengan penghitung langsung (`H · S · I · A`) dan pencarian cepat.
- **Estafet Otomatis ke Wali Kelas & Ketahanan Offline:**
  - Saat tombol **Simpan Jurnal & Presensi** ditekan, sistem otomatis membuat dan memfinalisasi pertemuan presensi sehingga hasil kehadiran langsung tampil di pantauan **Wali Kelas (`/wali/absensi-harian`)**.
  - Mendukung antrean *offline* (`offlineQueue`) saat sinyal Wi-Fi bengkel/kelas terputus dan otomatis melakukan sinkronisasi saat koneksi kembali pulih.

---

## 2. Rancangan & Peta Jalan Pengembangan Selanjutnya (Roadmap SOP 01–08)

Pengembangan lanjutan dibagi menjadi **3 Klaster Paralel** agar tim pengembang dapat bekerja tanpa konflik kode:

| Tahap | Fokus SOP | Ruang Lingkup & Target Deliverables |
| :--- | :--- | :--- |
| **Klaster 1** | **SOP-01 & SOP-05**<br>*(Siklus Tahun Ajaran, Kenaikan Kelas & Alumni Lintas Angkatan)* | • **Wizard Kenaikan Kelas & Kelulusan Massal** lintas jurusan (X → XI → XII → status `ALUMNI`) dengan *snapshot* arsip semester lama yang terkunci (*read-only*).<br>• **Portal BKK & Tracer Study (BMW)** yang menampung arsip alumni terdahulu (impor/klaim akun) hingga alumni terbaru. |
| **Klaster 2** | **SOP-03 & SOP-04**<br>*(Penilaian Rapor Berjenjang & Vokasi Bengkel/Lab)* | • Penyempurnaan alur validasi **Guru Mapel → Wali Kelas → Wakakur → Pengesahan Kepsek**.<br>• **Form Inventaris & Pengajuan Bahan Praktik/Maintenance Bengkel** per konsentrasi keahlian (`Kaprog` → `Waka Sarpras` → `Bendahara`). |
| **Klaster 3** | **SOP-06, SOP-07 & SOP-08**<br>*(Kepegawaian, E-Payroll & Transparansi Keuangan)* | • Integrasi **Izin Guru + Penugasan Guru Pengganti** agar jam kosong kelas terkendali.<br>• Generator **E-Payroll** berbasis kehadiran GPS, total JP mengajar, dan tunjangan jabatan rangkap.<br>• Dasbor pengawasan realisasi anggaran untuk **Kepala Sekolah & Komite Sekolah**. |

---

## 3. Panduan Setup Lokal untuk Tim Pengembang

```bash
# 1. Clone atau tarik pembaruan terbaru dari branch main
git clone [https://github.com/Galih-Arno/sims-smk.git](https://github.com/Galih-Arno/sims-smk.git)
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

--

## 4. Protokol Wajib Serah Terima Kerja (Team ↔ Lead Developer Handoff)

Setiap anggota tim yang menyelesaikan tugas atau mengoper pekerjaan kembali WAJIB menyertakan laporan ringkas pada Pull Request / pesan serah terima dengan format berikut:

    1. Ringkasan Perubahan (What Was Done): Daftar file/modul yang diubah beserta fungsi dan tampilan UI/UX yang sudah berjalan.

    2. Status Uji Coba (Verification): Bukti lulus tsc --noEmit / tes API dan akun peran yang sudah diuji.

    3. Tindakan Lanjutan (Next Action Items for Lead/Next Dev): Bagian yang belum selesai, penyesuaian skema database yang dibutuhkan, atau langkah konkret yang harus dikerjakan berikutnya saat pekerjaan dioper kembali.
--

## 5. Panduan & Master Prompt untuk Tim yang Menggunakan AI

Jika anggota tim menggunakan asisten AI (Gemini, Cursor, Copilot, Claude, dll.) untuk mempercepat pengembangan, wajib salin dan tempel Master Prompt di bawah ini pada awal sesi chat AI agar kode yang dihasilkan tetap mematuhi arsitektur SAKTI-Ku (SIMS SMK) dan tidak merusak integrasi yang sudah berjalan:

```
Bertindaklah sebagai Senior Full-Stack Engineer untuk proyek SAKTI-Ku (SIMS SMK Super-App) berbasis monorepo TypeScript (React + Tailwind CSS di apps/web, Fastify + Prisma PostgreSQL di apps/api, dan kontrak tipe di packages/shared).

PATUHI PRINSIP ARSITEKTUR BERIKUT TANPA PENGECUALIAN:
1. Multi-Role RBAC (14 Peran Resmi): Gunakan RoleCode dari @sims/shared dan helper di apps/web/src/lib/access.ts (allJobTitles, rolesAtSchool, isKaprog, isWakakur, dll.). Satu akun dapat memegang jabatan rangkap (misal KAPROG + WALI_KELAS + GURU_MAPEL). Jangan pernah membuat role baru di luar 14 RoleCode.
2. Kontrak Layout & Mobile-First: Semua halaman fitur baru wajib dibungkus komponen AppPageShell (apps/web/src/components/shell/AppPageShell.tsx) dengan ruang aman bottom navigation dock, kontrak z-index yang bersih, dan tombol ramah sentuhan (min-h-11).
3. Orkestrasi Estafet 8 SOP (apps/web/src/lib/sopWorkflow.ts): Setiap form input harus mengikuti pendekatan riil di lapangan—gunakan smart defaults/pre-fill (seperti default "HADIR" pada presensi 1-ketuk di TeachingJournalPage.tsx), dukung offline queue bila perlu, dan pastikan output form otomatis tersambung ke peran berikutnya (handoff) sesuai SOP-01 s.d. SOP-08.
4. Longitudinal & Lintas Jurusan: Data akademik terikat pada Tahun Pelajaran/Semester dan Konsentrasi Keahlian. Arsip semester lalu bersifat immutable (read-only), dan kelulusan kelas XII bertransisi ke status ALUMNI lintas angkatan.
5. Verifikasi Sebelum Selesai: Pastikan tidak ada error TypeScript (npm --workspace=@sims/web exec tsc -- --noEmit) dan sertakan ringkasan perubahan (termasuk UI/UX) + tindakan lanjutan untuk serah terima tim.

Tugas saya saat ini adalah: [TULIS TUGAS / SOP YANG AKAN DIKERJAKAN DI SINI]
```

---

### Push ke GitHub Setelah `README.md` Disimpan

Setelah `README.md` tersimpan rapi, jalankan 3 perintah pendek ini di terminal:

```bash
git add README.md
git commit -m "docs(readme): lengkapi rekap arsitektur, detail pembaruan UI/UX, roadmap 8 SOP, dan master prompt AI"
git push origin main
```

## Akun

* **Kepala Sekolah**
* Email: `kepsek@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `KEPALA_SEKOLAH`


* **I Nyoman Yunianto**
* Email: `komite@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `KOMITE_SEKOLAH`


* **Nurcholis, S.Pd**
* Email: `wakakur@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `WAKAKUR`, `GURU_MAPEL`


* **Nurul Huda, S.Pd**
* Email: `wakakesiswaan@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `WAKA_KESISWAAN`, `GURU_MAPEL`


* **Didit Agung Prabowo, ST**
* Email: `wakasarpras@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `WAKA_SARPRAS`, `GURU_MAPEL`


* **Heru Supriyanto, S.Pd**
* Email: `wakahumas@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `WAKA_HUMAS`, `GURU_MAPEL`


* **Sri Yuningsih, S.Pd, M.Si**
* Email: `bendahara.komite@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `BENDAHARA`, `GURU_MAPEL`


* **Wahyu Eka Sumaryati, S.Pd**
* Email: `bendahara.bos@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `BENDAHARA`, `GURU_MAPEL`


* **Reni Diah Setiowati, MM**
* Email: `bendahara.barang@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `BENDAHARA`, `TU`


* **Zulkarnaen**
* Email: `kepalatu@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `TU`, `ADMIN_SEKOLAH`


* **Yogi Nugroho, SE**
* Email: `operator@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `OPERATOR_SEKOLAH`, `ADMIN_SEKOLAH`, `TU`


* **Endang Susilowati**
* Email: `tu.kurikulum@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `TU`


* **Sugeng Wahyudi, A.Md T**
* Email: `tu.umum@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `TU`


* **Rizky Hermin F., A.Md T**
* Email: `tu.siswa@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `TU`


* **Filma Andriani, S.Kom**
* Email: `kaprog.tjkt@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `KAPROG`, `GURU_MAPEL`


* **Made Raiyanto, ST**
* Email: `kaprog.tsm@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `KAPROG`, `GURU_MAPEL`


* **Sulistianingsih, SE**
* Email: `kaprog.akl@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `KAPROG`, `GURU_MAPEL`


* **Lia Apriyanti, M.Pd**
* Email: `kaprog.bdp@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `KAPROG`, `GURU_MAPEL`


* **Ni Wayan Seriyati, SE**
* Email: `kaprog.ph@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `KAPROG`, `GURU_MAPEL`


* **Suwartini, S.Pd**
* Email: `suwartini@smkpgripasirsakti.sch.id`
* Password: `Sakti2026!`
* Role: `GURU_MAPEL`, `WALI_KELAS`

