import { useCallback, useEffect, useState } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { compressImageToDataUrl, distanceMetersClient } from "../lib/imageCompress.ts";
import {
  enqueueOfflineAction,
  flushOfflineQueue,
  readOfflineQueue,
  subscribeOfflineQueue,
} from "../lib/offlineQueue.ts";
import { useSchoolScope } from "../lib/school.tsx";

type AttendanceSetting = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  workStartTime: string;
  lateToleranceMin: number;
  workEndTime: string;
  requireLiveness: boolean;
};

type StaffRecord = {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkInDistanceM: number | null;
  checkOutAt: string | null;
  checkOutDistanceM: number | null;
  status: "TEPAT_WAKTU" | "TERLAMBAT" | "DINAS_LUAR" | "IZIN";
  note: string | null;
};

type TodayResponse = {
  setting: AttendanceSetting;
  workDate: string;
  record: StaffRecord | null;
};

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

export function StaffAttendancePage() {
  const { schoolId, school } = useSchoolScope();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isOutsideDuty, setIsOutsideDuty] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [queueCount, setQueueCount] = useState(() => readOfflineQueue().length);
  const [online, setOnline] = useState(() => navigator.onLine);

  const loadToday = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const res = await api<TodayResponse>(`/api/v1/schools/${schoolId}/staff-attendance/today`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiClientError && err.status !== 0) {
        setMessage({ kind: "err", text: err.message });
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  const locateGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("Perangkat tidak mendukung GPS.");
      return;
    }
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? "Izin lokasi GPS belum diaktifkan di perangkat Anda."
            : "Sinyal GPS belum terkunci. Coba pindah ke area terbuka."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  }, []);

  useEffect(() => {
    void loadToday();
    locateGps();
  }, [loadToday, locateGps]);

  useEffect(() => {
    const syncNetwork = () => {
      setOnline(navigator.onLine);
      setQueueCount(readOfflineQueue().length);
    };
    const unsub = subscribeOfflineQueue(() => {
      setQueueCount(readOfflineQueue().length);
      void loadToday();
    });
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);
    return () => {
      unsub();
      window.removeEventListener("online", syncNetwork);
      window.removeEventListener("offline", syncNetwork);
    };
  }, [loadToday]);

  async function handlePhotoCapture(file: File | undefined) {
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 640, 0.72);
      setPhotoDataUrl(compressed);
      setMessage(null);
    } catch (err) {
      setMessage({ kind: "err", text: err instanceof Error ? err.message : "Gagal memproses foto." });
    }
  }

  async function handlePunch(kind: "check-in" | "check-out") {
    if (!schoolId || !coords) {
      setMessage({ kind: "err", text: "Lokasi GPS belum ditemukan. Ketuk tombol Perbarui Lokasi terlebih dahulu." });
      return;
    }
    if (kind === "check-in" && data?.setting.requireLiveness && !photoDataUrl && !isOutsideDuty) {
      setMessage({ kind: "err", text: "Silakan ambil foto selfie kehadiran terlebih dahulu." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const idempotencyKey = `staff-${kind}-${schoolId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const endpoint = `/api/v1/schools/${schoolId}/staff-attendance/${kind}`;
    const payload = {
      latitude: coords.lat,
      longitude: coords.lng,
      accuracyMeters: coords.accuracy,
      photoUrl: photoDataUrl ?? undefined,
      isOutsideDuty,
      note: note.trim() || undefined,
      idempotencyKey,
    };

    try {
      await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
      setMessage({
        kind: "ok",
        text: kind === "check-in" ? "Absen masuk berhasil dicatat. Selamat bertugas!" : "Absen pulang berhasil dicatat. Terima kasih!",
      });
      setPhotoDataUrl(null);
      setNote("");
      await loadToday();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 0) {
        enqueueOfflineAction({
          label: kind === "check-in" ? "Absen Masuk Pegawai" : "Absen Pulang Pegawai",
          endpoint,
          payload,
        });
        setQueueCount(readOfflineQueue().length);
        setMessage({
          kind: "warn",
          text: "Sinyal terputus. Absensi tersimpan di HP dan akan otomatis terkirim saat sinyal kembali.",
        });
      } else {
        setMessage({
          kind: "err",
          text: err instanceof Error ? err.message : "Gagal mencatat presensi.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const distanceM =
    coords && data
      ? distanceMetersClient(data.setting.latitude, data.setting.longitude, coords.lat, coords.lng)
      : null;
  const insideRadius = distanceM !== null && data ? distanceM <= data.setting.radiusMeters : false;
  const checkedIn = Boolean(data?.record?.checkInAt);
  const checkedOut = Boolean(data?.record?.checkOutAt);

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-6">
      {/* Super-App Header Card */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#081236] via-[#0D1B4C] to-[#1D3587] p-6 text-white shadow-xl shadow-[#0D1B4C]/15">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-block rounded-full bg-[#F5C400]/20 px-3 py-1 text-[11px] font-bold tracking-wider text-[#F5C400] uppercase">
              Presensi GPS Harian
            </span>
            <h1 className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">
              "SMK PGRI Pasir Sakti"
            </h1>
            {data && (
              <p className="mt-1 text-xs text-slate-300">
                Jadwal Masuk <strong className="text-white">{data.setting.workStartTime}</strong> • Pulang{" "}
                <strong className="text-white">{data.setting.workEndTime}</strong>
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              online ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-400/20 text-amber-200"
            }`}
          >
            {online ? "● Online" : "● Offline"}
          </span>
        </div>

        {/* Kartu Jam Masuk & Pulang Hari Ini */}
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
          <div>
            <p className="text-[11px] font-medium text-slate-300">Jam Masuk Hari Ini</p>
            <p className="mt-1 text-lg font-extrabold text-[#F5C400]">
              {loading ? "..." : formatTime(data?.record?.checkInAt ?? null)}
            </p>
          </div>
          <div className="border-l border-white/15 pl-4">
            <p className="text-[11px] font-medium text-slate-300">Jam Pulang Hari Ini</p>
            <p className="mt-1 text-lg font-extrabold text-white">
              {loading ? "..." : formatTime(data?.record?.checkOutAt ?? null)}
            </p>
          </div>
        </div>
      </section>

      {queueCount > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
          <span>Ada {queueCount} data absensi menunggu jaringan internet.</span>
          <button
            type="button"
            onClick={() => void flushOfflineQueue()}
            className="rounded-xl bg-[#0D1B4C] px-3 py-1.5 font-bold text-white"
          >
            Kirim Sekarang
          </button>
        </div>
      )}

      {message && (
        <div
          className={`rounded-2xl border px-4 py-3.5 text-sm font-medium ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : message.kind === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Langkah 1: Status Lokasi GPS */}
      <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">Langkah 1 • Lokasi Anda</p>
            <h2 className="mt-0.5 text-base font-extrabold text-[#0D1B4C]">
              {coords
                ? insideRadius
                  ? "Berada di Area Sekolah"
                  : `Luar Radius (${distanceM} m dari sekolah)`
                : "Mencari Titik Lokasi..."}
            </h2>
            {gpsError ? (
              <p className="mt-1 text-xs font-medium text-rose-600">{gpsError}</p>
            ) : coords ? (
              <p className="mt-0.5 text-xs text-slate-500">Akurasi GPS ±{coords.accuracy} meter</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={locateGps}
            className="rounded-2xl bg-slate-100 px-4 py-2.5 text-xs font-extrabold text-[#0D1B4C] transition hover:bg-slate-200"
          >
            Perbarui GPS
          </button>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
          <input
            type="checkbox"
            checked={isOutsideDuty}
            onChange={(e) => setIsOutsideDuty(e.target.checked)}
            className="h-5 w-5 rounded accent-[#0D1B4C]"
          />
          <div>
            <p className="text-sm font-bold text-slate-800">Sedang Tugas Luar / Dinas</p>
            <p className="text-xs text-slate-500">Centang jika Anda berada di luar area sekolah karena tugas resmi.</p>
          </div>
        </label>
      </section>

      {/* Langkah 2: Foto & Tombol Absen Utama */}
      <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-400 uppercase">Langkah 2 • Konfirmasi Kehadiran</p>
        <h2 className="mt-0.5 text-base font-extrabold text-[#0D1B4C]">Foto & Catatan Singkat</h2>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-[#0D1B4C]/30 bg-[#0D1B4C]/5 px-4 py-2.5 text-xs font-extrabold text-[#0D1B4C] transition hover:bg-[#0D1B4C]/10">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>{photoDataUrl ? "Ganti Foto Selfie" : "Ambil Foto Selfie"}</span>
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => void handlePhotoCapture(e.target.files?.[0])}
              />
            </label>
            {photoDataUrl && (
              <img
                src={photoDataUrl}
                alt="Pratinjau selfie"
                className="h-14 w-14 rounded-2xl border border-slate-200 object-cover"
              />
            )}
          </div>

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan tambahan (opsional, misal: Mengawas ujian / Rapat dinas)"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#0D1B4C] focus:bg-white"
          />

          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <button
              type="button"
              disabled={submitting || checkedIn}
              onClick={() => void handlePunch("check-in")}
              className="flex min-h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-[#0D1B4C] to-[#1D3587] px-5 text-sm font-extrabold text-white shadow-lg shadow-[#0D1B4C]/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {checkedIn ? "✓ Sudah Absen Masuk" : submitting ? "Menyimpan..." : "Absen Masuk Sekarang"}
            </button>

            <button
              type="button"
              disabled={submitting || !checkedIn || checkedOut}
              onClick={() => void handlePunch("check-out")}
              className="flex min-h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-[#F5C400] to-amber-400 px-5 text-sm font-extrabold text-[#0D1B4C] shadow-lg shadow-amber-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {checkedOut ? "✓ Sudah Absen Pulang" : submitting ? "Menyimpan..." : "Absen Pulang Sekarang"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
