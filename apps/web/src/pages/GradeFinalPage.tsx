import { Fragment, useEffect, useMemo, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Status = "BELUM_DIKONFIGURASI" | "BELUM_LENGKAP" | "PRATINJAU" | "SIAP";
type Part = { label: string; value: number | null; weight: number; contribution: number | null; submitted: boolean; note: string };
type Student = { studentId: string; name: string; nis: string | null; status: Status; score: number | null; formula: string; parts: Part[]; savedScore: number | null };
type Sheet = { assignmentId: string; className: string; subjectName: string; periodName: string; curriculumName: string | null; policyLabel: string | null; basis: "preview" | "official"; configured: boolean; canSave: boolean; students: Student[] };
type ListItem = { assignmentId: string; className: string; subjectName: string; periodName: string; siap: number; pratinjau: number; belumLengkap: number; belumDikonfigurasi: number };

const STATUS_LABEL: Record<Status, string> = {
  BELUM_DIKONFIGURASI: "Belum dikonfigurasi",
  BELUM_LENGKAP: "Belum lengkap",
  PRATINJAU: "Pratinjau",
  SIAP: "Siap",
};

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function GradeFinalPage({ view }: { view: "guru" | "wali" }) {
  const { schoolId } = useSchoolScope();
  const [items, setItems] = useState<ListItem[]>([]);
  const [selected, setSelected] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const basis = view === "guru" ? "preview" : "official";

  useEffect(() => {
    if (!schoolId) return;
    api<{ items: ListItem[] }>(`/api/v1/schools/${schoolId}/final-grades?view=${view}`)
      .then((result) => {
        setItems(result.items);
        setSelected((current) => current || result.items[0]?.assignmentId || "");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Daftar nilai akhir gagal dimuat."));
  }, [schoolId, view]);

  useEffect(() => {
    if (!schoolId || !selected) {
      setSheet(null);
      return;
    }
    setBusy(true);
    api<{ sheet: Sheet }>(`/api/v1/schools/${schoolId}/teaching-assignments/${selected}/final-grades?basis=${basis}`)
      .then((result) => setSheet(result.sheet))
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Rincian nilai akhir gagal dimuat."))
      .finally(() => setBusy(false));
  }, [schoolId, selected, basis]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = sheet?.students ?? [];
    if (!needle) return rows;
    return rows.filter((item) => item.name.toLowerCase().includes(needle) || (item.nis ?? "").toLowerCase().includes(needle));
  }, [sheet, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  async function save() {
    if (!schoolId || !selected) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ sheet: Sheet }>(`/api/v1/schools/${schoolId}/teaching-assignments/${selected}/final-grades/commit`, {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      });
      setSheet(result.sheet);
      setMessage("Hasil resmi disimpan. Nilai mentah dan status pengiriman tidak diubah.");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Hasil resmi gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{view === "guru" ? "Nilai Akhir" : "Rekap Nilai Akhir"}</h1>
          <p className="text-sm text-slate-500">
            {view === "guru"
              ? "Pratinjau memakai nilai yang tersimpan. Hasil final hanya muncul jika seluruh komponen wajib sudah dikirim."
              : "Rekap resmi memakai komponen yang sudah dikirim dan diterima. Komponen draf tidak dihitung."}
          </p>
        </div>
        {sheet?.canSave ? (
          <button type="button" className="h-9 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => void save()}>
            Simpan hasil resmi
          </button>
        ) : null}
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={selected} onChange={(event) => { setSelected(event.target.value); setPage(1); setOpenId(null); }}>
          {items.length === 0 ? <option value="">Belum ada penugasan</option> : null}
          {items.map((item) => (
            <option key={item.assignmentId} value={item.assignmentId}>{item.className} · {item.subjectName} · {item.periodName}</option>
          ))}
        </select>
        <input className={`${inputClass} w-56`} value={query} placeholder="Cari siswa" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      </div>
      {sheet && !sheet.configured ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Belum dikonfigurasi. Nilai akhir tidak dihitung.</p> : null}
      {sheet?.policyLabel ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Penanda {sheet.policyLabel}. Konfigurasi simulasi pada lingkungan development.</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Siswa</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Nilai</th>
              <th className="px-3 py-2">Tersimpan</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>{busy ? "Memuat..." : "Tidak ada siswa."}</td></tr>
            ) : visible.map((student) => (
              <Fragment key={student.studentId}>
                <tr className="cursor-pointer border-t border-slate-100" onClick={() => setOpenId((current) => current === student.studentId ? null : student.studentId)}>
                  <td className="px-3 py-2">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                  <td className="px-3 py-2"><StatusBadge status={student.status} /></td>
                  <td className="px-3 py-2">{student.score === null ? "—" : student.score}</td>
                  <td className="px-3 py-2">{student.savedScore === null ? "—" : student.savedScore}</td>
                </tr>
                {openId === student.studentId ? (
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td className="px-3 py-2 text-xs leading-5 text-slate-700" colSpan={4}>
                      <p>{student.formula}</p>
                      <ul className="mt-1 list-disc pl-4">
                        {student.parts.map((part) => (
                          <li key={part.label}>{part.label}: {part.value === null ? "kosong" : part.value} × {part.weight}% {part.submitted ? "(diterima)" : "(belum resmi)"} — {part.note}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{filtered.length} siswa</span>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-lg border border-slate-300 px-2" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
          <span>{page}/{pages}</span>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const tone = status === "SIAP" ? "bg-emerald-100 text-emerald-800" : status === "PRATINJAU" ? "bg-sky-100 text-sky-800" : status === "BELUM_LENGKAP" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[status]}</span>;
}
