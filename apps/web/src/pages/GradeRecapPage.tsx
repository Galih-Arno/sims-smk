import { useEffect, useMemo, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Status = "BELUM_DIKONFIGURASI" | "BELUM_LENGKAP" | "SIAP" | "BELUM_DITUGASKAN";
type Part = { label: string; value: number | null; weight: number; contribution: number | null; submitted: boolean; note: string };
type Cell = { subjectId: string; status: Status; score: number | null; formula: string; teacherName: string | null; parts: Part[] };
type Subject = { subjectId: string; code: string; name: string; assignmentId: string | null; teacherName: string | null; configured: boolean };
type Student = { studentId: string; name: string; nis: string | null; siap: number; belumLengkap: number; belumDikonfigurasi: number; cells: Cell[] };
type Recap = {
  homeroomId: string;
  className: string;
  periodName: string;
  policyLabel: string | null;
  subjects: Subject[];
  students: Student[];
  summary: { subjects: number; siap: number; belumLengkap: number; belumDikonfigurasi: number; belumDitugaskan: number };
};
type Payload = { homerooms: Array<{ id: string; className: string; periodName: string }>; recap: Recap | null };

const STATUS_LABEL: Record<Status, string> = {
  BELUM_DIKONFIGURASI: "Belum dikonfigurasi",
  BELUM_LENGKAP: "Belum lengkap",
  SIAP: "Siap",
  BELUM_DITUGASKAN: "Belum ditugaskan",
};

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function GradeRecapPage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<{ studentId: string; subjectId: string } | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    const suffix = homeroomId ? `?homeroomId=${encodeURIComponent(homeroomId)}` : "";
    api<Payload>(`/api/v1/schools/${schoolId}/homeroom-grade-recap${suffix}`)
      .then((result) => {
        setPayload(result);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Rekap nilai akhir gagal dimuat."));
  }, [schoolId, homeroomId]);

  const recap = payload?.recap ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = recap?.students ?? [];
    if (!needle) return rows;
    return rows.filter((item) => item.name.toLowerCase().includes(needle) || (item.nis ?? "").toLowerCase().includes(needle));
  }, [recap, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const openStudent = recap?.students.find((item) => item.studentId === selected?.studentId) ?? null;
  const openCell = openStudent?.cells.find((item) => item.subjectId === selected?.subjectId) ?? null;
  const openSubject = recap?.subjects.find((item) => item.subjectId === selected?.subjectId) ?? null;

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Rekap Nilai Akhir</h1>
        <p className="text-sm text-slate-500">Rekap resmi kelas binaan pada semester aktif. Nilai mentah guru tidak dapat diubah dari halaman ini.</p>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={homeroomId || recap?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setPage(1); setSelected(null); }}>
          {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
          {payload?.homerooms.map((item) => (
            <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>
          ))}
        </select>
        <input className={`${inputClass} w-56`} value={query} placeholder="Cari siswa" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
      </div>
      {recap ? (
        <p className="text-sm text-slate-600">
          {recap.summary.subjects} mapel · {recap.summary.siap} siap · {recap.summary.belumLengkap} belum lengkap
          {recap.summary.belumDikonfigurasi > 0 ? ` · ${recap.summary.belumDikonfigurasi} belum dikonfigurasi` : ""}
          {recap.summary.belumDitugaskan > 0 ? ` · ${recap.summary.belumDitugaskan} belum ditugaskan` : ""}
        </p>
      ) : null}
      {recap?.policyLabel ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Penanda {recap.policyLabel}. Konfigurasi simulasi pada lingkungan development.</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Siswa</th>
              {recap?.subjects.map((subject) => (
                <th key={subject.subjectId} className="min-w-36 px-3 py-2 font-medium normal-case tracking-normal">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{subject.name}</span>
                  <span className="block text-[11px] font-normal text-slate-400">{subject.teacherName ?? "Belum ditugaskan"}</span>
                </th>
              ))}
              <th className="px-3 py-2">Siap</th>
              <th className="px-3 py-2">Belum lengkap</th>
            </tr>
          </thead>
          <tbody>
            {!recap ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={3}>Belum ada kelas binaan pada semester aktif.</td></tr>
            ) : visible.length === 0 ? (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={recap.subjects.length + 3}>Tidak ada siswa.</td></tr>
            ) : visible.map((student) => (
              <tr key={student.studentId} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 border-t border-slate-100 bg-white px-3 py-2">{student.name}{student.nis ? ` · ${student.nis}` : ""}</td>
                {student.cells.map((cell) => {
                  const active = selected?.studentId === student.studentId && selected.subjectId === cell.subjectId;
                  return (
                    <td key={cell.subjectId} className="border-t border-slate-100 px-3 py-2">
                      <button
                        type="button"
                        className={`rounded-md px-1.5 py-1 text-left text-xs ${active ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                        onClick={() => setSelected(active ? null : { studentId: student.studentId, subjectId: cell.subjectId })}
                      >
                        {cell.status === "SIAP" && cell.score !== null ? cell.score : cell.status === "BELUM_DITUGASKAN" ? "—" : STATUS_LABEL[cell.status]}
                      </button>
                    </td>
                  );
                })}
                <td className="border-t border-slate-100 px-3 py-2">{student.siap}</td>
                <td className="border-t border-slate-100 px-3 py-2">{student.belumLengkap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openStudent && openCell && openSubject ? (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{openStudent.name} · {openSubject.name}</p>
          <p className="text-xs text-slate-500">Guru pengampu: {openCell.teacherName ?? "Belum ada"} · {STATUS_LABEL[openCell.status]}{openCell.score === null ? "" : ` · ${openCell.score}`}</p>
          <p className="mt-1">{openCell.formula}</p>
          {openCell.parts.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-xs leading-5">
              {openCell.parts.map((part) => (
                <li key={part.label}>{part.label}: {part.value === null ? "kosong" : part.value} × {part.weight}% {part.submitted ? "(diterima)" : "(belum resmi)"} — {part.note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{filtered.length} siswa</span>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-lg border border-slate-300 px-2" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
          <span>{safePage}/{pages}</span>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
        </div>
      </div>
    </section>
  );
}
