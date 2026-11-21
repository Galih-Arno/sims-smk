import { useEffect, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA" | null;
type Assignment = { id: string; className: string; subjectName: string; periodName: string };
type SummaryStudent = { studentId: string; name: string; nis: string | null; hadir: number; sakit: number; izin: number; alpa: number };
type MeetingItem = { id: string; meetingDate: string; sessionNo: number; note: string | null; marker: string | null; status: "DRAFT" | "FINAL"; filled: number; students: number };
type Board = {
  assignments: Assignment[];
  assignmentId: string | null;
  summary: { finalMeetings: number; draftMeetings: number; students: SummaryStudent[] };
  meetings: { items: MeetingItem[]; page: number; pageSize: number; total: number };
};
type SheetStudent = { studentId: string; name: string; nis: string | null; status: Mark };
type Sheet = {
  meeting: {
    id: string;
    meetingDate: string;
    sessionNo: number;
    note: string | null;
    marker: string | null;
    status: "DRAFT" | "FINAL";
    className: string;
    subjectName: string;
    teacherName: string;
    canEdit: boolean;
    canFinalize: boolean;
    canCorrect: boolean;
  };
  students: SheetStudent[];
};

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";
const MARKS: Array<{ value: Mark; label: string }> = [
  { value: null, label: "Belum diisi" },
  { value: "HADIR", label: "Hadir" },
  { value: "SAKIT", label: "Sakit" },
  { value: "IZIN", label: "Izin" },
  { value: "ALPA", label: "Alpa" },
];

export function AttendancePage() {
  const { schoolId } = useSchoolScope();
  const [board, setBoard] = useState<Board | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [meetingDate, setMeetingDate] = useState("");
  const [sessionNo, setSessionNo] = useState("1");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const params = new URLSearchParams();
    if (assignmentId) params.set("assignmentId", assignmentId);
    if (query.trim()) params.set("q", query.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    api<Board>(`/api/v1/schools/${schoolId}/attendance?${params.toString()}`)
      .then((result) => {
        setBoard(result);
        setMessage("");
        if (!assignmentId && result.assignmentId) setAssignmentId(result.assignmentId);
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Absensi gagal dimuat."));
  }, [schoolId, assignmentId, query, from, to, page, pageSize]);

  function openMeeting(meetingId: string) {
    if (!schoolId) return;
    api<Sheet>(`/api/v1/schools/${schoolId}/attendance/meetings/${meetingId}`)
      .then((result) => {
        setSheet(result);
        setMarks(Object.fromEntries(result.students.map((student) => [student.studentId, student.status])));
        setReason("");
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Pertemuan gagal dimuat."));
  }

  function records() {
    return Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
  }

  async function createMeeting() {
    if (!schoolId || !board?.assignmentId) return;
    setBusy(true);
    try {
      const result = await api<Sheet>(`/api/v1/schools/${schoolId}/attendance/meetings`, {
        method: "POST",
        body: JSON.stringify({
          assignmentId: board.assignmentId,
          meetingDate,
          sessionNo: Number(sessionNo),
          note: note.trim() || null,
        }),
      });
      setCreating(false);
      setNote("");
      setSheet(result);
      setMarks(Object.fromEntries(result.students.map((student) => [student.studentId, student.status])));
      setPage(1);
      setBoard((current) => current ? { ...current, meetings: { ...current.meetings, total: current.meetings.total + 1 } } : current);
      const params = new URLSearchParams({ assignmentId: board.assignmentId, page: "1", pageSize: String(pageSize) });
      setBoard(await api<Board>(`/api/v1/schools/${schoolId}/attendance?${params.toString()}`));
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Pertemuan gagal dibuat.");
    } finally {
      setBusy(false);
    }
  }

  async function save(mode: "draft" | "finalize" | "correct") {
    if (!schoolId || !sheet) return;
    setBusy(true);
    try {
      const path = mode === "draft"
        ? `/api/v1/schools/${schoolId}/attendance/meetings/${sheet.meeting.id}`
        : `/api/v1/schools/${schoolId}/attendance/meetings/${sheet.meeting.id}/${mode === "finalize" ? "finalize" : "correct"}`;
      const body = mode === "correct" ? { reason, records: records() } : { records: records() };
      const result = await api<Sheet>(path, { method: mode === "draft" ? "PUT" : "POST", body: JSON.stringify(body) });
      setSheet(result);
      setMarks(Object.fromEntries(result.students.map((student) => [student.studentId, student.status])));
      setMessage(mode === "finalize" ? "Pertemuan difinalisasi." : mode === "correct" ? "Koreksi tersimpan." : "Draf tersimpan.");
      if (board?.assignmentId) {
        const params = new URLSearchParams({ assignmentId: board.assignmentId, page: String(page), pageSize: String(pageSize) });
        if (query.trim()) params.set("q", query.trim());
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        setBoard(await api<Board>(`/api/v1/schools/${schoolId}/attendance?${params.toString()}`));
      }
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Absensi gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil((board?.meetings.total ?? 0) / pageSize));
  const locked = sheet?.meeting.status === "FINAL" && !sheet.meeting.canCorrect;
  const editable = Boolean(sheet?.meeting.canEdit || sheet?.meeting.canCorrect);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Absensi Siswa</h1>
          <p className="text-sm text-slate-500">Kehadiran per pertemuan pada kelas dan mapel yang menjadi penugasan aktif. Siswa yang belum diisi tetap kosong.</p>
        </div>
        <button type="button" className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={!board?.assignmentId} onClick={() => setCreating(true)}>Tambah Pertemuan</button>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={assignmentId} onChange={(event) => { setAssignmentId(event.target.value); setPage(1); setSheet(null); }}>
          {(board?.assignments.length ?? 0) === 0 ? <option value="">Belum ada penugasan aktif</option> : null}
          {board?.assignments.map((item) => (
            <option key={item.id} value={item.id}>{item.className} · {item.subjectName} · {item.periodName}</option>
          ))}
        </select>
        <input className={`${inputClass} w-full sm:w-48`} value={query} placeholder="Cari catatan atau sesi" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <input className={inputClass} type="date" value={from} aria-label="Dari tanggal" onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        <input className={inputClass} type="date" value={to} aria-label="Sampai tanggal" onChange={(event) => { setTo(event.target.value); setPage(1); }} />
      </div>
      {board ? (
        <p className="text-xs text-slate-500">{board.summary.finalMeetings} pertemuan final · {board.summary.draftMeetings} draf. Rekap di bawah hanya menghitung pertemuan final.</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Sesi</th>
              <th className="px-3 py-2">Catatan</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Terisi</th>
            </tr>
          </thead>
          <tbody>
            {(board?.meetings.items.length ?? 0) === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={5}>Belum ada pertemuan.</td></tr>
            ) : board?.meetings.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <button type="button" className={`rounded-md px-1.5 py-1 ${sheet?.meeting.id === item.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => openMeeting(item.id)}>{item.meetingDate}</button>
                </td>
                <td className="px-3 py-2">{item.sessionNo}</td>
                <td className="px-3 py-2">{item.note || "—"}{item.marker ? ` · ${item.marker}` : ""}</td>
                <td className="px-3 py-2">{item.status === "FINAL" ? "Final" : "Draf"}</td>
                <td className="px-3 py-2">{item.filled}/{item.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{board?.meetings.total ?? 0} pertemuan</span>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-lg border border-slate-300 px-2" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
          <span>{Math.min(page, pages)}/{pages}</span>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
        </div>
      </div>
      {sheet ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">{sheet.meeting.className} · {sheet.meeting.subjectName} · {sheet.meeting.meetingDate} sesi {sheet.meeting.sessionNo}</p>
            <p className="text-xs text-slate-500">{sheet.meeting.status === "FINAL" ? "Terkunci" : "Draf"} · {sheet.meeting.teacherName}</p>
          </div>
          {locked ? <p className="text-xs text-slate-500">Pertemuan final terkunci. Koreksi hanya dapat dilakukan admin sekolah atau wakasek kurikulum dengan alasan.</p> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Siswa</th>
                  <th className="py-1">Kehadiran</th>
                </tr>
              </thead>
              <tbody>
                {sheet.students.map((student) => (
                  <tr key={student.studentId} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                    <td className="py-1.5">
                      <select
                        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-50"
                        disabled={!editable || busy}
                        value={marks[student.studentId] ?? ""}
                        onChange={(event) => setMarks((current) => ({ ...current, [student.studentId]: (event.target.value || null) as Mark }))}
                      >
                        {MARKS.map((item) => <option key={item.label} value={item.value ?? ""}>{item.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.meeting.canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" disabled={busy} onClick={() => save("draft")}>Simpan Draf</button>
              <button type="button" className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => save("finalize")}>Finalisasi Pertemuan</button>
            </div>
          ) : null}
          {sheet.meeting.canCorrect ? (
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${inputClass} w-full sm:w-80`} value={reason} placeholder="Alasan koreksi" onChange={(event) => setReason(event.target.value)} />
              <button type="button" className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={busy || reason.trim().length < 5} onClick={() => save("correct")}>Simpan Koreksi</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Siswa</th>
              <th className="px-3 py-2">Hadir</th>
              <th className="px-3 py-2">Sakit</th>
              <th className="px-3 py-2">Izin</th>
              <th className="px-3 py-2">Alpa</th>
            </tr>
          </thead>
          <tbody>
            {(board?.summary.students.length ?? 0) === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={5}>Belum ada rekap.</td></tr>
            ) : board?.summary.students.map((student) => (
              <tr key={student.studentId} className="border-t border-slate-100">
                <td className="px-3 py-2">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                <td className="px-3 py-2">{student.hadir}</td>
                <td className="px-3 py-2">{student.sakit}</td>
                <td className="px-3 py-2">{student.izin}</td>
                <td className="px-3 py-2">{student.alpa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-create-title"
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onSubmit={(event) => { event.preventDefault(); void createMeeting(); }}
          >
            <h2 id="attendance-create-title" className="text-base font-semibold text-slate-900">Tambah Pertemuan</h2>
            <p className="mt-1 text-xs text-slate-500">Beberapa sesi pada tanggal yang sama diizinkan. Sesi dengan nomor yang sama ditolak.</p>
            <div className="mt-3 space-y-2">
              <label className="block text-sm text-slate-700">Tanggal
                <input className={`${inputClass} mt-1 w-full`} type="date" required value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} />
              </label>
              <label className="block text-sm text-slate-700">Nomor sesi
                <input className={`${inputClass} mt-1 w-full`} type="number" min={1} max={20} required value={sessionNo} onChange={(event) => setSessionNo(event.target.value)} />
              </label>
              <label className="block text-sm text-slate-700">Catatan
                <input className={`${inputClass} mt-1 w-full`} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setCreating(false)}>Batal</button>
              <button type="submit" className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={busy || !meetingDate}>Simpan</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
