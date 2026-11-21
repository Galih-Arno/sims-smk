import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ReportPreviewSheet, type PreviewStudent } from "../components/report/ReportPreviewSheet.tsx";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type WorkflowStatus = "DRAF" | "DIAJUKAN" | "DISETUJUI_WAKAKUR" | "DIKEMBALIKAN" | "DISAHKAN";
type Row = {
  studentId: string;
  name: string;
  nis: string | null;
  nisn: string | null;
  printStatus: "SIAP_CETAK" | "DRAF";
  printLabel: string;
  reviewStatus: "SUDAH_DIPERIKSA" | "BELUM_DIPERIKSA";
  workflowStatus: WorkflowStatus;
  stale: boolean;
  blockers: string[];
};
type Payload = {
  homerooms: Array<{ id: string; className: string; periodName: string }>;
  homeroomId?: string;
  academicPeriodId?: string;
  summary: { total: number; lengkap: number; diperiksa: number; menungguWakakur: number; menungguKepala: number; disahkan: number };
  rows: Row[];
};
type Dossier = {
  context: { className: string; curriculumLabel: string | null; academicPeriodId: string };
  student: PreviewStudent;
  reviewStatus: "SUDAH_DIPERIKSA" | "BELUM_DIPERIKSA";
  reviews: Array<{ id: string; reviewedAt: string; fingerprint: string }>;
  workflow: { status: WorkflowStatus; wakakurReason: string | null; principalReason: string | null } | null;
  events: Array<{ id: string; action: string; toStatus: WorkflowStatus; reason: string | null; createdAt: string }>;
};

const inputClass = "h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm";
const WORKFLOW_BADGE: Record<WorkflowStatus, string> = {
  DRAF: "bg-slate-100 text-slate-600",
  DIAJUKAN: "bg-amber-100 text-amber-800",
  DISETUJUI_WAKAKUR: "bg-violet-100 text-violet-800",
  DIKEMBALIKAN: "bg-orange-100 text-orange-800",
  DISAHKAN: "bg-emerald-100 text-emerald-800",
};
const WORKFLOW_LABEL: Record<WorkflowStatus, string> = {
  DRAF: "Draf",
  DIAJUKAN: "Diajukan",
  DISETUJUI_WAKAKUR: "Disetujui Wakakur",
  DIKEMBALIKAN: "Dikembalikan",
  DISAHKAN: "Disahkan",
};

export function ReportExaminationPage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("SEMUA");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState("");
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function load(nextHomeroom = homeroomId) {
    if (!schoolId) return;
    const suffix = nextHomeroom ? `?homeroomId=${encodeURIComponent(nextHomeroom)}` : "";
    api<Payload>(`/api/v1/schools/${schoolId}/report-examinations${suffix}`)
      .then((result) => { setPayload(result); setMessage(""); })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Pemeriksaan rapor gagal dimuat."));
  }

  useEffect(() => { load(); }, [schoolId, homeroomId]);

  useEffect(() => {
    if (!schoolId || !selectedId || !payload?.academicPeriodId) { setDossier(null); return; }
    const params = new URLSearchParams({ studentId: selectedId, academicPeriodId: payload.academicPeriodId });
    api<Dossier>(`/api/v1/schools/${schoolId}/report-dossiers?${params}`)
      .then(setDossier)
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Detail rapor gagal dimuat."));
  }, [schoolId, selectedId, payload?.academicPeriodId, payload?.rows]);

  const rows = payload?.rows ?? [];
  const filtered = rows.filter((row) => {
    const haystack = `${row.name} ${row.nis ?? ""} ${row.nisn ?? ""}`.toLowerCase();
    if (query && !haystack.includes(query.trim().toLowerCase())) return false;
    if (status === "BELUM_LENGKAP") return row.printStatus !== "SIAP_CETAK";
    if (status === "BELUM_DIPERIKSA" || status === "SUDAH_DIPERIKSA") return row.reviewStatus === status;
    if (status !== "SEMUA") return row.workflowStatus === status;
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedIndex = rows.findIndex((row) => row.studentId === selectedId);
  const selected = rows[selectedIndex] ?? null;
  const summary = payload?.summary;
  const canSubmit = Boolean(selected && selected.printStatus === "SIAP_CETAK" && selected.reviewStatus === "SUDAH_DIPERIKSA" && (selected.workflowStatus === "DRAF" || selected.workflowStatus === "DIKEMBALIKAN"));

  async function act(path: "review" | "submit") {
    if (!schoolId || !payload?.homeroomId || !selected) return;
    setBusy(true);
    try {
      await api(`/api/v1/schools/${schoolId}/report-examinations/${path}`, {
        method: "POST",
        body: JSON.stringify({ homeroomId: payload.homeroomId, studentId: selected.studentId }),
      });
      setMessage(path === "review" ? "Rapor ditandai sudah diperiksa." : "Rapor diajukan ke Wakakur.");
      load();
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Tindakan gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Pemeriksaan Rapor</h1>
        <p className="text-sm text-slate-500">Periksa rapor kelas binaan, lalu ajukan rapor yang siap cetak dan sudah diperiksa.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        <Stat label="Total siswa" value={summary?.total ?? 0} />
        <Stat label="Rapor lengkap" value={summary?.lengkap ?? 0} />
        <Stat label="Sudah diperiksa" value={summary?.diperiksa ?? 0} />
        <Stat label="Menunggu Wakakur" value={summary?.menungguWakakur ?? 0} />
        <Stat label="Menunggu Kepala Sekolah" value={summary?.menungguKepala ?? 0} />
        <Stat label="Sudah disahkan" value={summary?.disahkan ?? 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputClass} value={homeroomId || payload?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setPage(1); setSelectedId(""); }}>
          {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
          {payload?.homerooms.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>)}
        </select>
        <input className={inputClass} placeholder="Cari nama atau NIS" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <select className={inputClass} aria-label="Filter status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="SEMUA">Semua status</option>
          <option value="BELUM_LENGKAP">Belum lengkap</option>
          <option value="BELUM_DIPERIKSA">Belum diperiksa</option>
          <option value="SUDAH_DIPERIKSA">Sudah diperiksa</option>
          <option value="DIAJUKAN">Diajukan</option>
          <option value="DISETUJUI_WAKAKUR">Disetujui Wakakur</option>
          <option value="DIKEMBALIKAN">Dikembalikan</option>
          <option value="DISAHKAN">Disahkan</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Siswa</th>
              <th className="px-3 py-2">Kelengkapan</th>
              <th className="px-3 py-2">Pemeriksaan</th>
              <th className="px-3 py-2">Pengajuan</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? <tr><td className="px-3 py-3 text-slate-500" colSpan={5}>Tidak ada siswa pada filter ini.</td></tr> : null}
            {visible.map((row) => (
              <tr key={row.studentId} className="border-t border-slate-100">
                <td className="px-3 py-2"><p className="font-medium text-slate-900">{row.name}</p><p className="text-xs text-slate-500">{row.nis ?? "—"} · {row.nisn ?? "—"}</p></td>
                <td className="px-3 py-2">{row.printStatus === "SIAP_CETAK" ? <Badge className="bg-emerald-100 text-emerald-800">Siap cetak</Badge> : <Badge className="bg-rose-100 text-rose-800">Belum lengkap</Badge>}</td>
                <td className="px-3 py-2">{row.reviewStatus === "SUDAH_DIPERIKSA" ? <Badge className="bg-sky-100 text-sky-800">Sudah diperiksa</Badge> : <Badge className="bg-slate-200 text-slate-700">Belum diperiksa</Badge>}</td>
                <td className="px-3 py-2"><Badge className={WORKFLOW_BADGE[row.workflowStatus]}>{WORKFLOW_LABEL[row.workflowStatus]}</Badge>{row.stale ? <span className="ml-1 text-xs text-orange-700">Data berubah</span> : null}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Link className="text-sky-700" to={`/wali/pratinjau-rapor?studentId=${row.studentId}`}>Pratinjau</Link>
                    <button type="button" className="text-sky-700" onClick={() => setSelectedId(row.studentId)}>Periksa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="h-8 rounded-lg border border-slate-300 px-2 disabled:opacity-50" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
        <span>{safePage}/{pages}</span>
        <button type="button" className="h-8 rounded-lg border border-slate-300 px-2 disabled:opacity-50" disabled={safePage >= pages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
        <select className={inputClass} aria-label="Ukuran halaman" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </div>
      {selected && dossier ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="h-8 rounded-lg border border-slate-300 px-2 text-sm disabled:opacity-50" disabled={selectedIndex <= 0} onClick={() => setSelectedId(rows[selectedIndex - 1]?.studentId ?? "")}>Siswa sebelumnya</button>
            <button type="button" className="h-8 rounded-lg border border-slate-300 px-2 text-sm disabled:opacity-50" disabled={selectedIndex < 0 || selectedIndex >= rows.length - 1} onClick={() => setSelectedId(rows[selectedIndex + 1]?.studentId ?? "")}>Siswa berikutnya</button>
            <button type="button" className="h-8 rounded-lg bg-sky-700 px-3 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => act("review")}>Tandai Sudah Diperiksa</button>
            <button type="button" className="h-8 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={busy || !canSubmit} onClick={() => act("submit")}>Ajukan ke Wakakur</button>
          </div>
          {dossier.student.blockers.length > 0 ? (
            <ul className="list-disc pl-5 text-sm text-rose-700">{dossier.student.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : <p className="text-sm text-emerald-700">Seluruh komponen rapor lengkap.</p>}
          {dossier.workflow?.wakakurReason || dossier.workflow?.principalReason ? <p className="text-sm text-orange-800">Alasan pengembalian: {dossier.workflow.wakakurReason || dossier.workflow.principalReason}</p> : null}
          <p className="text-xs text-slate-500">Riwayat pemeriksaan: {dossier.reviews.length === 0 ? "belum ada" : dossier.reviews.map((item) => new Date(item.reviewedAt).toLocaleString("id-ID")).join(" · ")}</p>
          <ReportPreviewSheet student={dossier.student} className={dossier.context.className} curriculumLabel={dossier.context.curriculumLabel} structureStatus="TERSEDIA" />
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-200 px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-semibold text-slate-900">{value}</p></div>;
}

function Badge({ className, children }: { className: string; children: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}
