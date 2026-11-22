import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { compressImageToDataUrl } from "../lib/imageCompress.ts";
import { enqueueOfflineAction, readOfflineQueue, subscribeOfflineQueue } from "../lib/offlineQueue.ts";
import { useSchoolScope } from "../lib/school.tsx";

type AssignmentOption = { id: string; classId?: string; className: string; subjectName: string; periodName: string };
type StudentItem = { id: string; name: string; nis: string | null };
type AttStatus = "HADIR" | "SAKIT" | "IZIN" | "ALPA";
type JournalItem = {
  id: string;
  journalDate: string;
  sessionNo: number;
  topic: string;
  activities: string;
  studentNotes: string | null;
  teachingAssignment: { class: { name: string }; subject: { name: string } };
};

const STATUS_BTNS: Array<{ code: AttStatus; short: string; label: string; active: string }> = [
  { code: "HADIR", short: "H", label: "Hadir", active: "bg-emerald-600 text-white border-emerald-600" },
  { code: "SAKIT", short: "S", label: "Sakit", active: "bg-sky-600 text-white border-sky-600" },
  { code: "IZIN", short: "I", label: "Izin", active: "bg-amber-500 text-white border-amber-500" },
  { code: "ALPA", short: "A", label: "Alpa", active: "bg-rose-600 text-white border-rose-600" },
];

export function TeachingJournalPage() {
  const { schoolId } = useSchoolScope();
  const [activeTab, setActiveTab] = useState<"form" | "history">("form");
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [journals, setJournals] = useState<JournalItem[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [journalDate, setJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessionNo, setSessionNo] = useState(1);
  const [topic, setTopic] = useState("");
  const [activities, setActivities] = useState("");
  const [studentNotes, setStudentNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});
  const [studentQuery, setStudentQuery] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [queueCount, setQueueCount] = useState(() => readOfflineQueue().length);

  const loadData = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [attBoard, teachList, journalRes] = await Promise.all([
        api<{ assignments: AssignmentOption[] }>(`/api/v1/schools/${schoolId}/attendance`).catch(() => ({ assignments: [] as AssignmentOption[] })),
        api<{ items: Array<{ id: string; classId?: string; class?: { id: string } }> }>(`/api/v1/schools/${schoolId}/teaching-assignments?page=1&pageSize=100`).catch(() => ({ items: [] })),
        api<{ journals: JournalItem[] }>(`/api/v1/schools/${schoolId}/journals`),
      ]);
      const classMap = new Map(teachList.items.map((t) => [t.id, t.classId ?? t.class?.id ?? ""]));
      const enriched = attBoard.assignments.map((a) => ({ ...a, classId: classMap.get(a.id) }));
      setAssignments(enriched);
      if (!assignmentId && enriched[0]) setAssignmentId(enriched[0].id);
      setJournals(journalRes.journals);
    } catch (err) {
      if (err instanceof ApiClientError && err.status !== 0) setMessage({ kind: "err", text: err.message });
    }
  }, [schoolId, assignmentId]);

  useEffect(() => {
    void loadData();
    return subscribeOfflineQueue(() => {
      setQueueCount(readOfflineQueue().length);
      void loadData();
    });
  }, [loadData]);

  const selectedAssignment = useMemo(() => assignments.find((a) => a.id === assignmentId) ?? null, [assignments, assignmentId]);

  useEffect(() => {
    if (!schoolId || !assignmentId) {
      setStudents([]);
      setMarks({});
      return;
    }
    let active = true;
    setLoadingRoster(true);
    api<{ summary?: { students?: Array<{ studentId: string; name: string; nis: string | null }> } }>(
      `/api/v1/schools/${schoolId}/attendance?assignmentId=${assignmentId}&page=1&pageSize=1`
    )
      .then((res) => {
        if (!active) return;
        const list = (res.summary?.students ?? []).map((st) => ({ id: st.studentId, name: st.name, nis: st.nis }));
        setStudents(list);
        setMarks(Object.fromEntries(list.map((st) => [st.id, "HADIR" as AttStatus])));
      })
      .catch(() => { if (active) { setStudents([]); setMarks({}); } })
      .finally(() => { if (active) setLoadingRoster(false); });
    return () => { active = false; };
  }, [schoolId, assignmentId]);

  const counts = useMemo(() => {
    const c = { HADIR: 0, SAKIT: 0, IZIN: 0, ALPA: 0 };
    for (const st of students) c[marks[st.id] ?? "HADIR"]++;
    return c;
  }, [students, marks]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return q ? students.filter((s) => s.name.toLowerCase().includes(q) || (s.nis ?? "").toLowerCase().includes(q)) : students;
  }, [students, studentQuery]);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhotoUrl(await compressImageToDataUrl(file, 720, 0.72));
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal memproses foto." });
    }
  }

  async function syncAttendanceToWali() {
    if (!schoolId || !assignmentId || students.length === 0) return false;
    const records = students.map((st) => ({ studentId: st.id, status: marks[st.id] ?? "HADIR" }));
    const board = await api<{ meetings: { items: Array<{ id: string; meetingDate: string; sessionNo: number; status: "DRAFT" | "FINAL" }> } }>(
      `/api/v1/schools/${schoolId}/attendance?assignmentId=${assignmentId}&from=${journalDate}&to=${journalDate}&page=1&pageSize=20`
    );
    let meeting = board.meetings.items.find((m) => m.meetingDate.slice(0, 10) === journalDate && m.sessionNo === sessionNo);
    if (!meeting) {
      const created = await api<{ meeting: { id: string; meetingDate: string; sessionNo: number; status: "DRAFT" | "FINAL" } }>(
        `/api/v1/schools/${schoolId}/attendance/meetings`,
        { method: "POST", body: JSON.stringify({ assignmentId, meetingDate: journalDate, sessionNo, note: `Jurnal: ${topic.trim()}` }) }
      );
      meeting = created.meeting;
    }
    if (meeting.status === "DRAFT") {
      await api(`/api/v1/schools/${schoolId}/attendance/meetings/${meeting.id}`, { method: "PUT", body: JSON.stringify({ records }) });
      await api(`/api/v1/schools/${schoolId}/attendance/meetings/${meeting.id}/finalize`, { method: "POST", body: JSON.stringify({ records }) });
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId || !assignmentId) return;
    setSaving(true);
    setMessage(null);

    const absentees = students
      .filter((s) => (marks[s.id] ?? "HADIR") !== "HADIR")
      .map((s) => `${s.name} (${marks[s.id]})`);
    const combinedNotes = [studentNotes.trim(), absentees.length > 0 ? `Tidak hadir: ${absentees.join(", ")}` : ""]
      .filter(Boolean)
      .join(" | ");

    const endpoint = `/api/v1/schools/${schoolId}/journals`;
    const payload = {
      teachingAssignmentId: assignmentId,
      journalDate,
      sessionNo,
      topic: topic.trim(),
      activities: activities.trim(),
      studentNotes: combinedNotes || null,
      photoUrl,
      idempotencyKey: `journal-${assignmentId}-${journalDate}-${sessionNo}-${Date.now()}`,
    };

    try {
      await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
      let synced = false;
      try { synced = await syncAttendanceToWali(); } catch { synced = false; }
      setMessage({
        kind: "ok",
        text: synced
          ? `Jurnal disimpan & presensi ${students.length} siswa otomatis tersinkron ke Wali Kelas.`
          : "Jurnal mengajar berhasil disimpan.",
      });
      setTopic("");
      setActivities("");
      setStudentNotes("");
      setPhotoUrl(null);
      setMarks(Object.fromEntries(students.map((st) => [st.id, "HADIR" as AttStatus])));
      await loadData();
      setActiveTab("history");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 0) {
        enqueueOfflineAction({ label: `E-Jurnal: ${topic}`, endpoint, payload });
        setQueueCount(readOfflineQueue().length);
        setMessage({ kind: "warn", text: "Sinyal bengkel/kelas terputus. Jurnal disimpan di perangkat & otomatis terkirim saat online." });
      } else {
        setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan jurnal." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <section className="rounded-[28px] bg-gradient-to-br from-[#081236] via-[#0D1B4C] to-[#1D3587] p-6 text-white shadow-xl shadow-[#0D1B4C]/15">
        <span className="inline-block rounded-full bg-[#F5C400]/20 px-3 py-1 text-[11px] font-bold tracking-wider text-[#F5C400] uppercase">
          SOP-02 • KBM & Presensi Terpadu
        </span>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">E-Jurnal & Presensi 1-Ketuk</h1>
        <p className="mt-1 text-xs text-slate-300">
          Semua siswa default Hadir—cukup ketuk S/I/A bagi yang berhalangan. Otomatis tersinkron ke Wali Kelas.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-white/10 p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`rounded-xl py-2.5 text-xs font-extrabold transition ${activeTab === "form" ? "bg-[#F5C400] text-[#0D1B4C]" : "text-white hover:bg-white/10"}`}
          >
            + Isi Jurnal & Absen
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`rounded-xl py-2.5 text-xs font-extrabold transition ${activeTab === "history" ? "bg-[#F5C400] text-[#0D1B4C]" : "text-white hover:bg-white/10"}`}
          >
            Riwayat Mengajar ({journals.length})
          </button>
        </div>
      </section>

      {queueCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          {queueCount} jurnal menunggu koneksi internet untuk sinkronisasi otomatis.
        </div>
      )}

      {message && (
        <div className={`rounded-2xl border px-4 py-3.5 text-sm font-medium ${message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : message.kind === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {message.text}
        </div>
      )}

      {activeTab === "form" ? (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <label className="block text-xs font-bold text-slate-700">1. Pilih Kelas & Mata Pelajaran</label>
            <select
              required
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-[#0D1B4C] focus:bg-white"
            >
              <option value="">-- Pilih Kelas & Mapel --</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>{a.className} — {a.subjectName}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700">2. Tanggal Mengajar</label>
              <input
                type="date"
                required
                value={journalDate}
                onChange={(e) => setJournalDate(e.target.value)}
                className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-[#0D1B4C] focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">3. Jam Pelajaran Ke-</label>
              <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSessionNo(num)}
                    className={`h-9 rounded-xl text-xs font-extrabold transition ${sessionNo === num ? "bg-[#0D1B4C] text-[#F5C400]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">4. Topik / Kompetensi Materi</label>
            <input
              type="text"
              required
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Contoh: Pemeriksaan Sistem Rem Cakram & Tromol"
              className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0D1B4C] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700">5. Ringkasan Kegiatan di Kelas / Bengkel</label>
            <textarea
              required
              rows={3}
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              placeholder="Contoh: Siswa melakukan pembongkaran dan pengukuran ketebalan kampas rem per kelompok..."
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-[#0D1B4C] focus:bg-white"
            />
          </div>

          {/* 6. Presensi Siswa 1-Ketuk (Default Hadir) */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold text-[#0D1B4C]">6. Presensi Siswa 1-Ketuk (Default Hadir)</p>
                <p className="text-[11px] text-slate-500">Cukup ketuk S / I / A untuk siswa yang tidak hadir</p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">H: {counts.HADIR}</span>
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-sky-800">S: {counts.SAKIT}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800">I: {counts.IZIN}</span>
                <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-rose-800">A: {counts.ALPA}</span>
              </div>
            </div>

            {students.length > 6 && (
              <input
                type="text"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Cari cepat nama / NIS siswa..."
                className="mt-3 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#0D1B4C]"
              />
            )}

            <div className="mt-3 max-h-64 divide-y divide-slate-200/70 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {loadingRoster ? (
                <p className="p-4 text-center text-xs text-slate-500">Memuat daftar siswa kelas...</p>
              ) : filteredStudents.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-500">
                  {assignmentId ? "Belum ada siswa aktif pada rombel ini." : "Pilih kelas & mapel terlebih dahulu."}
                </p>
              ) : (
                filteredStudents.map((st, idx) => {
                  const current = marks[st.id] ?? "HADIR";
                  return (
                    <div key={st.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800">
                          {idx + 1}. {st.name}
                        </p>
                        {st.nis && <p className="text-[10px] text-slate-400">NIS: {st.nis}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {STATUS_BTNS.map((b) => (
                          <button
                            key={b.code}
                            type="button"
                            title={b.label}
                            onClick={() => setMarks((prev) => ({ ...prev, [st.id]: b.code }))}
                            className={`h-8 w-8 rounded-lg border text-xs font-extrabold transition ${
                              current === b.code ? b.active : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            {b.short}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-[#0D1B4C] hover:bg-slate-100">
              <span>{photoUrl ? "✓ Foto Dokumentasi Terlampir" : "+ Foto Kegiatan (Opsional)"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void handlePhoto(e.target.files?.[0])}
              />
            </label>

            <button
              type="submit"
              disabled={saving || !assignmentId}
              className="min-h-12 flex-1 rounded-2xl bg-gradient-to-r from-[#0D1B4C] to-[#1D3587] px-6 text-sm font-extrabold text-white shadow-lg shadow-[#0D1B4C]/20 transition hover:brightness-110 disabled:opacity-50 sm:flex-none"
            >
              {saving ? "Menyimpan & Sinkron..." : "Simpan Jurnal & Presensi"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          {journals.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Belum ada catatan jurnal mengajar yang tersimpan.
            </div>
          ) : (
            journals.map((item) => (
              <div key={item.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-[#0D1B4C]/8 px-3 py-1 text-xs font-extrabold text-[#0D1B4C]">
                    {item.teachingAssignment.class.name} • {item.teachingAssignment.subject.name}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {item.journalDate.slice(0, 10)} • Jam Ke-{item.sessionNo}
                  </span>
                </div>
                <h3 className="mt-2.5 text-base font-extrabold text-slate-900">{item.topic}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.activities}</p>
                {item.studentNotes && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                    {item.studentNotes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
