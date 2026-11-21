import { useState, type FormEvent } from "react";
import type { AuthUserDto } from "@sims/shared";
import { ApiClientError, api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useSchoolScope } from "../lib/school.tsx";

export function ProfilePage() {
  const { user } = useAuth();
  const { schoolId, school } = useSchoolScope();
  if (!user) return null;
  const roles = user.assignments.filter((assignment) => assignment.roleCode === "SYSTEM_OWNER" || assignment.schoolId === schoolId);
  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Profil Saya</h1>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        <dl className="space-y-3">
          <div>
            <dt className="text-slate-500">Nama</dt>
            <dd className="font-medium text-slate-900">{user.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email masuk</dt>
            <dd className="font-medium text-slate-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sekolah</dt>
            <dd className="font-medium text-slate-900">{school?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Peran</dt>
            <dd className="font-medium text-slate-900">{roles.map((role) => role.roleName).join(", ") || "-"}</dd>
          </div>
        </dl>
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
      setMessage("Kata sandi diperbarui.");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Kata sandi gagal diganti.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold">Ubah Password</h1>
      <p className="mt-1 text-sm text-slate-500">Gunakan kata sandi baru minimal 10 karakter.</p>
      <form className="mt-5 space-y-4 rounded-2xl border border-slate-200 bg-white p-5" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700">Kata sandi saat ini
          <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Kata sandi baru
          <input type="password" required minLength={10} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Ulangi kata sandi baru
          <input type="password" required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        </label>
        {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{message}</p> : null}
        <button type="submit" disabled={submitting} className="rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {submitting ? "Menyimpan..." : "Simpan kata sandi"}
        </button>
      </form>
    </main>
  );
}
