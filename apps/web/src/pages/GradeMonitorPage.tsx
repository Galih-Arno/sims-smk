import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type GradeStatus = "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI" | "BELUM_DITUGASKAN";
type ComponentState = "KOSONG" | "DRAFT" | "SUBMITTED" | "REVISION_REQUESTED";
type SubmissionStatus = "SUBMITTED" | "DRAFT" | "REVISION_REQUESTED" | "BELUM_DIKONFIGURASI" | "BELUM_DITUGASKAN";
type ComponentRow = { label: string; state: ComponentState; required: boolean };
type StudentRow = { studentId: string; name: string; nis: string | null; status: GradeStatus; components: ComponentRow[] };
type SubjectRow = {
  subjectId: string;
  code: string;
  name: string;
  assignmentId: string | null;
  teacherName: string | null;
  gradeStatus: GradeStatus;
  submissionStatus: SubmissionStatus;
  siap: number;
  belumLengkap: number;
  revisions: number;
  students: StudentRow[];
};
type Monitor = {
  homeroomId: string;
  className: string;
  periodName: string;
  policyLabel: string | null;
  summary: {
    students: number;
    subjects: number;
    siap: number;
    belumLengkap: number;
    belumDikonfigurasi: number;
    belumDitugaskan: number;
    siswaSiap: number;
    revisi: number;
  };
  subjects: SubjectRow[];
};
type Payload = { homerooms: Array<{ id: string; className: string; periodName: string }>; monitor: Monitor | null };

const GRADE_LABEL: Record<GradeStatus, string> = {
  SIAP: "Siap",
  BELUM_LENGKAP: "Belum lengkap",
  BELUM_DIKONFIGURASI: "Belum dikonfigurasi",
  BELUM_DITUGASKAN: "Belum ditugaskan",
};

const SEND_LABEL: Record<SubmissionStatus, string> = {
  SUBMITTED: "Terkirim",
  DRAFT: "Belum dikirim",
  REVISION_REQUESTED: "Menunggu revisi",
  BELUM_DIKONFIGURASI: "Belum dikonfigurasi",
  BELUM_DITUGASKAN: "Belum ditugaskan",
};

const STATE_LABEL: Record<ComponentState, string> = {
  KOSONG: "Kosong",
  DRAFT: "Draf",
  SUBMITTED: "Terkirim",
  REVISION_REQUESTED: "Menunggu revisi",
};

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function GradeMonitorPage() {
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
    api<Payload>(`/api/v1/schools/${schoolId}/homeroom-grade-monitor${suffix}`)
      .then((result) => {
        setPayload(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Monitoring nilai gagal dimuat."));
  }, [schoolId, homeroomId]);

  const monitor = payload?.monitor ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (monitor?.subjects ?? []).filter((item) => {
      if (status === "REVISION_REQUESTED" && item.revisions === 0) return false;
      if (status !== "ALL" && status !== "REVISION_REQUESTED" && item.gradeStatus !== status) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle) || (item.teacherName ?? "").toLowerCase().includes(needle);
    });
  }, [monitor, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = filtered.find((item) => item.subjectId === selectedId) ?? null;

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Monitoring Nilai</h1>
        <p className="text-sm text-slate-500">Kelengkapan nilai kelas binaan pada semester aktif. Nilai mentah guru hanya dibaca.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={homeroomId || monitor?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setPage(1); setSelectedId(""); }}>
          {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
          {payload?.homerooms.map((item) => (
            <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>
          ))}
        </select>
        <input className={`${inputClass} w-full sm:w-56`} value={query} placeholder="Cari mapel atau guru" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <select className={inputClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="ALL">Semua status</option>
          <option value="SIAP">Siap</option>
          <option value="BELUM_LENGKAP">Belum lengkap</option>
          <option value="BELUM_DIKONFIGURASI">Belum dikonfigurasi</option>
          <option value="BELUM_DITUGASKAN">Belum ditugaskan</option>
          <option value="REVISION_REQUESTED">Menunggu revisi</option>
        </select>
      </div>
      {monitor ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Summary label="Siswa" value={monitor.summary.students} />
          <Summary label="Mapel" value={monitor.summary.subjects} />
          <Summary label="Mapel lengkap" value={monitor.summary.siap} />
          <Summary label="Mapel belum lengkap" value={monitor.summary.belumLengkap} />
          <Summary label="Siswa siap rapor" value={monitor.summary.siswaSiap} />
        </div>
      ) : null}
      {monitor && (monitor.summary.belumDikonfigurasi > 0 || monitor.summary.belumDitugaskan > 0) ? (
        <p className="text-xs text-slate-500">
          {monitor.summary.belumDikonfigurasi > 0 ? `${monitor.summary.belumDikonfigurasi} mapel belum dikonfigurasi. ` : ""}
          {monitor.summary.belumDitugaskan > 0 ? `${monitor.summary.belumDitugaskan} mapel belum ditugaskan dan tidak dihitung sebagai nol.` : ""}
        </p>
      ) : null}
      {monitor?.policyLabel ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Penanda {monitor.policyLabel}. Konfigurasi simulasi pada lingkungan development.</p> : null}
      {monitor && monitor.summary.revisi > 0 ? (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
          {monitor.summary.revisi} permintaan revisi menunggu keputusan wali kelas.{" "}
          <Link className="font-medium underline" to="/wali/penerimaan">Buka penerimaan nilai</Link>
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Mata pelajaran</th>
              <th className="px-3 py-2">Guru pengampu</th>
              <th className="px-3 py-2">Siap</th>
              <th className="px-3 py-2">Belum lengkap</th>
              <th className="px-3 py-2">Pengiriman</th>
            </tr>
          </thead>
          <tbody>
            {!monitor ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={5}>Belum ada kelas binaan pada semester aktif.</td></tr>
            ) : visible.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={5}>Tidak ada mata pelajaran.</td></tr>
            ) : visible.map((subject) => {
              const active = selectedId === subject.subjectId;
              return (
                <tr key={subject.subjectId} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <button type="button" className={`rounded-md px-1.5 py-1 text-left ${active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => setSelectedId(active ? "" : subject.subjectId)}>
                      {subject.name}
                    </button>
                  </td>
                  <td className="px-3 py-2">{subject.teacherName ?? "Belum ditugaskan"}</td>
                  <td className="px-3 py-2">{subject.siap}</td>
                  <td className="px-3 py-2">{subject.belumLengkap}</td>
                  <td className="px-3 py-2">{SEND_LABEL[subject.submissionStatus]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected ? <SubjectDetail subject={selected} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{filtered.length} mata pelajaran</span>
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

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SubjectDetail({ subject }: { subject: SubjectRow }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-medium text-slate-900">{subject.name} · {subject.teacherName ?? "Belum ditugaskan"}</p>
      <p className="text-xs text-slate-500">{GRADE_LABEL[subject.gradeStatus]} · {SEND_LABEL[subject.submissionStatus]}</p>
      {subject.gradeStatus === "BELUM_DITUGASKAN" ? <p className="mt-1 text-sm text-slate-700">Mata pelajaran belum memiliki guru pengampu. Nilai tidak ditampilkan sebagai nol.</p> : null}
      {subject.gradeStatus === "BELUM_DIKONFIGURASI" ? <p className="mt-1 text-sm text-slate-700">Belum ada konfigurasi penilaian yang aktif.</p> : null}
      {subject.assignmentId ? (
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 pr-3">Siswa</th>
                <th className="py-1 pr-3">Kelengkapan</th>
                <th className="py-1">Komponen belum resmi</th>
              </tr>
            </thead>
            <tbody>
              {subject.students.map((student) => {
                const pending = student.components.filter((item) => item.state !== "SUBMITTED");
                return (
                  <tr key={student.studentId} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-3">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                    <td className="py-1.5 pr-3">{GRADE_LABEL[student.status]}</td>
                    <td className="py-1.5 text-xs leading-5 text-slate-600">
                      {pending.length === 0 ? "Komponen wajib sudah terkirim." : pending.map((item) => `${item.label}: ${STATE_LABEL[item.state]}${item.required ? "" : " (tidak wajib)"}`).join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
