import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AssessmentWorkflowStatus, GradeComponentStatusDto, GradeWorkflowItemDto, GradeWorkflowListDto } from "@sims/shared";
import { GradeMarkIcon, type CellMark } from "../components/grade/GradeMarks.tsx";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

const STATUS_MARK: Record<AssessmentWorkflowStatus, { mark: CellMark; label: string }> = {
  DRAFT: { mark: "empty", label: "Draf" },
  SUBMITTED: { mark: "submitted", label: "Terkirim" },
  REVISION_REQUESTED: { mark: "revision", label: "Menunggu revisi" },
};

export function GradeStatusPage({ view }: { view: "guru" | "wali" | "staff" }) {
  const { schoolId } = useSchoolScope();
  const [data, setData] = useState<GradeWorkflowListDto | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState("");
  const [resolveTarget, setResolveTarget] = useState<GradeWorkflowItemDto | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const title = view === "guru" ? "Status Nilai" : "Penerimaan Nilai";

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    setLoading(true);
    setError("");
    api<{ workflows: GradeWorkflowListDto }>(`/api/v1/schools/${schoolId}/grade-workflows?view=${view}`)
      .then((result) => {
        if (active) setData(result.workflows);
      })
      .catch((caught) => {
        if (!active) return;
        setData(null);
        setError(caught instanceof ApiClientError ? caught.message : "Status nilai gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [schoolId, view]);

  async function reload() {
    if (!schoolId) return;
    const result = await api<{ workflows: GradeWorkflowListDto }>(`/api/v1/schools/${schoolId}/grade-workflows?view=${view}`);
    setData(result.workflows);
  }

  async function resolveLegacy() {
    if (!schoolId || !resolveTarget || resolveNote.trim().length < 10) return;
    setResolving(true);
    setError("");
    try {
      await api(`/api/v1/schools/${schoolId}/teaching-assignments/${resolveTarget.assignmentId}/scores/resolve-legacy`, {
        method: "POST",
        body: JSON.stringify({ confirm: true, note: resolveNote.trim() }),
      });
      await reload();
      setResolveTarget(null);
      setResolveNote("");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Status lama gagal diselesaikan.");
    } finally {
      setResolving(false);
    }
  }

  async function decide(assignmentId: string, componentKey: string, decision: "approve" | "reject") {
    if (!schoolId) return;
    setBusyId(`${assignmentId}:${componentKey}`);
    setError("");
    try {
      await api(`/api/v1/schools/${schoolId}/teaching-assignments/${assignmentId}/scores/revision-decision`, {
        method: "POST",
        body: JSON.stringify({ componentKey, decision, note: note.trim() || undefined }),
      });
      await reload();
      setNote("");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Keputusan revisi gagal disimpan.");
    } finally {
      setBusyId("");
    }
  }

  const rows: { key: string; item: GradeWorkflowItemDto; component: (GradeComponentStatusDto & { canDecide: boolean }) | null }[] = [];
  for (const item of data?.items ?? []) {
    if (item.legacyLock) {
      rows.push({ key: `${item.assignmentId}:legacy`, item, component: null });
    } else {
      for (const component of item.components) rows.push({ key: `${item.assignmentId}:${component.key}`, item, component });
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl">
      <h1 className="text-[23px] font-semibold leading-none text-slate-900">{title}</h1>
      <p className="mt-1 text-[13px] text-slate-600">
        {view === "guru"
          ? "Progres tiap komponen pada penugasan Anda."
          : view === "wali"
            ? "Nilai masuk dan permintaan revisi dari guru mapel pada kelas perwalian."
            : "Pemantauan pengiriman nilai. Admin sekolah menyelesaikan status lama setelah konfirmasi. Persetujuan revisi dilakukan wali kelas."}
      </p>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading || !data ? <p className="mt-4 text-sm text-slate-500">Memuat status nilai...</p> : (
        <div className="mt-3 space-y-3">
          {data.warning ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">{data.warning}</p> : null}
          {data.homeroomMissing || (data.message && data.items.length === 0) ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm leading-6 text-slate-700">{data.message}</p>
          ) : (
            <>
              {view === "wali" ? (
                <label className="block text-[13px] font-semibold text-slate-700">Catatan keputusan
                  <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 h-9 w-full max-w-md rounded-lg border border-slate-300 px-2 text-sm font-normal" />
                </label>
              ) : null}
              <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-slate-100 text-[13px] text-slate-700">
                    <tr className="h-10">
                      <th className="px-3 font-semibold">Kelas</th>
                      <th className="px-3 font-semibold">Mapel</th>
                      {view !== "guru" ? <th className="px-3 font-semibold">Guru</th> : null}
                      <th className="px-3 font-semibold">Komponen</th>
                      <th className="px-3 font-semibold">Terisi</th>
                      <th className="px-3 font-semibold">Status</th>
                      <th className="px-3 font-semibold">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const component = row.component;
                      const status = component ? STATUS_MARK[component.status] : STATUS_MARK[row.item.legacyLock?.status ?? "SUBMITTED"];
                      const busy = busyId === `${row.item.assignmentId}:${component?.key ?? ""}`;
                      return (
                        <tr key={row.key} className="h-10 border-t border-slate-200">
                          <td className="px-3 font-semibold text-slate-900">{row.item.className}</td>
                          <td className="px-3">{row.item.subjectName}</td>
                          {view !== "guru" ? <td className="px-3">{row.item.teacherName}</td> : null}
                          <td className="px-3">{component ? component.label : "Status lama, tidak dipetakan"}</td>
                          <td className="px-3 tabular-nums">{component ? `${component.filled}/${component.total}` : "—"}</td>
                          <td className="px-3">
                            <span className="inline-flex items-center gap-1.5" title={status.label}>
                              <GradeMarkIcon mark={status.mark} />
                              <span>{row.item.legacyLock ? "Terkunci status lama" : status.label}</span>
                            </span>
                            {component?.status === "REVISION_REQUESTED" && component.revisionReason ? <p className="max-w-64 truncate text-[11px] text-orange-800" title={component.revisionReason}>{component.revisionReason}</p> : null}
                            {row.item.legacyLock?.reason ? <p className="max-w-64 truncate text-[11px] text-orange-800" title={row.item.legacyLock.reason}>{row.item.legacyLock.reason}</p> : null}
                          </td>
                          <td className="px-3">
                            {view === "guru" ? <Link to={`/guru/nilai?penugasan=${row.item.assignmentId}`} className="font-semibold text-teal-800">Buka input</Link> : null}
                            {view === "staff" && row.item.canResolveLegacy ? (
                              <button type="button" onClick={() => { setResolveTarget(row.item); setResolveNote(""); }} className="h-8 rounded-md bg-orange-700 px-2 text-xs font-semibold text-white">Selesaikan status lama</button>
                            ) : null}
                            {view === "wali" && component && component.canDecide ? (
                              <span className="inline-flex gap-1">
                                <button type="button" disabled={busy} onClick={() => void decide(row.item.assignmentId, component.key, "approve")} className="h-8 rounded-md bg-teal-800 px-2 text-xs font-semibold text-white disabled:opacity-60">Setujui</button>
                                <button type="button" disabled={busy} onClick={() => void decide(row.item.assignmentId, component.key, "reject")} className="h-8 rounded-md border border-slate-300 px-2 text-xs font-semibold disabled:opacity-60">Tolak</button>
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
      {resolveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="legacy-resolve-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="legacy-resolve-title" className="text-lg font-semibold text-slate-900">Selesaikan status lama?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{resolveTarget.className} · {resolveTarget.subjectName} · {resolveTarget.teacherName}. Baris pengiriman lama dan seluruh nilai tetap tersimpan.</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">Komponen yang belum pernah dikirim kembali draf. Komponen yang sudah terkirim tetap terkunci. Status lama tidak terbuka tanpa konfirmasi ini.</p>
            <label className="mt-3 block text-sm font-semibold text-slate-700">Catatan penyelesaian
              <textarea value={resolveNote} onChange={(event) => setResolveNote(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-normal" />
            </label>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setResolveTarget(null)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold">Batal</button>
              <button type="button" onClick={() => void resolveLegacy()} disabled={resolving || resolveNote.trim().length < 10} className="h-9 rounded-lg bg-orange-700 px-3 text-sm font-semibold text-white disabled:opacity-60">{resolving ? "Menyimpan..." : "Konfirmasi penyelesaian"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
