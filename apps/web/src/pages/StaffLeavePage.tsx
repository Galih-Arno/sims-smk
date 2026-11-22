import { useCallback, useEffect, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type LeaveItem = {
  id: string;
  leaveType: "CUTI" | "IZIN" | "SAKIT" | "DINAS_LUAR_SPD";
  startDate: string;
  endDate: string;
  reason: string;
  status: "MENUNGGU" | "DISETUJUI" | "DITOLAK";
  reviewNote: string | null;
  user: { id: string; name: string; email: string };
  reviewedBy: { id: string; name: string } | null;
};

type LeaveListResponse = {
  requests: LeaveItem[];
  canReviewAll: boolean;
};

const LEAVE_CARDS: Array<{
  type: LeaveItem["leaveType"];
  label: string;
  desc: string;
  badgeColor: string;
}> = [
  { type: "IZIN", label: "Izin Pribadi", desc: "Keperluan keluarga / mendesak", badgeColor: "bg-blue-50 text-blue-700 border-blue-200" },
  { type: "SAKIT", label: "Sakit", desc: "Istirahat karena kondisi kesehatan", badgeColor: "bg-rose-50 text-rose-700 border-rose-200" },
  { type: "CUTI", label: "Cuti Tahunan", desc: "Cuti resmi pegawai / guru", badgeColor: "bg-purple-50 text-purple-700 border-purple-200" },
  { type: "DINAS_LUAR_SPD", label: "Tugas Luar / SPD", desc: "Rapat dinas, MGMP, atau diklat", badgeColor: "bg-amber-50 text-amber-800 border-amber-200" },
];

export function StaffLeavePage() {
  const { schoolId, school } = useSchoolScope();
  const [requests, setRequests] = useState<LeaveItem[]>([]);
  const [canReviewAll, setCanReviewAll] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveItem["leaveType"]>("IZIN");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadLeaves = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await api<LeaveListResponse>(`/api/v1/schools/${schoolId}/leave-requests`);
      setRequests(res.requests);
      setCanReviewAll(res.canReviewAll);
    } catch (err) {
      if (err instanceof ApiClientError && err.status !== 0) {
        setMessage({ kind: "err", text: err.message });
      }
    }
  }, [schoolId]);

  useEffect(() => {
    void loadLeaves();
  }, [loadLeaves]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await api(`/api/v1/schools/${schoolId}/leave-requests`, {
        method: "POST",
        body: JSON.stringify({ leaveType, startDate, endDate, reason }),
      });
      setReason("");
      setMessage({ kind: "ok", text: "Pengajuan berhasil dikirim ke pimpinan sekolah." });
      await loadLeaves();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal mengirim pengajuan." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(id: string, status: "DISETUJUI" | "DITOLAK") {
    if (!schoolId) return;
    try {
      await api(`/api/v1/schools/${schoolId}/leave-requests/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setMessage({ kind: "ok", text: `Status pengajuan diperbarui menjadi ${status}.` });
      await loadLeaves();
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal memproses persetujuan." });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-6">
      <section className="rounded-[28px] bg-gradient-to-br from-[#081236] via-[#0D1B4C] to-[#1D3587] p-6 text-white shadow-xl shadow-[#0D1B4C]/15">
        <span className="inline-block rounded-full bg-[#F5C400]/20 px-3 py-1 text-[11px] font-bold tracking-wider text-[#F5C400] uppercase">
          Layanan Kepegawaian
        </span>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">Pengajuan Izin, Cuti & SPD</h1>
        <p className="mt-1 text-xs text-slate-300">"SMK PGRI Pasir Sakti"</p>
      </section>

      {message && (
        <div
          className={`rounded-2xl border px-4 py-3.5 text-sm font-medium ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-4 rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <label className="block text-xs font-bold text-slate-700">1. Pilih Jenis Pengajuan</label>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {LEAVE_CARDS.map((card) => {
              const selected = leaveType === card.type;
              return (
                <button
                  key={card.type}
                  type="button"
                  onClick={() => setLeaveType(card.type)}
                  className={`rounded-2xl border p-3.5 text-left transition ${
                    selected
                      ? "border-[#0D1B4C] bg-[#0D1B4C]/5 ring-2 ring-[#0D1B4C]/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p className="text-sm font-extrabold text-[#0D1B4C]">{card.label}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{card.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700">2. Tanggal Mulai</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#0D1B4C] focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700">3. Tanggal Selesai</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#0D1B4C] focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700">4. Keterangan / Alasan</label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tuliskan keterangan singkat pengajuan Anda..."
            className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-[#0D1B4C] focus:bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#0D1B4C] to-[#1D3587] px-5 text-sm font-extrabold text-white shadow-lg shadow-[#0D1B4C]/20 transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? "Mengirim Pengajuan..." : "Kirim Pengajuan Sekarang"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-extrabold text-[#0D1B4C]">Riwayat Pengajuan ({requests.length})</h2>
        {requests.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">
            Belum ada riwayat pengajuan izin, cuti, atau tugas luar.
          </div>
        ) : (
          requests.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-extrabold text-[#0D1B4C]">{item.user.name}</span>
                  <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                    {item.leaveType.replace("_", " ")}
                  </span>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                    item.status === "DISETUJUI"
                      ? "bg-emerald-100 text-emerald-800"
                      : item.status === "DITOLAK"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-slate-500">
                Periode: {item.startDate.slice(0, 10)} s/d {item.endDate.slice(0, 10)}
              </p>
              <p className="mt-2 text-sm text-slate-700">{item.reason}</p>

              {canReviewAll && item.status === "MENUNGGU" && (
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => void handleReview(item.id, "DISETUJUI")}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700"
                  >
                    Setujui
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReview(item.id, "DITOLAK")}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-extrabold text-white hover:bg-rose-700"
                  >
                    Tolak
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
