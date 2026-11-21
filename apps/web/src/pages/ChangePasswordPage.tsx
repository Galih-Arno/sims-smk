import { useState, type FormEvent } from "react";
import { ApiClientError, api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import type { AuthUserDto } from "@sims/shared";

export function ChangePasswordPage() {
  const { user, logout, replaceUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
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
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Kata sandi gagal diganti.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold tracking-[0.16em] text-teal-800">SIMS SMK</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Ganti kata sandi</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {user?.email} wajib mengganti kata sandi awal sebelum memakai sistem.
        </p>
        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-sm font-medium text-slate-700">
            Kata sandi saat ini
            <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Kata sandi baru
            <input type="password" autoComplete="new-password" required minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Ulangi kata sandi baru
            <input type="password" autoComplete="new-password" required minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
          </label>
          {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70">
            {submitting ? "Menyimpan..." : "Simpan kata sandi"}
          </button>
        </form>
        <button type="button" className="mt-4 text-sm font-medium text-slate-500" onClick={() => void logout()}>Keluar</button>
      </div>
    </main>
  );
}
