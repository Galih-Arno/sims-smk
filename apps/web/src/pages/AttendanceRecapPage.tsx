import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Mark = "HADIR" | "SAKIT" | "IZIN" | "ALPA";
type Session = { meetingId: string; meetingDate: string; sessionNo: number; subjectName: string; teacherName: string; status: Mark };
type SubjectLine = {
  subjectId: string;
  name: string;
  teacherName: string;
  dataStatus: "TERSEDIA" | "BELUM_ADA_DATA";
  hadir: number | null;
  sakit: number | null;
  izin: number | null;
  alpa: number | null;
  sessions: Session[];
};
type StudentRow = { studentId: string; name: string; nis: string | null; subjects: SubjectLine[] };
type SubjectInfo = { subjectId: string; name: string; teacherName: string; finalMeetings: number; dataStatus: "TERSEDIA" | "BELUM_ADA_DATA" };
type Recap = { homeroomId: string; className: string; periodName: string; subjects: SubjectInfo[]; students: StudentRow[] };
type Payload = { homerooms: Array<{ id: string; className: string; periodName: string }>; recap: Recap | null };

const MARK_LABEL: Record<Mark, string> = { HADIR: "Hadir", SAKIT: "Sakit", IZIN: "Izin", ALPA: "Alpa" };
const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function AttendanceRecapPage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [query, setQuery] = useState("");
  const [subjectId, setSubjectId] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");

  const schoolRef = useRef(schoolId);
  useEffect(() => {
    if (!schoolId) return;
    const schoolChanged = schoolRef.current !== schoolId;
    schoolRef.current = schoolId;
    const currentHomeroom = schoolChanged ? "" : homeroomId;
    if (schoolChanged && homeroomId) setHomeroomId("");
    const params = new URLSearchParams();
    if (currentHomeroom) params.set("homeroomId", currentHomeroom);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const queryText = params.toString();
    const suffix = queryText ? `?${queryText}` : "";
    let active = true;
    api<Payload>(`/api/v1/schools/${schoolId}/homeroom-attendance-recap${suffix}`)
      .then((result) => {
        if (!active) return;
        setPayload(result);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPayload(null);
        setMessage(error instanceof ApiClientError ? error.message : "Rekap absensi gagal dimuat.");
      });
    return () => {
      active = false;
    };
  }, [schoolId, homeroomId, from, to]);

  const recap = payload?.recap ?? null;
  const subjects = useMemo(
    () => (recap?.subjects ?? []).filter((item) => subjectId === "ALL" || item.subjectId === subjectId),
    [recap, subjectId],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (recap?.students ?? []).filter((item) => {
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || (item.nis ?? "").toLowerCase().includes(needle);
    });
  }, [recap, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = filtered.find((item) => item.studentId === selectedId) ?? null;
  const finalMeetings = subjects.reduce((total, item) => total + item.finalMeetings, 0);
  const missing = subjects.filter((item) => item.dataStatus === "BELUM_ADA_DATA").length;

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Rekap Absensi Mapel</h1>
        <p className="text-sm text-slate-500">Rekap sesi pertemuan final pada kelas binaan. Beberapa sesi pada tanggal yang sama dihitung terpisah dan tidak diubah menjadi absensi harian rapor.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={homeroomId || recap?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setPage(1); setSelectedId(""); setSubjectId("ALL"); }}>
          {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
          {payload?.homerooms.map((item) => (
            <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>
          ))}
        </select>
        <input className={`${inputClass} w-full sm:w-52`} value={query} placeholder="Cari siswa" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <select className={inputClass} value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setPage(1); }}>
          <option value="ALL">Semua mapel</option>
          {recap?.subjects.map((item) => <option key={item.subjectId} value={item.subjectId}>{item.name}</option>)}
        </select>
        <input className={inputClass} type="date" aria-label="Dari tanggal" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        <input className={inputClass} type="date" aria-label="Sampai tanggal" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
      </div>
      {recap ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Summary label="Siswa" value={String(recap.students.length)} />
          <Summary label="Mapel" value={String(subjects.length)} />
          <Summary label="Pertemuan final" value={String(finalMeetings)} />
          <Summary label="Belum ada data" value={String(missing)} />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Mapel</th>
              <th className="px-3 py-2">Guru</th>
              <th className="px-3 py-2">Pertemuan final</th>
              <th className="px-3 py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {!recap ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>Belum ada kelas binaan pada semester aktif.</td></tr>
            ) : subjects.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={4}>Belum ada penugasan mapel pada kelas ini.</td></tr>
            ) : subjects.map((subject) => (
              <tr key={subject.subjectId} className="border-t border-slate-100">
                <td className="px-3 py-2">{subject.name}</td>
                <td className="px-3 py-2">{subject.teacherName}</td>
                <td className="px-3 py-2">{subject.finalMeetings}</td>
                <td className="px-3 py-2">{subject.dataStatus === "BELUM_ADA_DATA" ? "Belum ada data" : "Tersedia"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Siswa</th>
              <th className="px-3 py-2">Mapel</th>
              <th className="px-3 py-2">Hadir</th>
              <th className="px-3 py-2">Sakit</th>
              <th className="px-3 py-2">Izin</th>
              <th className="px-3 py-2">Alpa</th>
            </tr>
          </thead>
          <tbody>
            {!recap ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>Belum ada kelas binaan pada semester aktif.</td></tr>
            ) : visible.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={6}>Tidak ada siswa.</td></tr>
            ) : visible.flatMap((student) => {
              const lines = student.subjects.filter((item) => subjectId === "ALL" || item.subjectId === subjectId);
              const active = selectedId === student.studentId;
              if (lines.length === 0) {
                return [(
                  <tr key={student.studentId} className="border-t border-slate-100">
                    <td className="px-3 py-2"><StudentButton active={active} student={student} onClick={() => setSelectedId(active ? "" : student.studentId)} /></td>
                    <td className="px-3 py-2 text-slate-500" colSpan={5}>Belum ada penugasan mapel.</td>
                  </tr>
                )];
              }
              return lines.map((line, index) => (
                <tr key={`${student.studentId}-${line.subjectId}`} className="border-t border-slate-100">
                  {index === 0 ? (
                    <td className="px-3 py-2 align-top" rowSpan={lines.length}>
                      <StudentButton active={active} student={student} onClick={() => setSelectedId(active ? "" : student.studentId)} />
                    </td>
                  ) : null}
                  <td className="px-3 py-2">{line.name}</td>
                  {line.dataStatus === "BELUM_ADA_DATA" ? (
                    <td className="px-3 py-2 text-slate-500" colSpan={4}>Belum ada data</td>
                  ) : (
                    <>
                      <td className="px-3 py-2">{line.hadir}</td>
                      <td className="px-3 py-2">{line.sakit}</td>
                      <td className="px-3 py-2">{line.izin}</td>
                      <td className="px-3 py-2">{line.alpa}</td>
                    </>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      {selected ? <StudentDetail student={selected} subjectId={subjectId} /> : null}
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function StudentButton({ active, student, onClick }: { active: boolean; student: StudentRow; onClick: () => void }) {
  return (
    <button type="button" className={`rounded-md px-1.5 py-1 text-left ${active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={onClick}>
      {student.name}{student.nis ? ` · ${student.nis}` : ""}
    </button>
  );
}

function StudentDetail({ student, subjectId }: { student: StudentRow; subjectId: string }) {
  const sessions = student.subjects
    .filter((item) => subjectId === "ALL" || item.subjectId === subjectId)
    .flatMap((item) => item.sessions)
    .sort((left, right) => left.meetingDate.localeCompare(right.meetingDate) || left.sessionNo - right.sessionNo || left.subjectName.localeCompare(right.subjectName));
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm font-medium text-slate-900">{student.name}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1 pr-3">Tanggal</th>
              <th className="py-1 pr-3">Mapel</th>
              <th className="py-1 pr-3">Sesi</th>
              <th className="py-1 pr-3">Guru</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td className="py-2 text-slate-500" colSpan={5}>Belum ada data</td></tr>
            ) : sessions.map((session) => (
              <tr key={session.meetingId} className="border-t border-slate-100">
                <td className="py-1.5 pr-3">{session.meetingDate}</td>
                <td className="py-1.5 pr-3">{session.subjectName}</td>
                <td className="py-1.5 pr-3">{session.sessionNo}</td>
                <td className="py-1.5 pr-3">{session.teacherName}</td>
                <td className="py-1.5">{MARK_LABEL[session.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
