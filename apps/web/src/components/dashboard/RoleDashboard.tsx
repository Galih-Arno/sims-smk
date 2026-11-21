import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiClientError, api } from "../../lib/api.ts";
import type { DashboardPayload } from "../../lib/dashboard.ts";
import { Badge } from "../ui/Badge.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { SkeletonCards } from "../ui/Skeleton.tsx";

const GRADE_LABEL = {
  NONE: "Belum diisi",
  DRAFT: "Belum dikirim",
  SUBMITTED: "Sudah dikirim",
  REVISION_REQUESTED: "Perlu revisi",
} as const;

export function RoleDashboard({
  view,
  schoolId,
  title,
  subtitle,
}: {
  view: DashboardPayload["view"];
  schoolId: string;
  title: string;
  subtitle: string;
}) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (view !== "owner" && !schoolId) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    const path = view === "owner" ? "/api/v1/dashboard" : `/api/v1/schools/${schoolId}/dashboard?view=${view}`;
    api<DashboardPayload>(path)
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setData(null);
        setError(caught instanceof ApiClientError ? caught.message : "Dasbor gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, schoolId]);

  return (
    <main className="mx-auto min-w-0 max-w-6xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{subtitle}</p>
      </header>
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {loading ? <SkeletonCards /> : null}
      {!loading && view !== "owner" && !schoolId ? (
        <EmptyState title="Belum ada sekolah" detail="Akun ini belum memiliki sekolah aktif yang dapat ditampilkan." />
      ) : null}
      {data?.view === "owner" ? <OwnerBoard data={data} /> : null}
      {data?.view === "admin" ? <AdminBoard data={data} /> : null}
      {data?.view === "kepala" ? <KepalaBoard data={data} /> : null}
      {data?.view === "wakakur" ? <WakakurBoard data={data} /> : null}
      {data?.view === "guru" ? <GuruBoard data={data} /> : null}
      {data?.view === "wali" ? <WaliBoard data={data} /> : null}
    </main>
  );
}

function OwnerBoard({ data }: { data: Extract<DashboardPayload, { view: "owner" }> }) {
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total sekolah" value={data.schools} />
        <Stat label="Sekolah aktif" value={data.active} />
        <Stat label="Nonaktif" value={data.inactive} />
        <Stat label="Ditangguhkan" value={data.suspended} />
        <Stat label="Pengguna" value={data.users} />
        <Stat label="Guru" value={data.teachers} />
        <Stat label="Siswa" value={data.students} />
      </section>
      <Actions>
        <Action to="/profil">Manajemen sekolah</Action>
        <Action to="/pengguna">Manajemen pengguna</Action>
      </Actions>
    </>
  );
}

function AdminBoard({ data }: { data: Extract<DashboardPayload, { view: "admin" }> }) {
  const complete = data.studentsWithoutClass === 0 && data.teachersWithoutAccount === 0 && data.classesWithoutHomeroom === 0;
  return (
    <>
      <Period name={data.periodName} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Guru" value={data.teachers} />
        <Stat label="Siswa" value={data.students} />
        <Stat label="Kelas" value={data.classes} />
        <Stat label="Mata pelajaran" value={data.subjects} />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Kelengkapan data akademik</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>Siswa tanpa kelas: <strong>{data.studentsWithoutClass}</strong></li>
          <li>Guru tanpa akun masuk: <strong>{data.teachersWithoutAccount}</strong></li>
          <li>Kelas tanpa wali: <strong>{data.classesWithoutHomeroom === null ? "Menunggu semester aktif" : data.classesWithoutHomeroom}</strong></li>
        </ul>
        {complete ? <p className="mt-3"><Badge tone="ok">Data pokok lengkap</Badge></p> : null}
      </section>
      <Actions>
        <Action to="/guru">Tambah Guru</Action>
        <Action to="/siswa" tone="soft">Import Siswa</Action>
        <Action to="/penugasan" tone="soft">Penugasan</Action>
      </Actions>
    </>
  );
}

function KepalaBoard({ data }: { data: Extract<DashboardPayload, { view: "kepala" }> }) {
  return (
    <>
      <Period name={data.periodName} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Guru" value={data.teachers} />
        <Stat label="Siswa" value={data.students} />
        <Stat label="Kelas" value={data.classes} />
        <Stat label="Nilai terkirim" value={ratio(data.gradeSubmitted, data.gradeTotal)} />
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Pengesahan rapor</h2>
          <p className="mt-2 text-sm text-slate-700">Menunggu pengesahan: <strong>{data.reportsPending}</strong></p>
          <p className="mt-1 text-sm text-slate-700">Telah disahkan: <strong>{data.reportsApproved}</strong></p>
          {!data.periodName ? <p className="mt-2 text-sm text-slate-600">Semester aktif belum dipilih, jadi antrean rapor belum dapat dihitung.</p> : null}
        </article>
        <AttendanceCard attendance={data.attendance} periodName={data.periodName} />
      </section>
      <Progress label="Progres pengisian nilai" done={data.gradeSubmitted} total={data.gradeTotal} />
      <Actions>
        <Action to="/pengesahan-rapor">Pengesahan Rapor</Action>
      </Actions>
    </>
  );
}

function WakakurBoard({ data }: { data: Extract<DashboardPayload, { view: "wakakur" }> }) {
  return (
    <>
      <Period name={data.periodName} />
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Kurikulum aktif" value={data.curricula} />
        <Stat label="Kelas tanpa penempatan" value={data.classesWithoutCurriculum} />
        <Stat label="Rapor menunggu validasi" value={data.reportsPending} />
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Progres nilai per kelas</h2>
          {data.classes.length === 0 ? <p className="mt-3 text-sm text-slate-600">Belum ada penugasan mengajar pada semester aktif.</p> : (
            <ul className="mt-3 space-y-3">
              {data.classes.map((item) => (
                <li key={item.name}>
                  <div className="mb-1 flex justify-between text-sm text-slate-700">
                    <span>{item.name}</span>
                    <span>{item.submitted}/{item.total}</span>
                  </div>
                  <Bar done={item.submitted} total={item.total} />
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Guru yang belum mengirim nilai</h2>
          {data.pendingTeachers.length === 0 ? <p className="mt-3 text-sm text-slate-600">Semua nilai yang ditugaskan sudah dikirim, atau belum ada penugasan.</p> : (
            <ul className="mt-3 space-y-2">
              {data.pendingTeachers.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-slate-800">{item.name}</span>
                  <Badge tone="warn">{item.pending} belum dikirim</Badge>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
      <Actions>
        <Action to="/validasi-rapor">Validasi Rapor</Action>
      </Actions>
    </>
  );
}

function GuruBoard({ data }: { data: Extract<DashboardPayload, { view: "guru" }> }) {
  return (
    <>
      <Period name={data.periodName} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Kelas diampu" value={new Set(data.items.map((item) => item.className)).size} />
        <Stat label="Mapel diampu" value={data.total} />
        <Stat label="Nilai belum dikirim" value={data.draft} />
        <Stat label="Permintaan revisi" value={data.revision} />
      </section>
      {!data.linked ? <EmptyState title="Akun belum tertaut" detail="Akun guru ini belum terhubung ke data guru. Hubungi admin sekolah." /> : null}
      {data.linked && data.items.length === 0 ? <EmptyState title="Belum ada penugasan" detail="Belum ada kelas dan mata pelajaran pada semester aktif. Hubungi Wakil Kepala Kurikulum." /> : null}
      {data.items.length > 0 ? (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-300 bg-white">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold">Kelas</th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold">Mata pelajaran</th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold">Status nilai</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className="odd:bg-white even:bg-slate-50">
                  <td className="border border-slate-300 px-3 py-2.5">{item.className}</td>
                  <td className="border border-slate-300 px-3 py-2.5">{item.subjectName}</td>
                  <td className="border border-slate-300 px-3 py-2.5">
                    <Badge tone={item.status === "SUBMITTED" ? "ok" : item.status === "REVISION_REQUESTED" ? "warn" : "muted"}>{GRADE_LABEL[item.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Actions>
        <Action to="/guru/nilai">Input Nilai</Action>
        <Action to="/guru/absensi" tone="soft">Absensi</Action>
      </Actions>
    </>
  );
}

function WaliBoard({ data }: { data: Extract<DashboardPayload, { view: "wali" }> }) {
  const examined = data.reports.diajukan + data.reports.disetujui + data.reports.disahkan + data.reports.dikembalikan;
  return (
    <>
      <Period name={data.periodName} />
      {data.classes.length === 0 ? <EmptyState title="Belum ada kelas binaan" detail={data.periodName ? "Anda belum menjadi wali kelas pada semester aktif." : "Semester aktif belum tersedia, jadi kelas binaan belum dapat ditampilkan."} /> : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Siswa binaan" value={data.students} />
          <Stat label="Kelas" value={data.classes.map((item) => item.name).join(", ")} />
          <Stat label="Nilai lengkap" value={ratio(data.gradeSubmitted, data.gradeTotal)} />
          <Stat label="Rapor diperiksa" value={examined} />
        </section>
      )}
      {data.classes.length > 0 ? (
        <section className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900">Status pemeriksaan rapor</h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              <li>Draf: {data.reports.draf}</li>
              <li>Diajukan: {data.reports.diajukan}</li>
              <li>Disetujui kurikulum: {data.reports.disetujui}</li>
              <li>Dikembalikan: {data.reports.dikembalikan}</li>
              <li>Disahkan: {data.reports.disahkan}</li>
            </ul>
          </article>
          <AttendanceCard attendance={data.attendance} periodName={data.periodName} />
        </section>
      ) : null}
      <Actions>
        <Action to="/wali/pratinjau-rapor">Pratinjau dan Cetak Rapor</Action>
        <Action to="/wali/pemeriksaan-rapor" tone="soft">Pemeriksaan Rapor</Action>
      </Actions>
    </>
  );
}

function AttendanceCard({ attendance, periodName }: { attendance: DashboardPayload extends never ? never : { hadir: number; sakit: number; izin: number; alpa: number; total: number }; periodName: string | null }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-900">Ringkasan kehadiran siswa</h2>
      {attendance.total === 0 ? <p className="mt-3 text-sm text-slate-600">{periodName ? "Belum ada rekap absensi harian pada semester ini." : "Semester aktif belum tersedia."}</p> : (
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
          <li>Hadir: <strong>{attendance.hadir}</strong></li>
          <li>Sakit: <strong>{attendance.sakit}</strong></li>
          <li>Izin: <strong>{attendance.izin}</strong></li>
          <li>Alpa: <strong>{attendance.alpa}</strong></li>
        </ul>
      )}
    </article>
  );
}

function Period({ name }: { name: string | null }) {
  return <p className="text-sm text-slate-600">Semester aktif: <span className="font-semibold text-slate-900">{name ?? "Belum ada"}</span></p>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex justify-between text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{label}</span>
        <span>{ratio(done, total)}</span>
      </div>
      <Bar done={done} total={total} />
    </article>
  );
}

function Bar({ done, total }: { done: number; total: number }) {
  const width = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="h-2 rounded-full bg-slate-200">
      <div className="h-2 rounded-full bg-teal-700" style={{ width: `${width}%` }} />
    </div>
  );
}

function ratio(done: number, total: number) {
  if (total === 0) return "Belum ada";
  return `${done}/${total}`;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Action({ to, children, tone = "solid" }: { to: string; children: ReactNode; tone?: "solid" | "soft" }) {
  const className = tone === "solid"
    ? "inline-flex min-h-11 items-center rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
    : "inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50";
  return <Link to={to} className={className}>{children}</Link>;
}
