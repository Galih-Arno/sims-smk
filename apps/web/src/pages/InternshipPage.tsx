import { useCallback, useEffect, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type PlacementItem = {
  id: string;
  studentId: string;
  companyName: string;
  companyAddress: string | null;
  supervisorName: string | null;
  startDate: string;
  endDate: string;
  status: "AKTIF" | "SELESAI" | "DIBATALKAN";
  student: { id: string; name: string; nisn: string; class: { name: string } | null };
};

type InternshipLogItem = {
  id: string;
  placementId: string;
  logDate: string;
  activity: string;
  locationNote: string | null;
  status: "MENUNGGU" | "DISETUJUI" | "REVISI";
  placement: { id: string; companyName: string };
  student: { id: string; name: string; class: { name: string } | null };
  verifiedBy: { id: string; name: string } | null;
};

export function InternshipPage() {
  const { schoolId, school } = useSchoolScope();
  const [placements, setPlacements] = useState<PlacementItem[]>([]);
  const [logs, setLogs] = useState<InternshipLogItem[]>([]);
  const [canManage, setCanManage] = useState(false);

  // Form Penempatan PKL
  const [studentId, setStudentId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Form Jurnal Harian PKL
  const [placementId, setPlacementId] = useState("");
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activity, setActivity] = useState("");
  const [locationNote, setLocationNote] = useState("");

  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [pRes, lRes] = await Promise.all([
        api<{ placements: PlacementItem[]; canManageAll: boolean }>(`/api/v1/schools/${schoolId}/internship-placements`),
        api<{ logs: InternshipLogItem[]; canVerify: boolean }>(`/api/v1/schools/${schoolId}/internship-logs`),
      ]);
      setPlacements(pRes.placements);
      setCanManage(pRes.canManageAll || lRes.canVerify);
      setLogs(lRes.logs);
      const firstPlacement = pRes.placements[0];
      if (firstPlacement && !placementId) {
        setPlacementId(firstPlacement.id);
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status !== 0) {
        setMessage({ kind: "err", text: err.message });
      }
    }
  }, [schoolId, placementId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreatePlacement(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    setMessage(null);
    try {
      await api(`/api/v1/schools/${schoolId}/internship-placements`, {
        method: "POST",
        body: JSON.stringify({
          studentId: studentId.trim(),
          companyName,
          supervisorName: supervisorName.trim() || null,
          startDate,
          endDate,
        }),
      });
      setCompanyName("");
      setSupervisorName("");
      setMessage({ kind: "ok", text: "Penempatan PKL siswa berhasil disimpan." });
      await loadData();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan penempatan PKL." });
    }
  }

  async function handleSaveLog(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId || !placementId) return;
    setMessage(null);
    try {
      await api(`/api/v1/schools/${schoolId}/internship-logs`, {
        method: "POST",
        body: JSON.stringify({
          placementId,
          logDate,
          activity,
          locationNote: locationNote.trim() || null,
        }),
      });
      setActivity("");
      setLocationNote("");
      setMessage({ kind: "ok", text: "Jurnal harian PKL berhasil dicatat." });
      await loadData();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal menyimpan jurnal PKL." });
    }
  }

  async function handleVerifyLog(logId: string, status: "DISETUJUI" | "REVISI") {
    if (!schoolId) return;
    try {
      await api(`/api/v1/schools/${schoolId}/internship-logs/${logId}/verify`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await loadData();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal memverifikasi jurnal PKL." });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl bg-[#0D1B4C] p-5 text-white shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-[#F5C400]">Vokasi & Dunia Industri (DUDI)</p>
        <h1 className="mt-1 text-lg font-bold">Prakerin / PKL — Penempatan & Jurnal Harian</h1>
        <p className="mt-1 text-xs text-slate-300">"SMK PGRI Pasir Sakti"</p>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {message.text}
        </div>
      )}

      {canManage && (
        <form onSubmit={(e) => void handleCreatePlacement(e)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Daftarkan Penempatan PKL Baru</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ID Siswa</label>
              <input
                type="text"
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="ID siswa..."
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Mitra / DUDI</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Contoh: Bengkel Honda / CV Netindo"
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pembimbing Lapangan</label>
              <input
                type="text"
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                placeholder="Nama pembimbing..."
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Mulai</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Selesai</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            className="h-10 rounded-xl bg-[#0D1B4C] px-5 text-sm font-semibold text-white hover:bg-[#162466]"
          >
            Simpan Penempatan PKL
          </button>
        </form>
      )}

      <form onSubmit={(e) => void handleSaveLog(e)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Catat Jurnal Harian PKL</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Penempatan PKL</label>
            <select
              value={placementId}
              onChange={(e) => setPlacementId(e.target.value)}
              required
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Pilih penempatan...</option>
              {placements.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.student.name} — {p.companyName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Kegiatan</label>
            <input
              type="date"
              required
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Lokasi / Divisi</label>
            <input
              type="text"
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              placeholder="Contoh: Divisi Jaringan / Servis Berkala"
              className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Uraian Kegiatan Praktik</label>
          <textarea
            rows={2}
            required
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            placeholder="Tuliskan pekerjaan atau praktik yang dilakukan hari ini..."
            className="w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-xl bg-[#0D1B4C] px-5 text-sm font-semibold text-white hover:bg-[#162466]"
        >
          Simpan Jurnal PKL
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Jurnal Harian PKL ({logs.length})</h2>
        {logs.length === 0 ? (
          <p className="text-xs text-slate-500">Belum ada jurnal harian PKL yang tercatat.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((item) => (
              <div key={item.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-[#0D1B4C]">{item.student.name}</span>
                    <span className="text-slate-500">
                      • {item.placement.companyName} • {new Date(item.logDate).toLocaleDateString("id-ID")}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{item.activity}</p>
                </div>
                {canManage && item.status !== "DISETUJUI" && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleVerifyLog(item.id, "DISETUJUI")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleVerifyLog(item.id, "REVISI")}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                    >
                      Revisi
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
