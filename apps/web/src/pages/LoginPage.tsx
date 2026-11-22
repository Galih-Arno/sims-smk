import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiClientError } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

const SCHOOL_NAME = "SMK PGRI Pasir Sakti";
const LOGO_SRC = "/logo-smk-pgri-pasir-sakti.jpg";

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 0) {
        setError("Koneksi ke server terputus. Periksa jaringan Anda lalu coba lagi.");
      } else {
        setError(err instanceof Error ? err.message : "Email atau kata sandi tidak sesuai.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#07102E] via-[#0D1B4C] to-[#13245E] px-4 py-8 text-white flex flex-col justify-center">
      <div className="mx-auto w-full max-w-md">
        {/* Brand Header Lebih Besar & Menyatu dengan Latar */}
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-40 w-40 items-center justify-center overflow-hidden">
            <img
              src={LOGO_SRC}
              alt={SCHOOL_NAME}
              className="h-full w-full scale-[2.05] object-contain mix-blend-lighten select-none"
            />
          </div>
          <span className="mt-2 inline-block rounded-full bg-[#F5C400]/15 px-3.5 py-1 text-[11px] font-bold tracking-[0.18em] text-[#F5C400] uppercase">
            Smart Digital School
          </span>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            SAKTI-Ku
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-300">{SCHOOL_NAME}</p>
        </div>

        {/* Form Card */}
        <div className="rounded-[28px] bg-white p-6 text-slate-900 shadow-2xl shadow-black/30 sm:p-7">
          <h2 className="text-lg font-extrabold text-[#0D1B4C]">Selamat Datang</h2>
          <p className="mt-1 text-xs text-slate-500">
            Masuk menggunakan akun guru, staf, atau wali murid yang terdaftar di sekolah.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="login-id" className="block text-xs font-bold text-slate-700">
                Email / ID Pengguna
              </label>
              <input
                id="login-id"
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="nama@smkpgripasirsakti.sch.id"
                className="mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-[#0D1B4C] focus:bg-white"
              />
            </div>

            <div>
              <label htmlFor="login-pass" className="block text-xs font-bold text-slate-700">
                Kata Sandi
              </label>
              <div className="relative mt-1.5">
                <input
                  id="login-pass"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-amber-50/60 pr-16 pl-4 text-sm font-medium text-slate-900 outline-none transition focus:border-[#0D1B4C] focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-[#0D1B4C] hover:bg-slate-100"
                >
                  {showPassword ? "Sembunyi" : "Lihat"}
                </button>
              </div>
            </div>

            {error ? (
              <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#081236] via-[#0D1B4C] to-[#1D3587] px-5 text-sm font-extrabold text-white shadow-lg shadow-[#0D1B4C]/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? "Memverifikasi..." : "Masuk ke Aplikasi"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
