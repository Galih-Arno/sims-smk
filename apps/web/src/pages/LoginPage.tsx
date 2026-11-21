import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClientError } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

type LanAccess = {
  frontendUrls: string[];
  localFrontendUrl: string | null;
};

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lan, setLan] = useState<LanAccess | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/lan-access", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: LanAccess | null) => {
        if (data?.frontendUrls?.length) setLan(data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email dan kata sandi wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Tidak dapat masuk saat ini.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden bg-navy-950 px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-teal-200">SIMS SMK</p>
          <h1 className="mt-6 max-w-md text-4xl font-semibold leading-tight">
            Sistem Informasi Manajemen Sekolah
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-200">
            Data sekolah, pengguna, dan hak akses dalam satu gerbang masuk.
          </p>
        </div>
        <p className="max-w-md rounded-2xl bg-white/5 px-4 py-3 text-sm leading-6 text-slate-200">Satu akun dapat memegang beberapa peran di lebih dari satu sekolah.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-semibold tracking-[0.16em] text-teal-800">SIMS SMK</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Masuk ke sistem sekolah</h1>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-semibold text-slate-900">Masuk</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Gunakan akun yang diberikan oleh administrator sekolah.
            </p>
            {lan ? (
              <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
                <p>Dari laptop lain, buka {lan.frontendUrls.join(" atau ")}.</p>
                {lan.localFrontendUrl ? <p>Di komputer server, {lan.localFrontendUrl} tetap berlaku.</p> : null}
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none ring-teal-700 focus:border-teal-700 focus:ring-2"
                  placeholder="nama@sekolah.sch.id"
                  required
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Kata sandi
                <span className="mt-1 flex rounded-xl border border-slate-300 focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-base outline-none"
                    required
                  />
                  <button
                    type="button"
                    className="px-3 text-sm font-medium text-teal-800"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? "Sembunyi" : "Lihat"}
                  </button>
                </span>
              </label>

              {error ? (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-wait disabled:opacity-70"
              >
                {submitting ? "Memproses..." : "Masuk"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
