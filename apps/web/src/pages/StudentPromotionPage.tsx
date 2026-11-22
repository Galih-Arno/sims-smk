import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppPageShell } from "../components/shell/AppPageShell.tsx";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type ClassItem = { id: string; name: string; gradeLevel: number; academicYearName?: string; concentrationId?: string | null; concentrationName?: string | null };
type StudentRow = { id: string; name: string; nisn: string; nis: string | null; gender: string; classId: string | null; concentrationId?: string | null; isActive?: boolean };

export function StudentPromotionPage() {
  const { schoolId } = useSchoolScope();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sourceClassId, setSourceClassId] = useState("");
  const [mode, setMode] = useState<"PROMOTE" | "GRADUATE">("PROMOTE");
  const [targetClassId, setTargetClassId] = useState("");
  const [gradYear, setGradYear] = useState(() => String(new Date().getFullYear()));
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadClasses = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await api<{ items: ClassItem[] }>(`/api/v1/schools/${schoolId}/classes?page=1&pageSize=50`);
      setClasses(res.items);
      if (!sourceClassId && res.items[0]) setSourceClassId(res.items[0].id);
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof ApiClientError ? err.message : "Daftar kelas gagal dimuat." });
    }
  }, [schoolId, sourceClassId]);

  useEffect(() => { void loadClasses(); }, [loadClasses]);

  const sourceClass = useMemo(() => classes.find((c) => c.id === sourceClassId) ?? null, [classes, sourceClassId]);
  const targetClass = useMemo(() => classes.find((c) => c.id === targetClassId) ?? null, [classes, targetClassId]);

  useEffect(() => {
    if (sourceClass && sourceClass.gradeLevel >= 12) setMode("GRADUATE");
    else setMode("PROMOTE");
  }, [sourceClass]);

  useEffect(() => {
    if (!schoolId || !sourceClassId) { setStudents([]); setSelectedIds(new Set()); return; }
    let active = true;
    setLoadingStudents(true);
    api<{ items: StudentRow[] }>(`/api/v1/schools/${schoolId}/students?classId=${sourceClassId}&page=1&pageSize=50`)
      .then((res) => {
        if (!active) return;
        setStudents(res.items);
        setSelectedIds(new Set(res.items.map((s) => s.id)));
      })
      .catch(() => { if (active) { setStudents([]); setSelectedIds(new Set()); } })
      .finally(() => { if (active) setLoadingStudents(false); });
    return () => { active = false; };
  }, [schoolId, sourceClassId]);

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runRollover() {
    if (!schoolId || !sourceClass || selectedIds.size === 0) return;
    if (mode === "PROMOTE" && (!targetClassId || targetClassId === sourceClassId)) {
      setNotice({ kind: "err", text: "Pilih rombel tujuan yang berbeda dari kelas asal." });
      return;
    }
    const list = students.filter((s) => selectedIds.has(s.id));
    setProcessing(true);
    setNotice(null);
    setProgress({ done: 0, total: list.length });
    let success = 0;

    for (const st of list) {
      try {
        const body =
          mode === "PROMOTE"
            ? {
                name: st.name,
                nisn: st.nisn,
                nis: st.nis,
                gender: st.gender,
                classId: targetClassId,
                concentrationId: targetClass?.concentrationId ?? st.concentrationId ?? null,
                isActive: true,
              }
            : {
                name: st.name,
                nisn: st.nisn,
                nis: st.nis,
                gender: st.gender,
                classId: null,
                concentrationId: st.concentrationId ?? sourceClass.concentrationId ?? null,
                isActive: false,
              };
        await api(`/api/v1/schools/${schoolId}/students/${st.id}`, { method: "PATCH", body: JSON.stringify(body) });
        success++;
      } catch {
        // lanjutkan siswa berikutnya
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setProcessing(false);
    setNotice({
      kind: success > 0 ? "ok" : "err",
      text:
        mode === "PROMOTE"
          ? `${success} dari ${list.length} siswa berhasil dinaikkan dari ${sourceClass.name} ke ${targetClass?.name ?? "rombel baru"}.`
          : `${success} dari ${list.length} siswa ${sourceClass.name} resmi diluluskan menjadi Alumni Angkatan ${gradYear}.`,
    });
    setSourceClassId((prev) => prev);
    const refreshed = await api<{ items: StudentRow[] }>(`/api/v1/schools/${schoolId}/students?classId=${sourceClassId}&page=1&pageSize=50`).catch(() => ({ items: [] }));
    setStudents(refreshed.items);
    setSelectedIds(new Set(refreshed.items.map((s) => s.id)));
  }

  return (
    <AppPageShell
      title="Wizard Kenaikan Kelas & Kelulusan"
      subtitle="SOP-01 • Transisi rombel lintas tahun ajaran & kelulusan kelas XII menjadi Alumni."
      rightSlot={
        <Link to="/vokasi/bkk" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-[#0D1B4C] hover:bg-slate-50">
          Direktori Alumni →
        </Link>
      }
    >
      {notice && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-4 rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-xs sm:grid-cols-3">
        <div>
          <label className="block text-xs font-bold text-slate-700">1. Kelas / Rombel Asal</label>
          <select
            value={sourceClassId}
            onChange={(e) => setSourceClassId(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900"
          >
            <option value="">-- Pilih Rombel Asal --</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name} (Tingkat {c.gradeLevel})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700">2. Jenis Transisi</label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("PROMOTE")}
              className={`h-9 rounded-lg text-xs font-extrabold transition ${mode === "PROMOTE" ? "bg-[#0D1B4C] text-white" : "text-slate-600"}`}
            >
              Naik Kelas
            </button>
            <button
              type="button"
              onClick={() => setMode("GRADUATE")}
              className={`h-9 rounded-lg text-xs font-extrabold transition ${mode === "GRADUATE" ? "bg-emerald-700 text-white" : "text-slate-600"}`}
            >
              Lulus (Alumni)
            </button>
          </div>
        </div>

        <div>
          {mode === "PROMOTE" ? (
            <>
              <label className="block text-xs font-bold text-slate-700">3. Rombel Tujuan Baru</label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900"
              >
                <option value="">-- Pilih Rombel Tujuan --</option>
                {classes.filter((c) => c.id !== sourceClassId).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} (Tingkat {c.gradeLevel})</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="block text-xs font-bold text-slate-700">3. Tahun Angkatan Lulus</label>
              <input
                type="number"
                value={gradYear}
                onChange={(e) => setGradYear(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900"
              />
            </>
          )}
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <h2 className="text-sm font-extrabold text-[#0D1B4C]">
              Daftar Siswa {sourceClass ? sourceClass.name : ""} ({selectedIds.size}/{students.length} terpilih)
            </h2>
            <p className="text-xs text-slate-500">Hapus centang hanya untuk siswa yang tinggal kelas atau mutasi keluar.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set(students.map((s) => s.id)))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
              Pilih Semua
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
              Kosongkan
            </button>
          </div>
        </div>

        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200">
          {loadingStudents ? (
            <p className="p-6 text-center text-xs text-slate-500">Memuat siswa rombel...</p>
          ) : students.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">Tidak ada siswa aktif pada kelas asal ini.</p>
          ) : (
            students.map((st, idx) => (
              <label key={st.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(st.id)}
                    onChange={() => toggleStudent(st.id)}
                    className="h-4 w-4 rounded border-slate-300 text-[#0D1B4C]"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{idx + 1}. {st.name}</p>
                    <p className="text-[11px] text-slate-500">NISN: {st.nisn} {st.nis ? `• NIS: ${st.nis}` : ""}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${selectedIds.has(st.id) ? (mode === "PROMOTE" ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800") : "bg-slate-100 text-slate-500"}`}>
                  {selectedIds.has(st.id) ? (mode === "PROMOTE" ? "Naik Kelas" : "Lulus") : "Ditahan"}
                </span>
              </label>
            ))
          )}
        </div>

        {processing && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
              <span>Memproses transisi data siswa...</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-[#0D1B4C] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={processing || selectedIds.size === 0 || (mode === "PROMOTE" && !targetClassId)}
            onClick={() => void runRollover()}
            className="min-h-11 rounded-2xl bg-[#0D1B4C] px-6 text-xs font-extrabold text-white shadow-md hover:bg-[#162B75] disabled:opacity-50"
          >
            {processing
              ? "Sedang Memproses..."
              : mode === "PROMOTE"
                ? `Proses Kenaikan ${selectedIds.size} Siswa →`
                : `Luluskan ${selectedIds.size} Siswa ke Alumni →`}
          </button>
        </div>
      </div>
    </AppPageShell>
  );
}
