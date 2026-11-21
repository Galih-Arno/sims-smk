import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AcademicOptionsDto, PageResult, PlanItemDto, PlanSlotDto } from "@sims/shared";
import { DataScreen, type ColumnDef, type FieldDef } from "../components/data/DataScreen.tsx";
import { ApiClientError, api } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

function useOptions(schoolId: string, reloadToken: number) {
  const [options, setOptions] = useState<AcademicOptionsDto | null>(null);
  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    api<{ options: AcademicOptionsDto }>(`/api/v1/schools/${schoolId}/academic-options`)
      .then((data) => {
        if (active) setOptions(data.options);
      })
      .catch(() => {
        if (active) setOptions(null);
      });
    return () => {
      active = false;
    };
  }, [schoolId, reloadToken]);
  return options;
}

function asChoices(items: { id: string; label: string }[] | undefined) {
  return (items ?? []).map((item) => ({ value: item.id, label: item.label }));
}

function MissingSchool() {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">Pilih sekolah terlebih dahulu.</p>;
}

function CoordinateMaster({
  title,
  description,
  path,
  columns,
  fields,
  editable = true,
  reloadToken,
  onChanged,
}: {
  title: string;
  description: string;
  path: string;
  columns: ColumnDef[];
  fields: (options: AcademicOptionsDto | null) => FieldDef[];
  editable?: boolean;
  reloadToken: number;
  onChanged: () => void;
}) {
  const { schoolId, canCoordinate } = useSchoolScope();
  const options = useOptions(schoolId, reloadToken);
  if (!schoolId) return <MissingSchool />;
  return (
    <DataScreen
      title={title}
      description={description}
      endpoint={`/api/v1/schools/${schoolId}/${path}`}
      columns={columns}
      fields={fields(options)}
      canWrite={canCoordinate}
      editable={editable}
      reloadToken={reloadToken}
      onChanged={onChanged}
    />
  );
}

export function CurriculaPage() {
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = () => setReloadToken((current) => current + 1);
  return (
    <div className="space-y-10">
      <CoordinateMaster
        reloadToken={reloadToken}
        onChanged={refresh}
        title="Kurikulum"
        description="Kurikulum terikat pada tahun pelajaran. Cakupan kelas dan mapel diatur di bawah."
        path="curricula"
        columns={[
          { key: "code", label: "Kode" },
          { key: "name", label: "Nama" },
          { key: "academicYearName", label: "Tahun" },
          { key: "isActive", label: "Status", render: (row) => (row.isActive ? "Aktif" : "Tidak aktif") },
        ]}
        fields={(options) => [
          { name: "academicYearId", label: "Tahun pelajaran", type: "select", required: true, options: asChoices(options?.years) },
          { name: "code", label: "Kode", type: "text", required: true },
          { name: "name", label: "Nama", type: "text", required: true },
          { name: "description", label: "Deskripsi", type: "text" },
          { name: "isActive", label: "Aktif", type: "checkbox", defaultValue: true },
        ]}
      />
      <CoordinateMaster
        reloadToken={reloadToken}
        onChanged={refresh}
        title="Cakupan kelas dan mapel"
        description="Setiap baris menghubungkan satu kurikulum, satu kelas, dan satu mata pelajaran pada tahun yang sama."
        path="curriculum-placements"
        editable={false}
        columns={[
          { key: "curriculumName", label: "Kurikulum" },
          { key: "className", label: "Kelas" },
          { key: "subjectName", label: "Mapel" },
        ]}
        fields={(options) => [
          { name: "curriculumId", label: "Kurikulum", type: "select", required: true, options: asChoices(options?.curricula) },
          { name: "classId", label: "Kelas", type: "select", required: true, options: asChoices(options?.classes) },
          { name: "subjectId", label: "Mata pelajaran", type: "select", required: true, options: asChoices(options?.subjects) },
        ]}
      />
    </div>
  );
}

function uniqueSlots(slots: PlanSlotDto[], key: "academicPeriodId" | "classId" | "subjectId", label: "periodName" | "className" | "subjectName") {
  const map = new Map<string, string>();
  for (const slot of slots) map.set(slot[key], slot[label]);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function PlanList({
  schoolId,
  title,
  emptyLabel,
  path,
  classId,
  subjectId,
  academicPeriodId,
  canWrite,
}: {
  schoolId: string;
  title: string;
  emptyLabel: string;
  path: string;
  classId: string;
  subjectId: string;
  academicPeriodId: string;
  canWrite: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [rows, setRows] = useState<PlanItemDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PlanItemDto | null | undefined>(undefined);
  const [form, setForm] = useState({ code: "", description: "", sequence: "" });
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const ready = Boolean(classId && subjectId && academicPeriodId);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      pageSize: String(pageSize),
      classId,
      subjectId,
      academicPeriodId,
    });
    api<PageResult<PlanItemDto>>(`/api/v1/schools/${schoolId}/${path}?${params.toString()}`)
      .then((data) => {
        if (!active) return;
        setRows(data.items);
        setTotal(data.total);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof ApiClientError ? caught.message : "Data gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [schoolId, path, query, page, pageSize, classId, subjectId, academicPeriodId, ready, tick]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function openCreate() {
    setForm({ code: "", description: "", sequence: "" });
    setEditing(null);
    setError("");
  }

  function openEdit(row: PlanItemDto) {
    setForm({ code: row.code, description: row.description, sequence: String(row.sequence) });
    setEditing(row);
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (form.description.trim().length < 3) {
      setError("Deskripsi minimal 3 karakter.");
      return;
    }
    setSaving(true);
    const sequence = form.sequence.trim() === "" ? null : Number(form.sequence);
    const payload = editing
      ? { code: form.code.trim(), description: form.description.trim(), sequence: sequence ?? editing.sequence }
      : {
          classId,
          subjectId,
          academicPeriodId,
          code: form.code.trim() === "" ? null : form.code.trim(),
          description: form.description.trim(),
          sequence,
        };
    try {
      if (editing) await api(`/api/v1/schools/${schoolId}/${path}/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api(`/api/v1/schools/${schoolId}/${path}`, { method: "POST", body: JSON.stringify(payload) });
      setEditing(undefined);
      setError("");
      setPage(1);
      setTick((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Data gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setSaving(true);
    try {
      await api(`/api/v1/schools/${schoolId}/${path}/${id}`, { method: "DELETE" });
      setConfirmId(null);
      setError("");
      setPage(1);
      setTick((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Data gagal dihapus.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {canWrite ? (
          <button type="button" onClick={openCreate} className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white">Tambah</button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Cari" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:max-w-xs" />
        <label className="text-sm text-slate-600">
          Tampilkan
          <select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value) as 10 | 25 | 50); }} className="ml-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Memuat data...</p> : null}
      {!loading && rows.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">{emptyLabel}</p> : null}
      {rows.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Urutan</th>
                  <th className="px-3 py-2 font-medium">Kode</th>
                  <th className="px-3 py-2 font-medium">Deskripsi</th>
                  {canWrite ? <th className="px-3 py-2 font-medium">Aksi</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-3 py-3">{row.sequence}</td>
                    <td className="px-3 py-3">{row.code}</td>
                    <td className="px-3 py-3">{row.description}</td>
                    {canWrite ? (
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button type="button" className="rounded-lg border border-slate-300 px-2 py-1" onClick={() => openEdit(row)}>Ubah</button>
                          <button type="button" className="rounded-lg border border-red-200 px-2 py-1 text-red-700" onClick={() => setConfirmId(row.id)}>Hapus</button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <p className="font-medium">{row.code} · urutan {row.sequence}</p>
                <p className="mt-1 text-slate-700">{row.description}</p>
                {canWrite ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5" onClick={() => openEdit(row)}>Ubah</button>
                    <button type="button" className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700" onClick={() => setConfirmId(row.id)}>Hapus</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>{total} data</p>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Sebelumnya</button>
          <span>{page}/{pageCount}</span>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Berikutnya</button>
        </div>
      </div>
      {editing !== undefined ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <form onSubmit={(event) => void save(event)} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">{editing ? "Ubah data" : "Tambah data"}</h2>
            <label className="mt-4 block text-sm font-medium text-slate-700">Kode
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Kosongkan untuk nomor otomatis" />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">Deskripsi
              <textarea className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} required />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">Urutan
              <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" inputMode="numeric" value={form.sequence} onChange={(event) => setForm((current) => ({ ...current, sequence: event.target.value }))} placeholder="Otomatis" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => setEditing(undefined)}>Batal</button>
              <button type="submit" disabled={saving} className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </form>
        </div>
      ) : null}
      {confirmId ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5">
            <h2 className="text-lg font-semibold">Hapus data ini?</h2>
            <p className="mt-2 text-sm text-slate-500">Jumlah TP dan LM tidak dibatasi. Data yang sudah dipakai penilaian tidak dapat dihapus.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => setConfirmId(null)}>Batal</button>
              <button type="button" className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void remove(confirmId)}>Hapus</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function LearningPlansPage() {
  const { schoolId, canCoordinate } = useSchoolScope();
  const options = useOptions(schoolId, 0);
  const slots = options?.planSlots ?? [];
  const [periodId, setPeriodId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const periods = useMemo(() => uniqueSlots(slots, "academicPeriodId", "periodName"), [slots]);
  const classes = useMemo(
    () => uniqueSlots(slots.filter((slot) => slot.academicPeriodId === periodId), "classId", "className"),
    [slots, periodId],
  );
  const subjects = useMemo(
    () => uniqueSlots(slots.filter((slot) => slot.academicPeriodId === periodId && slot.classId === classId), "subjectId", "subjectName"),
    [slots, periodId, classId],
  );
  const slot = slots.find((item) => item.academicPeriodId === periodId && item.classId === classId && item.subjectId === subjectId);

  useEffect(() => {
    if (!periodId && periods[0]) setPeriodId(periods[0].id);
  }, [periodId, periods]);

  if (!schoolId) return <MissingSchool />;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tujuan pembelajaran dan lingkup materi</h1>
        <p className="mt-1 text-sm text-slate-500">Daftar mengikuti penugasan guru, mapel, kelas, dan semester. Jumlahnya tidak dibatasi.</p>
      </div>
      {slots.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm leading-6 text-slate-600">{canCoordinate ? "Belum ada penugasan mengajar." : "Anda belum memiliki penugasan mengajar. Silakan hubungi Wakasek Kurikulum."}</p> : null}
      {slots.length > 0 ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Semester
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={periodId} onChange={(event) => { setPeriodId(event.target.value); setClassId(""); setSubjectId(""); }}>
              <option value="">Pilih</option>
              {periods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Kelas
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={classId} onChange={(event) => { setClassId(event.target.value); setSubjectId(""); }}>
              <option value="">Pilih</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Mata pelajaran
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
              <option value="">Pilih</option>
              {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      {slot ? <p className="text-sm text-slate-600">Guru pengampu: {slot.teacherName}. {slot.writable ? "Anda dapat mengubah TP dan LM ini." : "Anda dapat melihat, tanpa mengubah."}</p> : null}
      {periodId && classId && !slot && subjectId ? <p className="text-sm text-slate-500">Kombinasi ini belum memiliki penugasan guru.</p> : null}
      <PlanList schoolId={schoolId} title="Tujuan pembelajaran" emptyLabel="Belum ada tujuan pembelajaran." path="learning-objectives" classId={classId} subjectId={subjectId} academicPeriodId={periodId} canWrite={Boolean(slot?.writable)} />
      <PlanList schoolId={schoolId} title="Lingkup materi" emptyLabel="Belum ada lingkup materi." path="material-scopes" classId={classId} subjectId={subjectId} academicPeriodId={periodId} canWrite={Boolean(slot?.writable)} />
    </section>
  );
}
