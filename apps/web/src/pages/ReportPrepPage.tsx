import { useEffect, useMemo, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type StudentStatus = "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI";
type GradeStatus = StudentStatus | "BELUM_DITUGASKAN";
type Field = { key: string; label: string; status: "SIAP" | "BELUM_TERSEDIA"; value: string | null };
type SubjectLine = {
  subjectId: string;
  code: string;
  name: string;
  category: "UMUM" | "KEJURUAN";
  teacherName: string | null;
  gradeStatus: GradeStatus;
  score: number | null;
  description: { status: "SIAP" | "BELUM_TERSEDIA" | "PERLU_DITINJAU"; text: string | null };
};
type Attendance = {
  dataStatus: "BELUM_ADA_DATA" | "TERSEDIA";
  completeness: "BELUM_DIKONFIGURASI" | "LENGKAP" | "BELUM_LENGKAP";
  sakit: number | null;
  izin: number | null;
  alpa: number | null;
  finalDays: number;
  verifiedFrom: string | null;
  verifiedTo: string | null;
  requiredDays: number | null;
  finalRequiredDays: number;
  openRequiredDays: number | null;
  unverifiedDays: number | null;
};
type StudentReport = {
  studentId: string;
  name: string;
  nis: string | null;
  status: StudentStatus;
  siap: number;
  belumLengkap: number;
  fields: Field[];
  subjects: SubjectLine[];
  attendance: Attendance;
  homeroomNote: { status: "SIAP" | "BELUM_TERSEDIA"; text: string | null };
};
type Prep = {
  homeroomId: string;
  className: string;
  periodName: string;
  yearName: string;
  curriculumLabel: string | null;
  composer: "KURIKULUM_MERDEKA_SMK" | null;
  structureStatus: "TERSEDIA" | "BELUM_DIKONFIGURASI";
  attendance: Pick<Attendance, "completeness" | "finalDays" | "verifiedFrom" | "verifiedTo" | "requiredDays" | "finalRequiredDays" | "openRequiredDays">;
  summary: { students: number; siap: number; belumLengkap: number; belumDikonfigurasi: number };
  students: StudentReport[];
};
type Payload = { homerooms: Array<{ id: string; className: string; periodName: string }>; prep: Prep | null };

const STATUS_LABEL: Record<GradeStatus, string> = {
  SIAP: "Siap",
  BELUM_LENGKAP: "Belum lengkap",
  BELUM_DIKONFIGURASI: "Belum dikonfigurasi",
  BELUM_DITUGASKAN: "Belum ditugaskan",
};

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function ReportPrepPage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    const suffix = homeroomId ? `?homeroomId=${encodeURIComponent(homeroomId)}` : "";
    api<Payload>(`/api/v1/schools/${schoolId}/homeroom-report-prep${suffix}`)
      .then((result) => {
        setPayload(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Persiapan rapor gagal dimuat."));
  }, [schoolId, homeroomId]);

  const prep = payload?.prep ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (prep?.students ?? []).filter((item) => {
      if (status !== "ALL" && item.status !== status) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || (item.nis ?? "").toLowerCase().includes(needle);
    });
  }, [prep, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = filtered.find((item) => item.studentId === selectedId) ?? null;

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Persiapan Rapor</h1>
        <p className="text-sm text-slate-500">Data rapor Kurikulum Merdeka SMK untuk kelas binaan pada semester aktif. Nilai akhir hanya dibaca dari perhitungan resmi.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={homeroomId || prep?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setPage(1); setSelectedId(""); }}>
          {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
          {payload?.homerooms.map((item) => (
            <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>
          ))}
        </select>
        <input className={`${inputClass} w-full sm:w-56`} value={query} placeholder="Cari siswa" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <select className={inputClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="ALL">Semua status</option>
          <option value="SIAP">Siap</option>
          <option value="BELUM_LENGKAP">Belum lengkap</option>
          <option value="BELUM_DIKONFIGURASI">Belum dikonfigurasi</option>
        </select>
      </div>
      {prep ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label="Siswa" value={prep.summary.students} />
          <Summary label="Rapor siap" value={prep.summary.siap} />
          <Summary label="Belum lengkap" value={prep.summary.belumLengkap} />
          <Summary label="Belum dikonfigurasi" value={prep.summary.belumDikonfigurasi} />
        </div>
      ) : null}
      {prep?.structureStatus === "BELUM_DIKONFIGURASI" ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">Struktur kurikulum kelas belum tersedia untuk rapor Kurikulum Merdeka. Rapor tidak dinyatakan siap.</p>
      ) : null}
      {prep?.curriculumLabel && prep.structureStatus === "TERSEDIA" ? (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{prep.curriculumLabel}. Catatan wali kelas yang belum final ditampilkan sebagai belum tersedia.</p>
      ) : null}
      {prep ? <AttendanceBanner attendance={prep.attendance} /> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Siswa</th>
              <th className="px-3 py-2">Status rapor</th>
              <th className="px-3 py-2">Mapel siap</th>
              <th className="px-3 py-2">Mapel belum lengkap</th>
              <th className="px-3 py-2">Absensi harian</th>
              <th className="px-3 py-2">Catatan wali</th>
            </tr>
          </thead>
          <tbody>
            {!prep ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>Belum ada kelas binaan pada semester aktif.</td></tr>
            ) : visible.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>Tidak ada siswa.</td></tr>
            ) : visible.map((student) => {
              const active = selectedId === student.studentId;
              return (
                <tr key={student.studentId} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <button type="button" className={`rounded-md px-1.5 py-1 text-left ${active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => setSelectedId(active ? "" : student.studentId)}>
                      {student.name}{student.nis ? ` · ${student.nis}` : ""}
                    </button>
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL[student.status]}</td>
                  <td className="px-3 py-2">{student.siap}</td>
                  <td className="px-3 py-2">{student.belumLengkap}</td>
                  <td className="px-3 py-2">{attendanceCounts(student.attendance)}</td>
                  <td className="px-3 py-2">{noteStatusLabel(student.homeroomNote)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected ? <StudentDetail student={selected} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{filtered.length} siswa</span>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-lg border border-slate-300 px-2" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
          <span>{safePage}/{pages}</span>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={safePage >= pages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
        </div>
      </div>
    </section>
  );
}

function AttendanceBanner({ attendance }: { attendance: Prep["attendance"] }) {
  const completeness = attendance.completeness === "BELUM_DIKONFIGURASI"
    ? "Aturan kelengkapan absensi semester belum diaktifkan, sehingga rapor tidak dinyatakan siap hanya karena nilai lengkap."
    : attendance.completeness === "LENGKAP"
      ? "Kelengkapan absensi semester terpenuhi untuk seluruh siswa."
      : "Kelengkapan absensi semester belum terpenuhi untuk seluruh siswa.";
  return <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{completeness} {obligationLabel(attendance)} {coverageLabel(attendance)}</p>;
}

function attendanceCounts(attendance: Attendance): string {
  if (attendance.dataStatus === "BELUM_ADA_DATA") return "Belum ada data";
  return `S ${attendance.sakit} · I ${attendance.izin} · A ${attendance.alpa}`;
}

function countLabel(attendance: Attendance, key: "sakit" | "izin" | "alpa"): string {
  if (attendance.dataStatus === "BELUM_ADA_DATA") return "belum ada data";
  return String(attendance[key]);
}

function noteStatusLabel(note: StudentReport["homeroomNote"]): string {
  return note.status === "SIAP" ? "Final" : "Belum tersedia";
}

function descriptionLabel(description: SubjectLine["description"]): string {
  if (description.status === "SIAP" && description.text) return description.text;
  if (description.status === "PERLU_DITINJAU") return "Perlu ditinjau ulang";
  return "Belum tersedia";
}

function completenessLabel(completeness: Attendance["completeness"]): string {
  if (completeness === "LENGKAP") return "Lengkap";
  if (completeness === "BELUM_LENGKAP") return "Belum lengkap";
  return "Belum dikonfigurasi";
}

function obligationLabel(attendance: Pick<Attendance, "requiredDays" | "finalRequiredDays" | "openRequiredDays">): string {
  if (attendance.requiredDays === null || attendance.openRequiredDays === null) return "Hari wajib belum dikonfigurasi.";
  return `Hari wajib ${attendance.requiredDays}. Hari wajib yang sudah final ${attendance.finalRequiredDays}. Belum diverifikasi ${attendance.openRequiredDays}.`;
}

function coverageLabel(attendance: Pick<Attendance, "finalDays" | "verifiedFrom" | "verifiedTo">): string {
  if (attendance.finalDays === 0 || !attendance.verifiedFrom || !attendance.verifiedTo) return "Belum ada hari final yang diverifikasi.";
  const range = attendance.verifiedFrom === attendance.verifiedTo ? attendance.verifiedFrom : `${attendance.verifiedFrom} sampai ${attendance.verifiedTo}`;
  return `${attendance.finalDays} hari final diverifikasi, cakupan ${range}.`;
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StudentDetail({ student }: { student: StudentReport }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-medium text-slate-900">{student.name} · {STATUS_LABEL[student.status]}</p>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {student.fields.map((field) => (
          <div key={field.key} className="flex justify-between gap-3 text-sm">
            <dt className="text-slate-500">{field.label}</dt>
            <dd className="text-right text-slate-800">{field.status === "BELUM_TERSEDIA" ? "Belum tersedia" : field.value}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1 pr-3">Mata pelajaran</th>
              <th className="py-1 pr-3">Guru</th>
              <th className="py-1 pr-3">Nilai akhir</th>
              <th className="py-1">Deskripsi</th>
            </tr>
          </thead>
          <tbody>
            {student.subjects.length === 0 ? (
              <tr><td className="py-2 text-slate-500" colSpan={4}>Belum dikonfigurasi</td></tr>
            ) : student.subjects.map((subject) => (
              <tr key={subject.subjectId} className="border-t border-slate-100">
                <td className="py-1.5 pr-3">{subject.name}</td>
                <td className="py-1.5 pr-3">{subject.teacherName ?? "Belum ditugaskan"}</td>
                <td className="py-1.5 pr-3">{subject.gradeStatus === "SIAP" && subject.score !== null ? subject.score : STATUS_LABEL[subject.gradeStatus]}</td>
                <td className="py-1.5">{descriptionLabel(subject.description)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-slate-700">
        <p>Kelengkapan absensi: {completenessLabel(student.attendance.completeness)}. {obligationLabel(student.attendance)} {coverageLabel(student.attendance)}</p>
        <p>Belum diverifikasi untuk siswa ini: {student.attendance.unverifiedDays === null ? "belum dikonfigurasi" : student.attendance.unverifiedDays}.</p>
        <p>Sakit {countLabel(student.attendance, "sakit")}, izin {countLabel(student.attendance, "izin")}, alpa {countLabel(student.attendance, "alpa")}.</p>
        <p className="whitespace-pre-wrap">Catatan wali kelas: {student.homeroomNote.status === "SIAP" && student.homeroomNote.text ? student.homeroomNote.text : "Belum tersedia."}</p>
      </div>
    </div>
  );
}
