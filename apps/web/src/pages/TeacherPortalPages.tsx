import { Link } from "react-router-dom";
import { RoleDashboard } from "../components/dashboard/RoleDashboard.tsx";
import { useSchoolScope } from "../lib/school.tsx";
import { usePortal } from "../lib/portal.tsx";

const EMPTY_ASSIGNMENT = "Anda belum memiliki penugasan mengajar. Silakan hubungi Wakasek Kurikulum.";

export function TeacherHomePage() {
  const { schoolId } = useSchoolScope();
  return (
    <RoleDashboard
      view="guru"
      schoolId={schoolId}
      title="Dashboard guru"
      subtitle="Kelas, mata pelajaran, dan status nilai sesuai penugasan Anda pada semester aktif."
    />
  );
}

export function MyClassesPage() {
  const { teachings, loading } = usePortal();
  return (
    <main className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Kelas Saya</h1>
        <p className="mt-1 text-sm text-slate-500">Kelas dan mata pelajaran mengikuti penugasan guru, mapel, kelas, dan semester.</p>
      </div>
      {loading ? <p className="text-sm text-slate-500">Memuat penugasan...</p> : null}
      {!loading && teachings.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm leading-6 text-slate-600">{EMPTY_ASSIGNMENT}</p>
      ) : null}
      {teachings.length > 0 ? (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-300 bg-white">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold">Semester</th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold">Kelas</th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold">Mata pelajaran</th>
                <th className="border border-slate-300 bg-slate-100 px-3 py-2.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {teachings.map((item) => (
                <tr key={item.id} className="odd:bg-white even:bg-slate-50 hover:bg-violet-50">
                  <td className="border border-slate-300 px-3 py-2.5">{item.periodName}</td>
                  <td className="border border-slate-300 px-3 py-2.5">{item.className}</td>
                  <td className="border border-slate-300 px-3 py-2.5">{item.subjectName}</td>
                  <td className="border border-slate-300 px-3 py-2.5">
                    <Link to={`/guru/nilai?penugasan=${item.id}`} className="inline-flex min-h-10 items-center rounded-xl bg-teal-800 px-3 text-sm font-semibold text-white">Input Nilai</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}

export function WaliHomePage() {
  const { schoolId } = useSchoolScope();
  return (
    <RoleDashboard
      view="wali"
      schoolId={schoolId}
      title="Dashboard wali kelas"
      subtitle="Jumlah siswa binaan, kelengkapan nilai, absensi, dan status pemeriksaan rapor."
    />
  );
}
