import { useEffect, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type GradeStatus = "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI" | "BELUM_DITUGASKAN";
type NoteStatus = "BELUM_ADA" | "DRAFT" | "FINAL";
type StudentNote = {
  studentId: string;
  name: string;
  nis: string | null;
  nisn: string;
  gender: "LAKI_LAKI" | "PEREMPUAN";
  note: { status: NoteStatus; text: string | null; locked: boolean };
  subjects: Array<{
    subjectId: string;
    code: string;
    name: string;
    teacherName: string | null;
    gradeStatus: GradeStatus;
    score: number | null;
    description: { status: "SIAP" | "BELUM_TERSEDIA" | "PERLU_DITINJAU"; text: string | null };
  }>;
  attendance: { dataStatus: "BELUM_ADA_DATA" | "TERSEDIA"; sakit: number | null; izin: number | null; alpa: number | null };
};
type Sheet = {
  homeroomId: string;
  className: string;
  periodName: string;
  yearName: string;
  semester: string | null;
  homeroomTeacher: string;
  canEdit: boolean;
  students: StudentNote[];
};
type Payload = { homerooms: Array<{ id: string; className: string; periodName: string; yearName: string }>; sheet: Sheet | null };

const GRADE_LABEL: Record<GradeStatus, string> = {
  SIAP: "Siap",
  BELUM_LENGKAP: "Belum lengkap",
  BELUM_DIKONFIGURASI: "Belum dikonfigurasi",
  BELUM_DITUGASKAN: "Belum ditugaskan",
};
const NOTE_LABEL: Record<NoteStatus, string> = { BELUM_ADA: "Belum ada", DRAFT: "Draf", FINAL: "Final" };
const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function HomeroomNotePage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [correction, setCorrection] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const suffix = homeroomId ? `?homeroomId=${encodeURIComponent(homeroomId)}` : "";
    api<Payload>(`/api/v1/schools/${schoolId}/homeroom-notes${suffix}`)
      .then((result) => {
        setPayload(result);
        setTexts(Object.fromEntries((result.sheet?.students ?? []).map((student) => [student.studentId, student.note.text ?? ""])));
        setCorrection("");
        setReason("");
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Catatan wali kelas gagal dimuat."));
  }, [schoolId, homeroomId]);

  const sheet = payload?.sheet ?? null;
  const selected = sheet?.students.find((student) => student.studentId === selectedId) ?? sheet?.students[0] ?? null;

  async function reload(nextHomeroomId: string) {
    if (!schoolId) return;
    const suffix = nextHomeroomId ? `?homeroomId=${encodeURIComponent(nextHomeroomId)}` : "";
    const result = await api<Payload>(`/api/v1/schools/${schoolId}/homeroom-notes${suffix}`);
    setPayload(result);
    setTexts(Object.fromEntries((result.sheet?.students ?? []).map((student) => [student.studentId, student.note.text ?? ""])));
    setCorrection("");
    setReason("");
  }

  async function save(mode: "draft" | "finalize") {
    if (!schoolId || !sheet || !selected) return;
    setBusy(true);
    try {
      const path = mode === "finalize" ? "homeroom-notes/finalize" : "homeroom-notes";
      await api(`/api/v1/schools/${schoolId}/${path}`, {
        method: mode === "finalize" ? "POST" : "PUT",
        body: JSON.stringify({ homeroomId: sheet.homeroomId, studentId: selected.studentId, text: texts[selected.studentId] ?? "" }),
      });
      await reload(sheet.homeroomId);
      setMessage(mode === "finalize" ? "Catatan difinalisasi dan masuk data rapor." : "Draf catatan disimpan. Draf tidak masuk rapor.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Catatan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function correctNote() {
    if (!schoolId || !sheet || !selected) return;
    setBusy(true);
    try {
      await api(`/api/v1/schools/${schoolId}/homeroom-notes/correct`, {
        method: "POST",
        body: JSON.stringify({ homeroomId: sheet.homeroomId, studentId: selected.studentId, text: correction, reason }),
      });
      await reload(sheet.homeroomId);
      setMessage("Koreksi catatan final tercatat.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Koreksi catatan gagal.");
    } finally {
      setBusy(false);
    }
  }

  const text = selected ? texts[selected.studentId] ?? "" : "";
  const locked = selected?.note.locked === true;
  const unchanged = correction.trim() === (selected?.note.text ?? "").trim();

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Catatan Wali Kelas</h1>
        <p className="text-sm text-slate-500">Catatan individual per siswa pada semester aktif. Isi manual. Draf tidak dipakai sebagai catatan resmi rapor.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <select className={inputClass} value={homeroomId || sheet?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setSelectedId(""); }}>
        {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
        {payload?.homerooms.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>)}
      </select>
      {!sheet ? <p className="text-sm text-slate-500">Belum ada kelas binaan pada semester aktif.</p> : (
        <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Siswa</th>
                  <th className="px-3 py-2">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {sheet.students.length === 0 ? (
                  <tr><td className="px-3 py-4 text-slate-500" colSpan={2}>Tidak ada siswa aktif.</td></tr>
                ) : sheet.students.map((student) => {
                  const active = selected?.studentId === student.studentId;
                  return (
                    <tr key={student.studentId} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <button type="button" className={`rounded-md px-1.5 py-1 text-left ${active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => { setSelectedId(student.studentId); setCorrection(""); setReason(""); }}>
                          {student.name}{student.nis ? ` · ${student.nis}` : ""}
                        </button>
                      </td>
                      <td className="px-3 py-2">{NOTE_LABEL[student.note.status]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selected ? (
            <article className="space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{selected.name}</p>
                <p className="text-sm text-slate-600">NIS {selected.nis ?? "belum ada"} · NISN {selected.nisn} · {selected.gender === "PEREMPUAN" ? "Perempuan" : "Laki-laki"}</p>
                <p className="text-sm text-slate-600">{sheet.className} · {sheet.yearName} · {sheet.semester ?? sheet.periodName} · Wali {sheet.homeroomTeacher}</p>
                <p className="text-sm text-slate-600">Status catatan: {NOTE_LABEL[selected.note.status]}. Absensi: {attendanceLabel(selected.attendance)}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-1 pr-3">Mapel</th>
                      <th className="py-1 pr-3">Nilai akhir</th>
                      <th className="py-1">Deskripsi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.subjects.length === 0 ? (
                      <tr><td className="py-2 text-slate-500" colSpan={3}>Belum ada penempatan kurikulum.</td></tr>
                    ) : selected.subjects.map((subject) => (
                      <tr key={subject.subjectId} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">{subject.name}</td>
                        <td className="py-1.5 pr-3">{subject.gradeStatus === "SIAP" && subject.score !== null ? subject.score : GRADE_LABEL[subject.gradeStatus]}</td>
                        <td className="py-1.5">{descriptionLabel(subject.description)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="block text-sm text-slate-700">
                Catatan
                <textarea className="mt-1 min-h-28 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" aria-label={`Catatan ${selected.name}`} value={text} disabled={!sheet.canEdit || locked} onChange={(event) => setTexts((current) => ({ ...current, [selected.studentId]: event.target.value }))} />
              </label>
              {locked ? <p className="text-sm text-amber-800">Catatan final terkunci. Koreksi wajib menyertakan alasan dan tetap tercatat.</p> : null}
              {!sheet.canEdit ? <p className="text-sm text-slate-600">Catatan hanya dapat diubah oleh wali kelas yang berwenang.</p> : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={busy || !sheet.canEdit || locked || text.trim() === ""} onClick={() => void save("draft")}>Simpan Draf</button>
                <button type="button" className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !sheet.canEdit || locked || text.trim() === ""} onClick={() => void save("finalize")}>Finalisasi Catatan</button>
              </div>
              {locked && sheet.canEdit ? (
                <div className="space-y-2 border-t border-slate-100 pt-2">
                  <label className="block text-sm text-slate-700">
                    Catatan koreksi
                    <textarea className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" aria-label={`Koreksi catatan ${selected.name}`} value={correction} onChange={(event) => setCorrection(event.target.value)} />
                  </label>
                  <label className="block text-sm text-slate-700">
                    Alasan koreksi
                    <input className={`${inputClass} mt-1 w-full`} aria-label={`Alasan koreksi ${selected.name}`} value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={busy || reason.trim().length < 10 || correction.trim() === "" || unchanged} onClick={() => void correctNote()}>Simpan Koreksi</button>
                </div>
              ) : null}
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}

function attendanceLabel(attendance: StudentNote["attendance"]): string {
  if (attendance.dataStatus === "BELUM_ADA_DATA") return "sakit, izin, dan alpa belum ada data";
  return `sakit ${attendance.sakit}, izin ${attendance.izin}, alpa ${attendance.alpa}`;
}

function descriptionLabel(description: StudentNote["subjects"][number]["description"]): string {
  if (description.status === "SIAP" && description.text) return description.text;
  if (description.status === "PERLU_DITINJAU") return "Perlu ditinjau ulang";
  return "Belum tersedia";
}
