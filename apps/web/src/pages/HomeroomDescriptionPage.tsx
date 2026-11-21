import { useEffect, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Subject = {
  assignmentId: string;
  subjectName: string;
  teacherName: string;
  status: "SUBMITTED" | "REVISION_REQUESTED";
  needsReview: boolean;
  revisionReason: string | null;
  students: Array<{ studentId: string; name: string; nis: string | null; text: string | null; reviewStatus: "TERSEDIA" | "PERLU_DITINJAU"; finalScore: number | null }>;
};
type Payload = {
  homerooms: Array<{ id: string; className: string; periodName: string }>;
  view: { homeroomId: string; className: string; periodName: string; subjects: Subject[] } | null;
};

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function HomeroomDescriptionPage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const suffix = homeroomId ? `?homeroomId=${encodeURIComponent(homeroomId)}` : "";
    api<Payload>(`/api/v1/schools/${schoolId}/homeroom-competency-descriptions${suffix}`)
      .then((result) => {
        setPayload(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Deskripsi capaian gagal dimuat."));
  }, [schoolId, homeroomId]);

  async function decide(assignmentId: string, decision: "approve" | "reject") {
    if (!schoolId) return;
    setBusy(true);
    try {
      await api(`/api/v1/schools/${schoolId}/competency-descriptions/decision`, {
        method: "POST",
        body: JSON.stringify({ assignmentId, decision, note: notes[assignmentId] ?? "" }),
      });
      const suffix = homeroomId ? `?homeroomId=${encodeURIComponent(homeroomId)}` : "";
      setPayload(await api<Payload>(`/api/v1/schools/${schoolId}/homeroom-competency-descriptions${suffix}`));
      setMessage(decision === "approve" ? "Revisi disetujui. Guru dapat memperbaiki deskripsi." : "Revisi ditolak. Deskripsi tetap terkunci.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Keputusan revisi gagal.");
    } finally {
      setBusy(false);
    }
  }

  const view = payload?.view ?? null;
  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Deskripsi Capaian</h1>
        <p className="text-sm text-slate-500">Deskripsi yang sudah dikirim guru mata pelajaran. Draf tidak ditampilkan dan tidak dipakai rapor.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <select className={inputClass} value={homeroomId || view?.homeroomId || ""} onChange={(event) => setHomeroomId(event.target.value)}>
        {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
        {payload?.homerooms.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>)}
      </select>
      {!view || view.subjects.length === 0 ? <p className="text-sm text-slate-500">Belum ada deskripsi yang dikirim.</p> : view.subjects.map((subject) => (
        <article key={subject.assignmentId} className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-sm font-medium text-slate-900">{subject.subjectName} · {subject.teacherName}</p>
          {subject.needsReview ? <p className="text-sm text-amber-800">Nilai berubah setelah deskripsi dikirim. Deskripsi perlu ditinjau ulang dan tidak dipakai rapor.</p> : null}
          {subject.status === "REVISION_REQUESTED" ? <p className="text-sm text-slate-600">Permintaan revisi: {subject.revisionReason}</p> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Siswa</th>
                  <th className="py-1 pr-3">Nilai akhir</th>
                  <th className="py-1">Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                {subject.students.map((student) => (
                  <tr key={student.studentId} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                    <td className="py-1.5 pr-3">{student.finalScore ?? "Belum lengkap"}</td>
                    <td className="py-1.5">{student.reviewStatus === "PERLU_DITINJAU" ? "Perlu ditinjau ulang. " : ""}{student.text ?? "Belum tersedia"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {subject.status === "REVISION_REQUESTED" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">Catatan
                <input className={`${inputClass} mt-1 block w-72`} value={notes[subject.assignmentId] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [subject.assignmentId]: event.target.value }))} />
              </label>
              <button type="button" className="h-9 rounded-lg bg-emerald-800 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => void decide(subject.assignmentId, "approve")}>Setujui revisi</button>
              <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={busy} onClick={() => void decide(subject.assignmentId, "reject")}>Tolak revisi</button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
