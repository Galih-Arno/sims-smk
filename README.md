# SAKTI-Ku — Super-App Sistem Informasi Manajemen Sekolah (SIMS SMK)

Platform digital terpadu berbasis web (*Super-App*) yang dirancang khusus untuk operasional nyata **Sekolah Menengah Kejuruan (SMK)** — studi kasus implementasi **SMK PGRI Pasir Sakti**. Mengintegrasikan tata kelola Kurikulum Merdeka, penilaian otomatis, administrasi wali kelas, e-jurnal & presensi guru/siswa, praktik kerja lapangan (PKL/Vokasi), bursa kerja khusus (BKK), hingga tata kelola keuangan sekolah dalam satu ekosistem yang ringan, responsif, dan aman.

---

## 1. Arsitektur & Stack Teknologi

Repositori ini dibangun menggunakan arsitektur *monorepo* berbasis TypeScript:

* **Frontend (`apps/web`):** React, TypeScript, Vite, Tailwind CSS, React Router (Mobile-first Super-App UI).
* **Backend (`apps/api`):** Fastify, TypeScript, Prisma ORM, PostgreSQL, Zod Validation, PDFKit.
* **Shared Contracts (`packages/shared`):** Definisi tipe DTO, peran pengguna (`RoleCode`), dan skema validasi bersama antara API dan Web.

---

## 2. Kontrak Keamanan & Tata Kelola Peran (4-Layer RBAC)

Sistem mendukung **13 peran sekolah** (`ADMIN_SEKOLAH`, `OPERATOR_SEKOLAH`, `WAKAKUR`, `KEPALA_SEKOLAH`, `KAPROG`, `GURU_MAPEL`, `WALI_KELAS`, `WAKA_KESISWAAN`, `WAKA_SARPRAS`, `WAKA_HUMAS`, `BENDAHARA`, `TU`, `KOMITE_SEKOLAH`) serta `SYSTEM_OWNER`.

Setiap fitur bisnis wajib menjaga konsistensi pada keempat lapisan berikut untuk mencegah *domino effect*:
1. **Discovery Layer (`SuperAppHome.tsx` & `SopFrameworkPage.tsx`):** Visibilitas kartu layanan dan alur SOP sesuai peran aktif.
2. **Routing Layer (`App.tsx`):** Proteksi rute berbasis `<RequireAccess>` agar tidak terjadi pengalihan tak terduga.
3. **Component Action Layer (`AcademicPages.tsx`, `CurriculumPages.tsx`, dll.):** Kendali tombol aksi tulis (`canManage` / `canCoordinate`) selaras dengan hak akses pengguna.
4. **API & Data Scope Layer (`*.routes.ts` & `scope.ts`):** Validasi otorisasi *server-side* (`assertCanManage`, `assertCanCoordinate`, `loadScope`) sebelum mutasi database.

---

## 3. Baseline Capaian Terkini & Integrasi 8 SOP Operasional

### A. Kompas Operasional & Kurikulum (`/sop-kerja`, `/mata-pelajaran`, `/penugasan`, `/pembelajaran`)
* **Otoritas Penuh Waka Kurikulum & Operator:** Pengelolaan master mata pelajaran (`/mapel` & `/mata-pelajaran`), struktur kurikulum (`/kurikulum`), pembagian beban mengajar (`/penugasan`), dan penetapan wali kelas (`/wali-kelas`).
* **Penugasan Multi-Kelas 1-Klik (`/penugasan`):** Waka Kurikulum dapat menugaskan satu guru dan satu mata pelajaran ke banyak rombel/jurusan sekaligus dalam satu aksi, dengan tampilan tabel terkelompok (*grouped class badges*).
* **Salin TP & Lingkup Materi Antar Kelas Paralel (`/pembelajaran`):** Guru pengampu cukup menyusun atau mengimpor Tujuan Pembelajaran (TP) dan Lingkup Materi (LM) satu kali pada kelas induk, lalu menyalinnya ke kelas paralel lain dalam satu klik.

### B. Siklus Tahun Ajaran, E-Jurnal, Penilaian & Rapor (SOP-01, SOP-02, SOP-03)
* **Wizard Kenaikan Kelas & Kelulusan Massal (`/kenaikan-kelas` — SOP-01):** Transisi rombel lintas tingkat (`X → XI → XII`) secara massal tanpa merusak arsip nilai semester sebelumnya, serta kelulusan kelas XII menjadi Alumni (`isActive: false`, melepas `classId` aktif).
* **E-Jurnal Mengajar & Presensi 1-Ketuk (`/guru/jurnal` — SOP-02):** Pembaruan otomatis daftar siswa saat berpindah rombel dengan status default *Hadir (H)* sehingga guru cukup mengetuk siswa yang berhalangan (`S/I/A`).
* **Pipeline Penilaian & Generator Deskripsi (`/guru/nilai`, `/guru/nilai-akhir`, `/guru/deskripsi-capaian` — SOP-03):** Input/impor nilai per kelas, kalkulasi nilai akhir sesuai kebijakan semester (`/pengaturan-nilai`), serta generator otomatis narasi deskripsi capaian untuk dikirim ke Wali Kelas.
* **Validasi & Pengesahan Rapor Massal (`/wali/penerimaan`, `/validasi-rapor`, `/pengesahan-rapor`):** Pemantauan kelengkapan nilai lintas mapel secara *real-time*, persetujuan massal Waka Kurikulum, dan pengesahan resmi Kepala Sekolah (cetak PDF).

### C. Vokasi SMK, BKK & Tracer Study (SOP-05)
* **Estafet Lulusan ke Tracer Study (`/vokasi/bkk`):** Siswa yang diluluskan melalui Wizard Kelulusan otomatis muncul sebagai pintasan pencatatan status **BMW** (*Bekerja, Melanjutkan Kuliah, Wirausaha*), dilengkapi direktori alumni lintas angkatan dan filter kompetensi keahlian.

---

## 4. Audit Celah Lapangan & Solusi Rekayasa

Berdasarkan evaluasi operasional SMK pada jam sibuk dan pekan penilaian, terdapat **5 titik kritis** yang menjadi fokus penguatan arsitektur:

| Domain | Celah Saat Ini | Realitas Lapangan di SMK | Solusi Rekayasa |
| :--- | :--- | :--- | :--- |
| **1. Kolaborasi Mengajar (*Team Teaching* & Guru Pengganti)** | Satu mapel pada satu kelas dikunci ke satu `teacherId` tunggal. | Mapel kejuruan/produktif & Projek IPAS sering diampu 2 guru bersamaan (*Team Teaching*), atau guru piket menggantikan guru yang izin. | Tambahkan relasi `TeachingAssignmentCoTeacher` di Prisma agar Guru Pendamping bisa mengisi E-Jurnal & nilai TP pada kelas yang sama, sementara Guru Utama tetap menjadi penanggung jawab nilai akhir rapor. |
| **2. Peran Struktural Kaprog & Praktik Industri (PKL/TEFA)** | Peran `KAPROG` sudah ada di `RoleCode`, namun belum memiliki dasbor monitoring khusus kompetensi keahlian. | Kepala Program Keahlian (TJKT, TSM, AKL, BDP, PH) perlu memantau kesiapan nilai produktif jurusannya, penempatan PKL, dan jadwal uji kompetensi (UKK). | Tambahkan filter cakupan jurusan untuk `KAPROG` pada monitoring nilai kejuruan, inventaris bengkel/lab, dan persetujuan lokasi PKL. |
| **3. Ketahanan Sinyal & Kecepatan Input Mobile (*Offline-First & Optimistic UI*)** | Guru di bengkel/lab sering mengalami koneksi seluler tidak stabil saat mengisi presensi dan jurnal. | Jika koneksi putus saat mengetuk presensi `S/I/A` atau menyimpan nilai, guru tidak boleh kehilangan data ketikan. | Terapkan *Optimistic UI* (perubahan status instan tanpa menunggu spinner), antrean *local draft* (`localStorage`/IndexedDB) untuk form nilai & jurnal, serta kompresi otomatis foto bukti jurnal/izin sebelum diunggah. |
| **4. Estafet Lintas Modul (Presensi → Wali Kelas → BK)** | Data presensi harian/mapel, pembinaan karakter, dan status SPP berdiri di layar terpisah. | Wali kelas dan Guru BK butuh peringatan dini otomatis (*early warning*) jika siswa alpa 3 hari berturut-turut, dan syarat cetak rapor butuh status bebas tanggungan. | Bangun mesin agregasi *Readiness & Alert* terpadu di beranda Wali Kelas: rangkuman siswa rawan bolos, kelengkapan nilai seluruh mapel, dan status administrasi dalam satu kartu ringkas. |
| **5. Pengalaman Pengguna Modern (*Mobile-First Ergonomics & Motion*)** | Sebagian tabel master masih membutuhkan geser horizontal pada layar ponsel `360px`. | 80%+ guru dan siswa mengakses aplikasi lewat ponsel Android/iOS dengan satu tangan. | Terapkan *adaptive card-table* pada layar kecil, transisi halaman & *bottom-sheet modal* yang halus (GPU-accelerated `transform`/`opacity` 60fps), *skeleton loading* pengganti layar putih kosong, dan *command palette* pencarian cepat layanan. |

---

## 5. Peta Jalan Eksekusi Pengembangan Lanjutan (Production Roadmap)

### Fase 1 — Keandalan Alur Akademik & Multi-Peran Lapangan (Prioritas Segera)
1. **Impor Nilai Excel End-to-End Terverifikasi:** Templat `.xlsx` per kelas/mapel dapat diunduh guru, diisi *offline*, diunggah dengan pratinjau validasi baris-per-baris, dan langsung mengalir ke Nilai Akhir & Wali Kelas.
2. **Dukungan *Team Teaching* (`Co-Teacher`) & Multi-Peran Guru:** Satu mapel di satu kelas dapat memiliki guru pendamping, serta guru yang merangkap **Kaprog + Guru Mapel + Wali Kelas** dapat berpindah konteks kerja tanpa *logout*.
3. **Audit Konsistensi API & Validasi:** Penyeragaman parameter paginasi (`pageSize`), kode error terstandar, dan *audit log* tercatat rapi pada setiap aksi kritis.

### Fase 2 — Pengalaman Mobile Super-App, Performa & Animasi Halus
1. **Skeleton Screens & Optimistic Updates:** Menghilangkan jeda *loading* kaku pada daftar siswa, presensi 1-ketuk, dan tabel nilai.
2. **Adaptive Mobile Views & Bottom-Sheet Modals:** Mengubah modal desktop menjadi *bottom-sheet* ergonomis di perangkat seluler dengan transisi mikro ringan.
3. **Progressive Web App (PWA) & Caching:** Menambahkan `manifest.json` dan *Service Worker* agar aplikasi dapat dipasang langsung di layar utama ponsel guru/siswa layaknya aplikasi *native*.

### Fase 3 — Kecerdasan Operasional SMK (Vokasi, PKL, BKK & Keuangan)
1. **Integrasi Penuh Vokasi (SOP-04 & PKL → Rapor):** Manajemen inventaris bengkel/lab per jurusan serta sinkronisasi otomatis nilai pembimbing industri & jurnal PKL ke komponen rapor semester kelas XII.
2. **E-Payroll & Keuangan Sekolah (SOP-07 & SOP-08):** Rekap otomatis jam mengajar & kehadiran pegawai ke komponen honor bulanan, pemantauan tunggakan SPP per rombel, serta dasbor eksekutif Kepala Sekolah & Komite.

---

## 6. Daftar Akun Pengujian & Operasional Lapangan

Seluruh akun operasional **SMK PGRI Pasir Sakti** pada lingkungan pengujian menggunakan kata sandi default: **`Sakti2026!`**

### A. Pimpinan & Komite Sekolah
| Nama Pengguna | Email Login | Password | Peran (`RoleCode`) |
| :--- | :--- | :--- | :--- |
| Kepala Sekolah | `kepsek@smkpgripasirsakti.sch.id` | `Sakti2026!` | `KEPALA_SEKOLAH` |
| I Nyoman Yunianto | `komite@smkpgripasirsakti.sch.id` | `Sakti2026!` | `KOMITE_SEKOLAH` |

### B. Wakil Kepala Sekolah (Waka)
| Nama Pengguna | Email Login | Password | Peran (`RoleCode`) |
| :--- | :--- | :--- | :--- |
| Nurcholis, S.Pd | `wakakur@smkpgripasirsakti.sch.id` | `Sakti2026!` | `WAKAKUR`, `GURU_MAPEL` |
| Nurul Huda, S.Pd | `wakakesiswaan@smkpgripasirsakti.sch.id` | `Sakti2026!` | `WAKA_KESISWAAN`, `GURU_MAPEL` |
| Didit Agung Prabowo, ST | `wakasarpras@smkpgripasirsakti.sch.id` | `Sakti2026!` | `WAKA_SARPRAS`, `GURU_MAPEL` |
| Heru Supriyanto, S.Pd | `wakahumas@smkpgripasirsakti.sch.id` | `Sakti2026!` | `WAKA_HUMAS`, `GURU_MAPEL` |

### C. Bendahara, Operator & Tata Usaha (TU)
| Nama Pengguna | Email Login | Password | Peran (`RoleCode`) |
| :--- | :--- | :--- | :--- |
| Sri Yuningsih, S.Pd, M.Si | `bendahara.komite@smkpgripasirsakti.sch.id` | `Sakti2026!` | `BENDAHARA`, `GURU_MAPEL` |
| Wahyu Eka Sumaryati, S.Pd | `bendahara.bos@smkpgripasirsakti.sch.id` | `Sakti2026!` | `BENDAHARA`, `GURU_MAPEL` |
| Reni Diah Setiowati, MM | `bendahara.barang@smkpgripasirsakti.sch.id` | `Sakti2026!` | `BENDAHARA`, `TU` |
| Zulkarnaen | `kepalatu@smkpgripasirsakti.sch.id` | `Sakti2026!` | `TU`, `ADMIN_SEKOLAH` |
| Yogi Nugroho, SE | `operator@smkpgripasirsakti.sch.id` | `Sakti2026!` | `OPERATOR_SEKOLAH`, `ADMIN_SEKOLAH`, `TU` |
| Endang Susilowati | `tu.kurikulum@smkpgripasirsakti.sch.id` | `Sakti2026!` | `TU` |
| Sugeng Wahyudi, A.Md T | `tu.umum@smkpgripasirsakti.sch.id` | `Sakti2026!` | `TU` |
| Rizky Hermin F., A.Md T | `tu.siswa@smkpgripasirsakti.sch.id` | `Sakti2026!` | `TU` |

### D. Kepala Program Keahlian (Kaprog)
| Nama Pengguna | Kompetensi Keahlian | Email Login | Password | Peran (`RoleCode`) |
| :--- | :--- | :--- | :--- | :--- |
| Filma Andriani, S.Kom | TJKT | `kaprog.tjkt@smkpgripasirsakti.sch.id` | `Sakti2026!` | `KAPROG`, `GURU_MAPEL` |
| Made Raiyanto, ST | TSM | `kaprog.tsm@smkpgripasirsakti.sch.id` | `Sakti2026!` | `KAPROG`, `GURU_MAPEL` |
| Sulistianingsih, SE | AKL | `kaprog.akl@smkpgripasirsakti.sch.id` | `Sakti2026!` | `KAPROG`, `GURU_MAPEL` |
| Lia Apriyanti, M.Pd | BDP | `kaprog.bdp@smkpgripasirsakti.sch.id` | `Sakti2026!` | `KAPROG`, `GURU_MAPEL` |
| Ni Wayan Seriyati, SE | PH | `kaprog.ph@smkpgripasirsakti.sch.id` | `Sakti2026!` | `KAPROG`, `GURU_MAPEL` |

### E. Guru Mata Pelajaran & Wali Kelas
| Nama Pengguna | Email Login | Password | Peran (`RoleCode`) | Keterangan Ampuan |
| :--- | :--- | :--- | :--- | :--- |
| Suwartini, S.Pd | `suwartini@smkpgripasirsakti.sch.id` | `Sakti2026!` | `GURU_MAPEL`, `WALI_KELAS` | Mapel **B. LAMPUNG** & Wali Kelas |
| Galih Gratia Arno, S.Kom | `galih@smkpgripasirsakti.sch.id` | `Sakti2026!` | `GURU_MAPEL` | Akun baru — Mapel **ASJ** (`XI TJKT 1–2`, `XII TJKT 1–2`) |

---

## 7. Super Master Prompt (VS Code & Cursor AI Agent Blueprint)

Buka folder root repositori proyek ini di **VS Code / Cursor** (berlaku lintas OS: Linux, Windows, maupun macOS), aktifkan panel **AI Agent / Composer**, lalu salin dan tempelkan seluruh prompt berikut agar agen AI melakukan analisis mendalam, keputusan arsitektur yang matang, dan pengeditan kode secara otomatis di dalam *workspace* proyek aktif:

````markdown
# ROLE & ENGINEERING MANDATE
Anda adalah **Principal Full-Stack Software Engineer & Education Systems Architect** untuk proyek **SAKTI-Ku (SIMS SMK)** — Super-App manajemen Sekolah Menengah Kejuruan (SMK) berbasis monorepo TypeScript:
- `apps/web`: React + TypeScript + Vite + Tailwind CSS + React Router
- `apps/api`: Fastify + TypeScript + Prisma ORM + PostgreSQL + Zod + PDFKit
- `packages/shared`: Shared DTO contracts, `RoleCode`, dan skema validasi

---

# PROTOKOL WORKSPACE LINTAS OS & PENGEDITAN OTOMATIS (WAJIB DIPATUHI)
1. **Verifikasi Root Workspace Aktif (Jangan Membuat Direktori Baru):**
   - **DILARANG** membuat folder/direktori repositori baru atau mengasumsikan *absolute path* tertentu (tim pengembang bekerja lintas OS: Linux, Windows, macOS).
   - Periksa terlebih dahulu apakah *workspace* yang sedang terbuka sudah berada di root proyek yang memuat `package.json`, `README.md`, `apps/api`, `apps/web`, dan `packages/shared`.
   - **Jika struktur root proyek tersebut belum terdeteksi**, berhenti dan minta pengguna mengarahkan atau membuka folder root proyeknya terlebih dahulu sebelum menjalankan perintah atau membuat file apa pun.
   - Selalu gunakan **jalur relatif (*relative paths*)** dari root *workspace* aktif.
2. **Gunakan Native File Edit & Diff Tools Editor Secara Otomatis:**
   - Lakukan seluruh pembacaan dan pengeditan file secara langsung menggunakan *built-in file editing tools* workspace (`read_file`, `edit_file` / `apply_diff`) agar perubahan presisi, terstruktur, dan terhindar dari kesalahan pemotongan skrip terminal.

---

# METODOLOGI ANALISIS & KEPUTUSAN REKAYASA (WAJIB SEBELUM CODING)

Setiap kali akan mengerjakan suatu fitur atau pembaruan, Anda **WAJIB** melewati 5 gerbang analisis berikut sebelum menulis atau mengubah kode:

1. **Analisa Kode Eksisting & Inventarisasi Modul (*Reuse-Before-Build*):**
   - Telusuri seluruh file terkait di `apps/api/prisma/schema.prisma`, `packages/shared`, `apps/api/src/modules/`, dan `apps/web/src/` (`pages/`, `components/`, `lib/`).
   - **Ambil keputusan arsitektur yang matang:** Evaluasi apakah fitur/komponen yang dibutuhkan **sudah tersedia** (tinggal dihubungkan/diperbaiki), **cukup diperluas (*extend*)** dari modul/komponen yang ada, atau **memang harus dibuat baru** karena belum ada fondasinya. **DILARANG** membuat komponen, endpoint, atau tabel duplikat jika fungsionalitas dasarnya sudah ada.
2. **Prinsip Efek Domino (*End-to-End Impact Tracing* & 4-Layer RBAC):**
   - Petakan seluruh efek domino dari setiap perubahan ke hulu dan hilir:
     `Prisma Schema` ↔ `Shared DTO & Zod Schema` ↔ `API Service & Route Guard` ↔ `Frontend State & UI Action` ↔ `Modul Hilir Terdampak (E-Rapor, Wali Kelas, Keuangan, Audit Log)`.
   - Pastikan **Kontrak 4-Layer RBAC** selalu sinkron di keempat lapisan:
     - **Layer 1 (Menu/Discovery):** `SuperAppHome.tsx` & `SopFrameworkPage.tsx`
     - **Layer 2 (Router Guard):** `App.tsx` (`<RequireAccess>`)
     - **Layer 3 (Component Action):** Kendali tombol tulis/hapus di UI (`canManage`, `canCoordinate`, `canWrite`)
     - **Layer 4 (API & Scope Guard):** `*.routes.ts` & `scope.ts` (`assertCanManage`, `assertCanCoordinate`, `loadScope`)
3. **Simulasi Skenario Pengguna Riil di Lapangan (*Validated Field Scenarios*):**
   - Uji rancangan logika terhadap skenario operasional SMK yang tervalidasi (merujuk daftar akun & peran nyata pada Bagian 6 `README.md`, seperti `WAKAKUR`, `KAPROG`, `GURU_MAPEL`, `WALI_KELAS`, `BENDAHARA`, `TU`, `KEPALA_SEKOLAH`), termasuk skenario batas (*edge cases*):
     - Guru merangkap jabatan ganda (`KAPROG` + `GURU_MAPEL` + `WALI_KELAS`).
     - Satu mapel diampu banyak kelas lintas jurusan maupun 2+ guru bersamaan (*Team Teaching*).
     - Siklus revisi nilai e-Rapor antara Guru Mapel dan Wali Kelas saat ditemukan selisih nilai atau deskripsi capaian yang belum tepat.
     - Guru piket/pengganti saat guru utama izin.
     - Koneksi seluler terputus sementara di bengkel/lab saat input presensi atau nilai.
4. **Analisis Celah Penggunaan & Keamanan (*Usability & Security Gap Audit*):**
   - **Celah Keamanan:** Periksa potensi *IDOR* (akses lintas sekolah/kelas yang bukan haknya), *privilege escalation* antar 13 peran, validasi input Zod (termasuk batas enum `pageSize`), penguncian mutasi nilai setelah difinalisasi/disahkan, serta pencatatan *audit trail* pada mutasi sensitif.
   - **Celah Penggunaan (UX):** Identifikasi titik gesekan (*friction*) seperti input berulang per kelas, layar penuh geser horizontal di ponsel `360px`, atau hilangnya data saat koneksi terputus.
5. **Preservasi UI/UX Eksisting (Zero Visual Regression):**
   - **JANGAN mengubah** tema warna utama, struktur navigasi *floating bottom bar*, tata letak kartu beranda Super-App, tipografi, maupun komponen desain yang sudah berjalan baik.
   - Pembaruan antarmuka **HANYA diperbolehkan** jika dibutuhkan untuk mengakomodasi alur logika riil di lapangan (misalnya: lencana status, *bottom-sheet modal* responsif pada layar seluler `360px`, *skeleton loading*, atau filter konteks peran).

---

# ROADMAP PENGEMBANGAN BERTAHAP (EKSEKUSI TERUKUR)

## FASE 1: Akurasi E-Rapor SMK, Kolaborasi Mengajar & Multi-Peran Lapangan
1. **Integrasi Penuh E-Rapor Kurikulum Merdeka SMK (Guru Mapel ↔ Wali Kelas ↔ Wakakur ↔ Kepsek):**
   - **Realitas Lapangan:** Sering terjadi ketidaksinkronan antara nilai akhir guru mapel, leger wali kelas, rekap kehadiran, dan format cetak rapor SMK, atau guru mapel salah kirim nilai sehingga butuh mekanisme pengembalian (*revision loop*) yang terkontrol.
   - **Implementasi Wajib:**
     - **Matriks Penerimaan & Revision Loop Wali Kelas (`/wali/penerimaan`):** Wali kelas memantau status real-time seluruh mapel di rombelnya (*Draft*, *Terkirim*, *Perlu Revisi*, *Diterima*). Saat wali kelas mengklik **Minta Revisi** beserta catatan alasan, status nilai pada akun Guru Mapel otomatis terbuka kembali untuk diperbaiki dan dikirim ulang.
     - **Penguncian Leger & Tarik Otomatis Komponen Non-Mapel:** Sebelum wali kelas mengajukan rapor ke Waka Kurikulum, sistem memvalidasi bahwa 100% mapel rombel berstatus *Diterima*, rekap ketidakhadiran (`S/I/A`) ditarik otomatis dari data presensi/jurnal, serta komponen Ekstrakurikuler, Catatan Wali Kelas, dan Nilai PKL (khusus kelas XII) terisi lengkap.
     - **Akurasi Kalkulasi & Cetak PDF Rapor SMK:** Pastikan rumus dan pembulatan nilai akhir identik di seluruh layar (Guru Mapel, Leger Wali Kelas, Pratinjau Rapor, hingga PDF cetak) serta pengelompokan mapel mengikuti struktur spektrum Kurikulum Merdeka SMK (**Kelompok Umum** & **Kelompok Kejuruan**).
2. **Team Teaching (`Co-Teacher`) & Guru Pengganti (Inval):**
   - Tambahkan relasi `TeachingAssignmentCoTeacher` pada `apps/api/prisma/schema.prisma` agar Guru Utama dan Guru Pendamping sama-sama dapat mengisi **E-Jurnal Mengajar**, **TP & Lingkup Materi**, dan **Input Nilai**, sementara **1 nilai akhir rapor** per mapel tetap terjaga tanpa duplikasi. Sediakan opsi penambahan Guru Pendamping pada UI `/penugasan`.
3. **Multi-Peran Tanpa Gesekan (*Seamless Multi-Role Context*):**
   - Pastikan seluruh layar kerja (Rencana Pembelajaran, Input Nilai, E-Jurnal, dan Penerimaan Wali Kelas) berjalan mulus ketika satu akun memiliki kombinasi peran ganda (`KAPROG` + `GURU_MAPEL` + `WALI_KELAS`).
4. **Dasbor & Cakupan Kepala Program Keahlian (`KAPROG`):**
   - Sediakan monitoring dan filter berbasis kompetensi keahlian (TJKT, TSM, AKL, BDP, PH) untuk nilai kejuruan (`KEJURUAN`), inventaris bengkel/lab, dan kesiapan Uji Kompetensi Keahlian (UKK).

## FASE 2: Ketahanan Jaringan Lapangan (*Offline-Safe*) & Responsivitas Mobile
1. **Proteksi Draf Lokal (*Auto-Save Draft*) & Optimistic UI:**
   - Terapkan *Optimistic UI* pada presensi 1-ketuk dan simpan otomatis draf ketikan nilai/jurnal ke `localStorage` agar data tidak hilang bila sinyal seluler di bengkel/lab terputus sementara.
2. **Ergonomi Perangkat Seluler (`360px` Mobile-First):**
   - Pastikan seluruh tabel data, form impor Excel, dan modal aksi nyaman dioperasikan dengan satu tangan di ponsel tanpa *horizontal overflow* yang merusak tata letak.

## FASE 3: Estafet Lintas Modul (Vokasi PKL, Kesiswaan, E-Payroll & Keuangan)
1. **Integrasi Vokasi & PKL ke Rapor (SOP-04 & SOP-05):**
   - Hubungkan inventaris bengkel/lab per jurusan, persetujuan pengajuan bahan praktik (`Kaprog -> Waka Sarpras -> Bendahara`), serta sinkronisasi nilai pembimbing industri & jurnal PKL ke komponen rapor semester kelas XII.
2. **Early Warning Wali Kelas & Tata Kelola Keuangan (SOP-06, SOP-07, SOP-08):**
   - Tampilkan ringkasan kesiapan siswa di beranda Wali Kelas: akumulasi ketidakhadiran (`S/I/A` dengan peringatan dini alpa beruntun), kelengkapan nilai seluruh mapel, serta status bebas tunggungan komite/SPP menjelang ujian atau pencetakan rapor.
   - Pastikan rekap kehadiran dan jam mengajar pegawai terhubung bersih ke modul E-Payroll (`/keuangan/payroll`).

---

# PROTOKOL LAPORAN & VERIFIKASI SETIAP FASE
Sebelum menulis kode pada setiap fase, tampilkan terlebih dahulu **Matriks Keputusan Rekayasa** (Komponen/API yang dipakai ulang vs. diperluas vs. dibuat baru, serta daftar efek domino yang dijaga). Setelah menerapkan *diff* di *workspace*, jalankan validasi berikut dari root *workspace* dan pastikan **0 error**:
- `npx prisma validate --schema=apps/api/prisma/schema.prisma` (jika menyentuh schema Prisma)
- `npm --workspace=@sims/shared exec tsc -- --noEmit` (jika menyentuh `packages/shared`)
- `npm --workspace=@sims/api exec tsc -- --noEmit`
- `npm --workspace=@sims/web exec tsc -- --noEmit`
---
```

---



