import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ROLE_DEFINITIONS, type LinkableTeacherDto, type PageResult, type RoleCode, type SchoolUserDto, type SchoolUserWriteResult } from "@sims/shared";
import { Badge } from "../components/ui/Badge.tsx";
import { gridCell, gridHeadCell, gridRow, gridTable, gridTableFrame } from "../components/data/gridTable.ts";
import { ApiClientError, api } from "../lib/api.ts";
import { isSchoolAdmin } from "../lib/access.ts";
import { useAuth } from "../lib/auth.tsx";
import { useSchoolScope } from "../lib/school.tsx";

const ROLES = ROLE_DEFINITIONS.filter((role) => role.scope === "SCHOOL");
const TEACHER_ROLE_CODES = new Set<RoleCode>(["GURU_MAPEL", "WALI_KELAS"]);
const inputClass = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800";

type Draft = { name: string; email: string; roles: RoleCode[]; teacherId: string };

export function SchoolUsersPage() {
  const { user } = useAuth();
  const { schoolId, school } = useSchoolScope();
  const allowed = isSchoolAdmin(user, schoolId);
  const [items, setItems] = useState<SchoolUserDto[]>([]);
  const [teachers, setTeachers] = useState<LinkableTeacherDto[]>([]);
  const [teachersReady, setTeachersReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<SchoolUserDto | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!schoolId || !allowed) return;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (query.trim()) params.set("q", query.trim());
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    api<PageResult<SchoolUserDto>>(`/api/v1/schools/${schoolId}/users?${params}`)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Daftar pengguna gagal dimuat."));
  }, [schoolId, allowed, page, pageSize, query, role, status, reload]);

  useEffect(() => {
    if (!schoolId || !allowed) return;
    let active = true;
    setTeachersReady(false);
    api<{ items: LinkableTeacherDto[] }>(`/api/v1/schools/${schoolId}/users/teachers`)
      .then((result) => {
        if (active) setTeachers(result.items);
      })
      .catch(() => {
        if (active) setTeachers([]);
      })
      .finally(() => {
        if (active) setTeachersReady(true);
      });
    return () => {
      active = false;
    };
  }, [schoolId, allowed, reload]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const needsTeacher = Boolean(editing && draft?.roles.some((item) => TEACHER_ROLE_CODES.has(item)));
  const roleChoices = editing ? ROLES : ROLES.filter((item) => !TEACHER_ROLE_CODES.has(item.code));
  const selectedTeacher = teachers.find((item) => item.id === draft?.teacherId);

  function openCreate() {
    setEditing(null);
    setFormError("");
    setDraft({ name: "", email: "", roles: [], teacherId: "" });
  }

  function validate(current: Draft): string | null {
    if (!current.name.trim()) return "Nama wajib diisi.";
    if (!current.email.trim()) return "Email wajib diisi.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.email.trim())) return "Email tidak valid.";
    if (current.roles.length === 0) return "Pilih minimal satu peran.";
    if (!editing && current.roles.some((item) => TEACHER_ROLE_CODES.has(item))) {
      return "Akun Guru Mata Pelajaran dan Wali Kelas dibuat dari menu Guru.";
    }
    const teacherRequired = editing && current.roles.some((item) => TEACHER_ROLE_CODES.has(item));
    if (!teacherRequired) return null;
    if (teachersReady && teachers.length === 0) {
      return "Belum ada data guru di sekolah ini. Buat data guru terlebih dahulu, lalu pilih data itu. Data guru tidak dibuat otomatis.";
    }
    if (!current.teacherId) return "Data guru wajib dipilih untuk peran Guru Mata Pelajaran atau Wali Kelas.";
    return null;
  }

  function toggleRole(code: RoleCode) {
    setDraft((current) => current && {
      ...current,
      roles: current.roles.includes(code) ? current.roles.filter((item) => item !== code) : [...current.roles, code],
    });
  }

  function chooseTeacher(teacherId: string) {
    const teacher = teachers.find((item) => item.id === teacherId);
    setDraft((current) => {
      if (!current) return current;
      if (teacher?.userEmail) return { ...current, teacherId, name: teacher.name, email: teacher.userEmail };
      return { ...current, teacherId };
    });
  }

  async function save() {
    if (!schoolId || !draft) return;
    const problem = validate(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    setBusy(true);
    setFormError("");
    setPassword("");
    try {
      const body = { name: draft.name, email: draft.email, roles: draft.roles, teacherId: needsTeacher ? draft.teacherId || null : null };
      const result = editing
        ? await api<SchoolUserWriteResult>(`/api/v1/schools/${schoolId}/users/${editing.id}/roles`, { method: "PATCH", body: JSON.stringify({ roles: draft.roles, teacherId: body.teacherId }) })
        : await api<SchoolUserWriteResult>(`/api/v1/schools/${schoolId}/users`, { method: "POST", body: JSON.stringify(body) });
      setPassword(result.temporaryPassword ?? "");
      setMessage(result.created ? "Akun dibuat. Salin kata sandi sementara. Kata sandi ini tidak ditampilkan lagi." : "Peran pengguna diperbarui. Akun yang sudah ada tidak digandakan.");
      setFormError("");
      setDraft(null);
      setEditing(null);
      setReload((value) => value + 1);
    } catch (error) {
      setFormError(error instanceof ApiClientError ? error.message : "Pengguna gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(item: SchoolUserDto) {
    if (!schoolId) return;
    setBusy(true);
    setPassword("");
    try {
      const result = await api<SchoolUserWriteResult>(`/api/v1/schools/${schoolId}/users/${item.id}/reset-password`, { method: "POST" });
      setPassword(result.temporaryPassword ?? "");
      setMessage(`Kata sandi ${item.name} direset. Salin kata sandi sementara. Kata sandi ini tidak ditampilkan lagi.`);
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Kata sandi gagal direset.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(item: SchoolUserDto) {
    if (!schoolId) return;
    setBusy(true);
    try {
      await api(`/api/v1/schools/${schoolId}/users/${item.id}/status`, { method: "POST", body: JSON.stringify({ isActive: !item.isActive }) });
      setMessage(item.isActive ? "Akun dinonaktifkan." : "Akun diaktifkan.");
      setReload((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Status akun gagal diubah.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <p className="text-sm text-slate-600">Manajemen pengguna hanya tersedia untuk admin sekolah.</p>;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Manajemen Pengguna</h1>
          <p className="text-sm text-slate-500">Kelola akun sekolah ini. Peran pemilik sistem tidak dapat dibuat atau diubah.</p>
        </div>
        <button type="button" className="h-9 rounded-lg bg-teal-800 px-3 text-sm font-medium text-white" onClick={openCreate}>Tambah pengguna</button>
      </div>
      {message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p> : null}
      {password ? <p className="rounded-lg bg-amber-50 px-3 py-2 font-mono text-sm text-amber-950">Kata sandi sementara: {password}</p> : null}
      <div className="flex flex-wrap gap-2">
        <input className={`${inputClass} w-56`} value={query} placeholder="Cari nama atau email" onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <select className={`${inputClass} w-44`} value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>
          <option value="">Semua peran</option>
          {ROLES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        <select className={`${inputClass} w-36`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </div>
      <div className={gridTableFrame}>
        <table className={gridTable}>
          <thead>
            <tr>
              <th className={gridHeadCell}>Nama</th>
              <th className={gridHeadCell}>Email</th>
              <th className={gridHeadCell}>Peran</th>
              <th className={gridHeadCell}>Guru</th>
              <th className={gridHeadCell}>Status</th>
              <th className={gridHeadCell}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td className={gridCell} colSpan={6}>Belum ada pengguna.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className={gridRow}>
                <td className={`${gridCell} min-w-40 whitespace-normal break-words`}>{item.name}</td>
                <td className={gridCell}>{item.email}</td>
                <td className={gridCell}>{item.roles.map((entry) => entry.name).join(", ") || "—"}</td>
                <td className={gridCell}>{item.teacherName ?? "—"}</td>
                <td className={gridCell}>{item.isActive ? <Badge tone="ok">Aktif</Badge> : <Badge tone="muted">Nonaktif</Badge>}</td>
                <td className={gridCell}>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className="h-7 rounded-md border border-slate-300 px-2 text-xs" onClick={() => { setFormError(""); setEditing(item); setDraft({ name: item.name, email: item.email, roles: item.roles.map((entry) => entry.code), teacherId: item.teacherId ?? "" }); }}>Peran</button>
                    <button type="button" className="h-7 rounded-md border border-slate-300 px-2 text-xs" disabled={busy} onClick={() => void resetPassword(item)}>Reset sandi</button>
                    <button type="button" className="h-7 rounded-md border border-slate-300 px-2 text-xs" disabled={busy} onClick={() => void changeStatus(item)}>{item.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{total} pengguna</span>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-lg border border-slate-300 px-2" value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value) as 10 | 25 | 50); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button>
          <span>{page}/{pages}</span>
          <button type="button" className="h-8 rounded-lg border border-slate-300 px-2" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
        </div>
      </div>
      {draft ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center">
          <form role="dialog" aria-modal="true" className="flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <header className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">{editing ? "Ubah peran" : "Pengguna baru"}</h2>
              <p className="text-sm text-slate-500">{editing ? "Peran akun ini dapat disesuaikan. Wali kelas tetap memerlukan penugasan wali kelas pada semester aktif." : "Admin Sekolah dan Tata Usaha dibuat di sini. Akun guru baru dibuat dari menu Guru."}</p>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {formError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}
            <label className="block text-xs text-slate-600">Nama
              <input className={inputClass} value={draft.name} disabled={Boolean(editing || selectedTeacher?.userEmail)} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="block text-xs text-slate-600">Email
              <input className={inputClass} type="email" value={draft.email} disabled={Boolean(editing || selectedTeacher?.userEmail)} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
            </label>
            <fieldset className="space-y-1">
              <legend className="text-xs text-slate-600">Peran</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {roleChoices.map((item) => (
                  <label key={item.code} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={draft.roles.includes(item.code)} onChange={() => toggleRole(item.code)} />
                    {item.name}
                  </label>
                ))}
              </div>
              {editing ? null : <p className="text-xs text-slate-500">Akun Guru Mata Pelajaran dan Wali Kelas tidak dibuat di sini. Gunakan <Link className="font-semibold text-teal-800 underline" to="/guru">Tambah Guru</Link>.</p>}
            </fieldset>
            {needsTeacher ? (
              <div className="space-y-1">
                <label className="block text-xs text-slate-600">Data guru
                  <select className={inputClass} value={draft.teacherId} onChange={(event) => chooseTeacher(event.target.value)}>
                    <option value="">Pilih guru</option>
                    {teachers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.userEmail ? " · sudah punya akun" : ""}</option>)}
                  </select>
                </label>
                <p className="text-xs text-slate-500">Wajib untuk Guru Mata Pelajaran dan Wali Kelas. Daftar ini hanya berisi guru {school?.name ?? "sekolah yang dipilih"}.</p>
                {teachersReady && teachers.length === 0 ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    Belum ada data guru di sekolah ini. Buat data guru terlebih dahulu, lalu kembali ke halaman ini. Data guru tidak dibuat otomatis.{" "}
                    <Link className="font-semibold text-teal-800 underline" to="/guru">Buka data guru</Link>
                  </p>
                ) : null}
                {selectedTeacher?.userEmail ? <p className="text-xs text-slate-500">Guru ini sudah punya akun. Simpan memperbarui peran akun tersebut dan tidak membuat akun ganda.</p> : null}
              </div>
            ) : null}
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm" onClick={() => { setDraft(null); setEditing(null); }}>Batal</button>
              <button type="submit" className="min-h-11 rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>Simpan</button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
