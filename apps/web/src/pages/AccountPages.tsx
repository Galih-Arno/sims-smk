import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { AuthUserDto } from "@sims/shared";
import { ApiClientError, api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { flushOfflineQueue, readOfflineQueue, subscribeOfflineQueue } from "../lib/offlineQueue.ts";
import { useSchoolScope } from "../lib/school.tsx";

export function ProfilePage() {
  const { user, logout } = useAuth();
  const { schoolId, school } = useSchoolScope();
  const [queueCount, setQueueCount] = useState(() => readOfflineQueue().length);
  const [flushing, setFlushing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setQueueCount(readOfflineQueue().length);
    return subscribeOfflineQueue(() => {
      setQueueCount(readOfflineQueue().length);
    });
  }, []);

  if (!user) return null;

  const roles = user.assignments.filter(
    (assignment) => assignment.roleCode === "SYSTEM_OWNER" || assignment.schoolId === schoolId
  );

  async function handleFlush() {
    setFlushing(true);
    setSyncNotice(null);
    try {
      await flushOfflineQueue();
      const left = readOfflineQueue().length;
      setQueueCount(left);
      setSyncNotice(
        left === 0
          ? "Semua data luring berhasil disinkronkan ke server."
          : `${left} data masih menunggu koneksi jaringan yang stabil.`
      );
    } finally {
      setFlushing(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 pb-6">
      {/* Kartu Identitas Super-App */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#081236] via-[#0D1B4C] to-[#1D3587] p-6 text-white shadow-xl shadow-[#0D1B4C]/15">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[#F5C400] bg-white/10 text-2xl font-black text-[#F5C400]">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-full bg-[#F5C400]/20 px-3 py-0.5 text-[11px] font-bold tracking-wider text-[#F5C400] uppercase">
              Akun Pengguna Aktif
            </span>
            <h1 className="mt-1 truncate text-xl font-extrabold tracking-tight">{user.name}</h1>
            <p className="truncate text-xs text-slate-300">{user.email}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
          <p className="text-[11px] font-medium text-slate-300">Unit Pendidikan</p>
          <p className="mt-0.5 text-sm font-extrabold text-white">"SMK PGRI Pasir Sakti"</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {roles.length > 0 ? (
              roles.map((role) => (
                <span
                  key={`${role.schoolId ?? "sys"}-${role.roleCode}`}
                  className="rounded-full bg-white/15 px-3 py-0.5 text-[11px] font-bold text-[#F5C400]"
                >
                  {role.roleName}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-300">-</span>
            )}
          </div>
        </div>
      </section>

      {/* Panel Sinkronisasi Luring */}
      <section className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-[#0D1B4C]">Sinkronisasi Data Luring (Offline Queue)</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {queueCount > 0
                ? `${queueCount} catatan menunggu terkirim ke server.`
                : "Semua data tersinkronisasi penuh dengan server sekolah."}
            </p>
          </div>
          <button
            type="button"
            disabled={flushing || queueCount === 0}
            onClick={() => void handleFlush()}
            className="rounded-xl bg-[#0D1B4C] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#1D3587] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {flushing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}
          </button>
        </div>
        {syncNotice ? (
          <p className="mt-3 rounded-2xl bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
            {syncNotice}
          </p>
        ) : null}
      </section>

      {/* Menu Keamanan & Sesi */}
      <section className="space-y-3 rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-extrabold text-[#0D1B4C]">Keamanan & Sesi</h2>
        <Link
          to="/akun/sandi"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100"
        >
          <span>Ubah Kata Sandi</span>
          <span className="text-slate-400">›</span>
        </Link>

        <button
          type="button"
          disabled={loggingOut}
          onClick={() => {
            setLoggingOut(true);
            void logout().finally(() => setLoggingOut(false));
          }}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
        >
          {loggingOut ? "Keluar dari sesi..." : "Keluar dari Aplikasi"}
        </button>
      </section>
    </main>
  );
}

export function AccountPasswordPage() {
  const { replaceUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword.length < 10) {
      setError("Kata sandi baru minimal 10 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Ulangan kata sandi tidak sama.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await api<{ user: AuthUserDto }>("/api/v1/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      replaceUser(data.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Kata sandi berhasil diperbarui.");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Kata sandi gagal diganti.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 pb-6">
      <section className="rounded-[28px] bg-gradient-to-br from-[#081236] via-[#0D1B4C] to-[#1D3587] p-6 text-white shadow-xl shadow-[#0D1B4C]/15">
        <span className="inline-block rounded-full bg-[#F5C400]/20 px-3 py-0.5 text-[11px] font-bold tracking-wider text-[#F5C400] uppercase">
          Keamanan Akun
        </span>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight">Ubah Kata Sandi</h1>
        <p className="mt-1 text-xs text-slate-300">Gunakan kata sandi baru minimal 10 karakter demi keamanan akun.</p>
      </section>

      <form
        className="space-y-4 rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="block text-xs font-bold text-slate-700">
          Kata sandi saat ini
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none focus:border-[#0D1B4C] focus:bg-white"
          />
        </label>
        <label className="block text-xs font-bold text-slate-700">
          Kata sandi baru
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none focus:border-[#0D1B4C] focus:bg-white"
          />
        </label>
        <label className="block text-xs font-bold text-slate-700">
          Ulangi kata sandi baru
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none focus:border-[#0D1B4C] focus:bg-white"
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
            {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#081236] via-[#0D1B4C] to-[#1D3587] px-5 text-sm font-extrabold text-white shadow-lg shadow-[#0D1B4C]/20 transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? "Menyimpan..." : "Simpan Kata Sandi Baru"}
        </button>
      </form>
    </main>
  );
}
