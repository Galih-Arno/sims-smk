import { useEffect, useMemo, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Student = {
  studentId: string;
  name: string;
  nis: string | null;
  finalStatus: "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI";
  finalScore: number | null;
  objectives: Array<{ label: string; mean: number | null }>;
  scopes: Array<{ label: string; score: number | null }>;
  suggestion: string | null;
  warnings: string[];
  text: string;
};
type Sheet = {
  assignmentId: string;
  className: string;
  subjectName: string;
  periodName: string;
  status: "DRAFT" | "SUBMITTED" | "REVISION_REQUESTED" | null;
  locked: boolean;
  needsReview: boolean;
  revisionReason: string | null;
  decisionNote: string | null;
  students: Student[];
};
type Payload = {
  assignments: Array<{ id: string; className: string; subjectName: string; periodName: string }>;
  sheet: Sheet | null;
};

const STATUS_LABEL = { SIAP: "Siap", BELUM_LENGKAP: "Belum lengkap", BELUM_DIKONFIGURASI: "Belum dikonfigurasi" };
const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function CompetencyDescriptionPage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const suffix = assignmentId ? `?assignmentId=${encodeURIComponent(assignmentId)}` : "";
    api<Payload>(`/api/v1/schools/${schoolId}/competency-descriptions${suffix}`)
      .then((result) => {
        setPayload(result);
        setTexts(Object.fromEntries((result.sheet?.students ?? []).map((item) => [item.studentId, item.text])));
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Deskripsi capaian gagal dimuat."));
  }, [schoolId, assignmentId]);

  const sheet = payload?.sheet ?? null;
  const dirty = useMemo(() => {
    if (!sheet) return false;
    return sheet.students.some((item) => (texts[item.studentId] ?? "") !== item.text);
  }, [sheet, texts]);
  const visible = (sheet?.students ?? []).filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return item.name.toLowerCase().includes(needle) || (item.nis ?? "").toLowerCase().includes(needle);
  });
  const blocked = (sheet?.students ?? []).some((item) => item.warnings.length > 0);

  function studentsPayload() {
    return (sheet?.students ?? []).map((item) => ({ studentId: item.studentId, text: texts[item.studentId] ?? "" }));
  }

  async function save() {
    if (!schoolId || !sheet) return;
    setBusy(true);
    try {
      const result = await api<{ sheet: Sheet }>(`/api/v1/schools/${schoolId}/competency-descriptions`, {
        method: "PUT",
        body: JSON.stringify({ assignmentId: sheet.assignmentId, students: studentsPayload() }),
      });
      setPayload((current) => current ? { ...current, sheet: result.sheet } : current);
      setTexts(Object.fromEntries(result.sheet.students.map((item) => [item.studentId, item.text])));
      setMessage("Draf deskripsi tersimpan. Draf belum masuk rapor.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Draf gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!schoolId || !sheet || dirty) return;
    setBusy(true);
    try {
      const result = await api<{ sheet: Sheet }>(`/api/v1/schools/${schoolId}/competency-descriptions/submit`, {
        method: "POST",
        body: JSON.stringify({ assignmentId: sheet.assignmentId }),
      });
      setPayload((current) => current ? { ...current, sheet: result.sheet } : current);
      setMessage("Deskripsi terkirim ke wali kelas dan terkunci.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Deskripsi gagal dikirim.");
    } finally {
      setBusy(false);
    }
  }

  async function revise() {
    if (!schoolId || !sheet || reason.trim().length < 10) return;
    setBusy(true);
    try {
      const result = await api<{ sheet: Sheet }>(`/api/v1/schools/${schoolId}/competency-descriptions/revision`, {
        method: "POST",
        body: JSON.stringify({ assignmentId: sheet.assignmentId, reason: reason.trim() }),
      });
      setPayload((current) => current ? { ...current, sheet: result.sheet } : current);
      setReason("");
      setMessage("Permintaan revisi dikirim ke wali kelas.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Permintaan revisi gagal.");
    } finally {
      setBusy(false);
    }
  }

  function applySuggestions() {
    if (!sheet) return;
    setTexts((current) => {
      const next = { ...current };
      for (const student of sheet.students) {
        if (!next[student.studentId]?.trim() && student.suggestion) next[student.studentId] = student.suggestion;
      }
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Deskripsi Capaian</h1>
        <p className="text-sm text-slate-500">Deskripsi capaian kompetensi dari TP, lingkup materi, dan hasil penilaian yang sudah tersimpan. Usulan tidak memakai AI.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={assignmentId || sheet?.assignmentId || ""} onChange={(event) => setAssignmentId(event.target.value)}>
          {(payload?.assignments.length ?? 0) === 0 ? <option value="">Belum ada penugasan aktif</option> : null}
          {payload?.assignments.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.subjectName} · {item.periodName}</option>)}
        </select>
        <input className={`${inputClass} w-full sm:w-56`} value={query} placeholder="Cari siswa" onChange={(event) => setQuery(event.target.value)} />
      </div>
      {!sheet ? <p className="text-sm text-slate-500">Anda belum memiliki penugasan mengajar pada semester aktif.</p> : (
        <>
          {blocked ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">Nilai atau TP/LM belum lengkap. Usulan deskripsi tidak dibuat. Deskripsi manual dapat disimpan sebagai draf, tetapi belum dapat dikirim.</p> : null}
          {sheet.needsReview ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">Nilai berubah setelah deskripsi dikirim. Deskripsi perlu ditinjau ulang dan tidak dipakai sebagai deskripsi resmi rapor.</p> : null}
          {sheet.locked ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Deskripsi terkunci. Koreksi dilakukan melalui permintaan revisi kepada wali kelas.{sheet.revisionReason ? ` Alasan: ${sheet.revisionReason}.` : ""}{sheet.decisionNote ? ` Catatan wali: ${sheet.decisionNote}.` : ""}</p> : null}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Siswa</th>
                  <th className="px-3 py-2">Nilai akhir</th>
                  <th className="px-3 py-2">Ringkasan</th>
                  <th className="px-3 py-2">Usulan</th>
                  <th className="px-3 py-2">Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((student) => (
                  <tr key={student.studentId} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                    <td className="px-3 py-2">{student.finalStatus === "SIAP" && student.finalScore !== null ? student.finalScore : STATUS_LABEL[student.finalStatus]}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {student.objectives.map((item) => <p key={item.label}>TP {item.label}: {item.mean ?? "belum ada hasil"}</p>)}
                      {student.scopes.map((item) => <p key={item.label}>LM {item.label}: {item.score ?? "belum ada hasil"}</p>)}
                      {student.warnings.map((item) => <p key={item} className="text-amber-800">{item}</p>)}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{student.suggestion ?? "Belum dapat diusulkan"}</td>
                    <td className="px-3 py-2">
                      <textarea className="min-h-24 w-72 rounded-lg border border-slate-300 px-2 py-1 text-sm" aria-label={`Deskripsi ${student.name}`} value={texts[student.studentId] ?? ""} disabled={sheet.locked} onChange={(event) => setTexts((current) => ({ ...current, [student.studentId]: event.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={sheet.locked || blocked} onClick={applySuggestions}>Gunakan usulan kosong</button>
            <button type="button" className="h-9 rounded-lg bg-sky-700 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy || sheet.locked || !dirty} onClick={() => void save()}>Simpan Draf</button>
            <button type="button" className="h-9 rounded-lg bg-emerald-800 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy || sheet.locked || dirty || blocked || sheet.status === "SUBMITTED" || sheet.status === "REVISION_REQUESTED"} onClick={() => void submit()}>Kirim ke Wali Kelas</button>
          </div>
          {sheet.status === "SUBMITTED" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">Alasan revisi
                <input className={`${inputClass} mt-1 block w-80`} value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={busy || reason.trim().length < 10} onClick={() => void revise()}>Ajukan Revisi</button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
