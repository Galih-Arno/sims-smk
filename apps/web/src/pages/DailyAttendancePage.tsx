import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA" | null;
type Session = { meetingId: string; subjectName: string; sessionNo: number; teacherName: string; status: Exclude<Mark, null> };
type StudentRow = {
  studentId: string;
  name: string;
  nis: string | null;
  status: Mark;
  note: string | null;
  reference: { dataStatus: "TERSEDIA" | "BELUM_ADA_DATA"; conflict: boolean; sessions: Session[] };
};
type RecapRow = { studentId: string; name: string; nis: string | null; dataStatus: "TERSEDIA" | "BELUM_ADA_DATA"; sakit: number | null; izin: number | null; alpa: number | null };
type Sheet = {
  homeroomId: string;
  className: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  attendanceDate: string;
  dayStatus: "DRAFT" | "FINAL" | null;
  finalDays: number;
  canEdit: boolean;
  canFinalize: boolean;
  canCorrect: boolean;
  students: StudentRow[];
  recap: RecapRow[];
};
type Payload = { homerooms: Array<{ id: string; className: string; periodName: string }>; sheet: Sheet | null };
type SavePayload = { sheet: Sheet };

const MARK_LABEL: Record<Exclude<Mark, null>, string> = { HADIR: "Hadir", SAKIT: "Sakit", IZIN: "Izin", ALPA: "Alpa" };
const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function DailyAttendancePage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const schoolRef = useRef(schoolId);

  useEffect(() => {
    if (!schoolId) return;
    const schoolChanged = schoolRef.current !== schoolId;
    schoolRef.current = schoolId;
    const currentHomeroom = schoolChanged ? "" : homeroomId;
    if (schoolChanged && homeroomId) setHomeroomId("");
    const params = new URLSearchParams();
    if (currentHomeroom) params.set("homeroomId", currentHomeroom);
    if (date) params.set("date", date);
    let active = true;
    api<Payload>(`/api/v1/schools/${schoolId}/daily-attendance?${params.toString()}`)
      .then((result) => {
        if (!active) return;
        setPayload(result);
        applySheet(result.sheet);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof ApiClientError ? error.message : "Absensi harian gagal dimuat.");
      });
    return () => {
      active = false;
    };
  }, [schoolId, homeroomId, date]);

  const sheet = payload?.sheet ?? null;
  const editable = Boolean(sheet?.canEdit || sheet?.canCorrect);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (sheet?.students ?? []).filter((student) => {
      const mark = marks[student.studentId] ?? null;
      if (status === "EMPTY" && mark !== null) return false;
      if (status !== "ALL" && status !== "EMPTY" && mark !== status) return false;
      if (!needle) return true;
      return student.name.toLowerCase().includes(needle) || (student.nis ?? "").toLowerCase().includes(needle);
    });
  }, [sheet, query, status, marks]);
  const recapFiltered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (sheet?.recap ?? []).filter((student) => {
      if (!needle) return true;
      return student.name.toLowerCase().includes(needle) || (student.nis ?? "").toLowerCase().includes(needle);
    });
  }, [sheet, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const recapPages = Math.max(1, Math.ceil(recapFiltered.length / pageSize));
  const recapPage = Math.min(page, recapPages);
  const visibleRecap = recapFiltered.slice((recapPage - 1) * pageSize, recapPage * pageSize);

  function applySheet(next: Sheet | null) {
    setMarks(Object.fromEntries((next?.students ?? []).map((student) => [student.studentId, student.status])));
    setNotes(Object.fromEntries((next?.students ?? []).map((student) => [student.studentId, student.note ?? ""])));
    setReason("");
  }

  function records() {
    return (sheet?.students ?? []).map((student) => ({
      studentId: student.studentId,
      status: marks[student.studentId] ?? null,
      note: (notes[student.studentId] ?? "").trim() || null,
    }));
  }

  async function save(mode: "draft" | "finalize" | "correct") {
    if (!schoolId || !sheet) return;
    setBusy(true);
    try {
      const path = mode === "draft" ? "" : mode === "finalize" ? "/finalize" : "/correct";
      const method = mode === "draft" ? "PUT" : "POST";
      const body = {
        homeroomId: sheet.homeroomId,
        attendanceDate: sheet.attendanceDate,
        records: records(),
        ...(mode === "correct" ? { reason: reason.trim() } : {}),
      };
      const result = await api<SavePayload>(`/api/v1/schools/${schoolId}/daily-attendance${path}`, { method, body: JSON.stringify(body) });
      setPayload((current) => ({ homerooms: current?.homerooms ?? [], sheet: result.sheet }));
      applySheet(result.sheet);
      setMessage(mode === "draft" ? "Draf absensi harian tersimpan." : mode === "finalize" ? "Absensi harian difinalisasi." : "Koreksi absensi harian tersimpan.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Absensi harian gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Absensi Harian</h1>
        <p className="text-sm text-slate-500">Status harian ditetapkan wali kelas untuk satu tanggal. Referensi absensi mapel tidak mengisi status, dan beberapa sesi pada tanggal yang sama tetap satu hari.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={homeroomId || sheet?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setDate(""); setPage(1); }}>
          {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
          {payload?.homerooms.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>)}
        </select>
        <input className={inputClass} type="date" aria-label="Tanggal absensi" min={sheet?.periodStart} max={sheet?.periodEnd} value={date || sheet?.attendanceDate || ""} onChange={(event) => { setDate(event.target.value); setPage(1); }} />
        <input className={`${inputClass} w-full sm:w-52`} value={query} placeholder="Cari siswa" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <select className={inputClass} aria-label="Filter status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="ALL">Semua status</option>
          <option value="EMPTY">Belum ada data</option>
          <option value="HADIR">Hadir</option>
          <option value="SAKIT">Sakit</option>
          <option value="IZIN">Izin</option>
          <option value="ALPA">Alpa</option>
        </select>
      </div>
      {sheet ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label="Siswa" value={String(sheet.students.length)} />
          <Summary label="Hari final" value={String(sheet.finalDays)} />
          <Summary label="Status tanggal" value={sheet.dayStatus === "FINAL" ? "Final" : sheet.dayStatus === "DRAFT" ? "Draf" : "Belum ada data"} />
          <Summary label="Belum diisi" value={String(sheet.students.filter((student) => (marks[student.studentId] ?? null) === null).length)} />
        </div>
      ) : null}
      {sheet?.dayStatus === "FINAL" && !sheet.canCorrect ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Absensi harian final terkunci. Koreksi hanya dapat dilakukan admin sekolah atau wakasek kurikulum dengan alasan.</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Siswa</th>
              <th className="px-3 py-2">Referensi mapel</th>
              <th className="px-3 py-2">Status harian</th>
              <th className="px-3 py-2">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {!sheet ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>Belum ada kelas binaan pada semester aktif.</td></tr>
            ) : visible.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>Tidak ada siswa.</td></tr>
            ) : visible.map((student) => (
              <tr key={student.studentId} className="border-t border-slate-100">
                <td className="px-3 py-2 align-top">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                <td className="px-3 py-2 align-top text-slate-600"><Reference reference={student.reference} /></td>
                <td className="px-3 py-2 align-top">
                  <select
                    className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm disabled:bg-slate-50"
                    aria-label={`Status ${student.name}`}
                    disabled={!editable || busy}
                    value={marks[student.studentId] ?? ""}
                    onChange={(event) => setMarks((current) => ({ ...current, [student.studentId]: (event.target.value || null) as Mark }))}
                  >
                    <option value="">Belum diisi</option>
                    <option value="HADIR">Hadir</option>
                    <option value="SAKIT">Sakit</option>
                    <option value="IZIN">Izin</option>
                    <option value="ALPA">Alpa</option>
                  </select>
                </td>
                <td className="px-3 py-2 align-top">
                  <input
                    className="h-8 w-full min-w-36 rounded-lg border border-slate-300 px-2 text-sm disabled:bg-slate-50"
                    aria-label={`Catatan ${student.name}`}
                    maxLength={200}
                    disabled={!editable || busy}
                    value={notes[student.studentId] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [student.studentId]: event.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet?.canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" disabled={busy} onClick={() => save("draft")}>Simpan Draf</button>
          <button type="button" className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={busy} onClick={() => save("finalize")}>Finalisasi Harian</button>
        </div>
      ) : null}
      {sheet?.canCorrect ? (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputClass} w-full sm:w-80`} aria-label="Alasan koreksi" placeholder="Alasan koreksi" value={reason} onChange={(event) => setReason(event.target.value)} />
          <button type="button" className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={busy || reason.trim().length < 5} onClick={() => save("correct")}>Simpan Koreksi</button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{filtered.length} siswa</span>
        <Pager page={safePage} pages={pages} pageSize={pageSize} onPage={setPage} onPageSize={(value) => { setPage(1); setPageSize(value); }} />
      </div>
      <div className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Rekap semester</h2>
          <p className="text-xs text-slate-500">Jumlah hari sakit, izin, dan alpa dari absensi harian final. Satu siswa pada satu tanggal dihitung satu kali. Hari tanpa data tidak dihitung hadir.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Siswa</th>
                <th className="px-3 py-2">Sakit</th>
                <th className="px-3 py-2">Izin</th>
                <th className="px-3 py-2">Alpa</th>
              </tr>
            </thead>
            <tbody>
              {!sheet ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>Belum ada kelas binaan pada semester aktif.</td></tr>
              ) : visibleRecap.length === 0 ? (
                <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>Tidak ada siswa.</td></tr>
              ) : visibleRecap.map((student) => (
                <tr key={student.studentId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                  {student.dataStatus === "BELUM_ADA_DATA" ? (
                    <td className="px-3 py-2 text-slate-500" colSpan={3}>Belum ada data</td>
                  ) : (
                    <>
                      <td className="px-3 py-2">{student.sakit}</td>
                      <td className="px-3 py-2">{student.izin}</td>
                      <td className="px-3 py-2">{student.alpa}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Reference({ reference }: { reference: StudentRow["reference"] }) {
  if (reference.dataStatus === "BELUM_ADA_DATA") return <span>Belum ada data</span>;
  const text = reference.sessions.map((session) => `${session.subjectName} sesi ${session.sessionNo} ${MARK_LABEL[session.status]}`).join(" · ");
  return <span>{text}{reference.conflict ? " · Campuran" : ""}</span>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Pager({ page, pages, pageSize, onPage, onPageSize }: { page: number; pages: number; pageSize: number; onPage: (value: number) => void; onPageSize: (value: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <select className="h-8 rounded-lg border border-slate-300 px-2" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
        <option value={10}>10</option>
        <option value={25}>25</option>
        <option value={50}>50</option>
      </select>
      <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
      <span>{page}/{pages}</span>
      <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
    </div>
  );
}
