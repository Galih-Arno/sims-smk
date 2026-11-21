import { useEffect, useState } from "react";
import type {
  AcademicPeriodDto,
  AcademicYearDto,
  CurriculumDto,
  GradeReportPolicyDto,
  GradeReportPolicyInput,
  GradeReportPolicyPreviewDto,
  GradeRoundingMode,
  PageResult,
  RemedialScorePolicy,
} from "@sims/shared";
import { ApiClientError, api } from "../lib/api.ts";
import { canActivateGradePolicy, canCoordinate } from "../lib/access.ts";
import { useAuth } from "../lib/auth.tsx";
import { useSchoolScope } from "../lib/school.tsx";

type Draft = GradeReportPolicyInput;

const EMPTY: Draft = {
  academicYearId: "",
  academicPeriodId: "",
  curriculumId: "",
  label: null,
  useFormative: false,
  useSummative: false,
  useSts: false,
  useSas: false,
  formativeMode: "COMBINED",
  weightFormative: null,
  weightUh: null,
  weightT1: null,
  weightT2: null,
  weightT3: null,
  weightSummative: null,
  weightSts: null,
  weightSas: null,
  remedialPolicy: "HIGHEST",
  remedialCap: null,
  emptyTreatment: "INCOMPLETE",
  roundingMode: "NONE",
};

const inputClass = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800";

function parseWeight(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function weightText(value: number | null): string {
  return value === null ? "" : String(value);
}

export function GradePolicyPage() {
  const { user } = useAuth();
  const { schoolId } = useSchoolScope();
  const allowed = canCoordinate(user, schoolId);
  const mayActivate = canActivateGradePolicy(user, schoolId);
  const [items, setItems] = useState<GradeReportPolicyDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [years, setYears] = useState<AcademicYearDto[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriodDto[]>([]);
  const [curricula, setCurricula] = useState<CurriculumDto[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<GradeReportPolicyPreviewDto | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activateId, setActivateId] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId || !allowed) return;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.set("q", search);
    api<PageResult<GradeReportPolicyDto>>(`/api/v1/schools/${schoolId}/grade-report-policies?${params}`)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Daftar pengaturan gagal dimuat."));
  }, [schoolId, allowed, page, pageSize, search, busy]);

  useEffect(() => {
    if (!schoolId || !allowed) return;
    Promise.all([
      api<PageResult<AcademicYearDto>>(`/api/v1/schools/${schoolId}/academic-years?page=1&pageSize=50`),
      api<PageResult<AcademicPeriodDto>>(`/api/v1/schools/${schoolId}/semesters?page=1&pageSize=50`),
      api<PageResult<CurriculumDto>>(`/api/v1/schools/${schoolId}/curricula?page=1&pageSize=50`),
    ])
      .then(([yearPage, periodPage, curriculumPage]) => {
        setYears(yearPage.items);
        setPeriods(periodPage.items);
        setCurricula(curriculumPage.items);
      })
      .catch(() => setMessage("Data tahun, semester, atau kurikulum gagal dimuat."));
  }, [schoolId, allowed]);

  function openCreate() {
    setEditingId(null);
    setDraft({ ...EMPTY });
    setPreview(null);
    setMessage("");
  }

  function openEdit(item: GradeReportPolicyDto) {
    setEditingId(item.id);
    setDraft({
      academicYearId: item.academicYearId,
      academicPeriodId: item.academicPeriodId,
      curriculumId: item.curriculumId,
      label: item.label,
      useFormative: item.useFormative,
      useSummative: item.useSummative,
      useSts: item.useSts,
      useSas: item.useSas,
      formativeMode: item.formativeMode,
      weightFormative: item.weightFormative,
      weightUh: item.weightUh,
      weightT1: item.weightT1,
      weightT2: item.weightT2,
      weightT3: item.weightT3,
      weightSummative: item.weightSummative,
      weightSts: item.weightSts,
      weightSas: item.weightSas,
      remedialPolicy: item.remedialPolicy,
      remedialCap: item.remedialCap,
      emptyTreatment: "INCOMPLETE",
      roundingMode: item.roundingMode,
    });
    setPreview(null);
    setMessage("");
  }

  function patch(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
    setPreview(null);
  }

  async function runPreview() {
    if (!schoolId || !draft) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ preview: GradeReportPolicyPreviewDto }>(`/api/v1/schools/${schoolId}/grade-report-policies/preview`, {
        method: "POST",
        body: JSON.stringify(draft),
      });
      setPreview(result.preview);
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof ApiClientError ? error.message : "Pratinjau gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!schoolId || !draft || !preview?.valid) return;
    setBusy(true);
    setMessage("");
    try {
      const path = editingId
        ? `/api/v1/schools/${schoolId}/grade-report-policies/${editingId}`
        : `/api/v1/schools/${schoolId}/grade-report-policies`;
      await api(path, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(draft) });
      setDraft(null);
      setMessage(editingId ? "Draf pengaturan diperbarui." : "Draf pengaturan disimpan. Bobot belum menjadi aturan resmi sampai diaktifkan.");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Pengaturan gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!schoolId || !activateId) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/schools/${schoolId}/grade-report-policies/${activateId}/activate`, { method: "POST" });
      setActivateId(null);
      setMessage("Pengaturan nilai diaktifkan.");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Pengaturan gagal diaktifkan.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!schoolId) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/api/v1/schools/${schoolId}/grade-report-policies/${id}`, { method: "DELETE" });
      setMessage("Draf pengaturan dihapus.");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "Pengaturan gagal dihapus.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return <p className="text-sm text-slate-600">Pengaturan nilai hanya tersedia untuk Admin Sekolah dan Wakasek Kurikulum.</p>;
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const yearPeriods = periods.filter((item) => item.academicYearId === draft?.academicYearId);
  const yearCurricula = curricula.filter((item) => item.academicYearId === draft?.academicYearId);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pengaturan Nilai</h1>
          <p className="text-sm text-slate-500">Kebijakan pengolahan rapor per tahun, semester, dan kurikulum. Nilai yang sudah diinput tidak diubah.</p>
        </div>
        <button type="button" className="h-9 rounded-lg bg-sky-700 px-3 text-sm font-medium text-white" onClick={openCreate}>
          Tambah pengaturan
        </button>
      </div>
      {message ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass} max-w-xs`}
          value={query}
          placeholder="Cari tahun, semester, atau kurikulum"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setPage(1);
              setSearch(query.trim());
            }
          }}
        />
        <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" onClick={() => { setPage(1); setSearch(query.trim()); }}>
          Cari
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Penanda</th>
              <th className="px-3 py-2">Tahun</th>
              <th className="px-3 py-2">Semester</th>
              <th className="px-3 py-2">Kurikulum</th>
              <th className="px-3 py-2">Komponen</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={7}>Belum ada pengaturan nilai.</td>
              </tr>
            ) : items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{item.label ?? "—"}</td>
                <td className="px-3 py-2">{item.academicYearName}</td>
                <td className="px-3 py-2">{item.periodName}</td>
                <td className="px-3 py-2">{item.curriculumName}</td>
                <td className="px-3 py-2 text-slate-600">{componentLabel(item)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {item.status === "ACTIVE" ? "Aktif" : "Draf"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    {item.status === "DRAFT" ? (
                      <button type="button" className="text-sky-800" onClick={() => openEdit(item)}>Ubah</button>
                    ) : null}
                    {item.status === "DRAFT" && mayActivate ? (
                      <button type="button" className="text-emerald-800" onClick={() => setActivateId(item.id)}>Aktifkan</button>
                    ) : null}
                    {item.status === "DRAFT" ? (
                      <button type="button" className="text-rose-700" onClick={() => void remove(item.id)}>Hapus</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{total} pengaturan</span>
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
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <form
            className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div>
              <h2 className="text-base font-semibold text-slate-900">{editingId ? "Ubah draf" : "Pengaturan baru"}</h2>
              <p className="text-xs text-slate-500">Bobot tidak diisi otomatis. Simpan menghasilkan status Draf.</p>
            </div>
            <label className="block text-xs text-slate-600">Penanda
              <input className={inputClass} value={draft.label ?? ""} maxLength={40} placeholder="Contoh: QC-04B1" onChange={(event) => patch({ label: event.target.value.trim() ? event.target.value : null })} />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-slate-600">Tahun pelajaran
                <select className={inputClass} value={draft.academicYearId} onChange={(event) => patch({ academicYearId: event.target.value, academicPeriodId: "", curriculumId: "" })}>
                  <option value="">Pilih</option>
                  {years.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-600">Semester
                <select className={inputClass} value={draft.academicPeriodId} onChange={(event) => patch({ academicPeriodId: event.target.value })}>
                  <option value="">Pilih</option>
                  {yearPeriods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-600">Kurikulum
                <select className={inputClass} value={draft.curriculumId} onChange={(event) => patch({ curriculumId: event.target.value })}>
                  <option value="">Pilih</option>
                  {yearCurricula.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="grid gap-2 sm:grid-cols-4">
              <LegendCheck label="Formatif" checked={draft.useFormative} onChange={(checked) => patch({ useFormative: checked, weightFormative: null, weightUh: null, weightT1: null, weightT2: null, weightT3: null })} />
              <LegendCheck label="Sumatif" checked={draft.useSummative} onChange={(checked) => patch({ useSummative: checked, weightSummative: null })} />
              <LegendCheck label="STS" checked={draft.useSts} onChange={(checked) => patch({ useSts: checked, weightSts: null })} />
              <LegendCheck label="SAS" checked={draft.useSas} onChange={(checked) => patch({ useSas: checked, weightSas: null })} />
            </fieldset>
            {draft.useFormative ? (
              <label className="block text-xs text-slate-600">UH dan Tugas 1–3
                <select className={inputClass} value={draft.formativeMode} onChange={(event) => patch({ formativeMode: event.target.value as Draft["formativeMode"], weightFormative: null, weightUh: null, weightT1: null, weightT2: null, weightT3: null })}>
                  <option value="COMBINED">Digabung dalam Formatif</option>
                  <option value="SEPARATE">Dihitung terpisah</option>
                </select>
              </label>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-4">
              {draft.useFormative && draft.formativeMode === "COMBINED" ? <Weight label="Formatif" value={draft.weightFormative} onChange={(weightFormative) => patch({ weightFormative })} /> : null}
              {draft.useFormative && draft.formativeMode === "SEPARATE" ? (
                <>
                  <Weight label="UH" value={draft.weightUh} onChange={(weightUh) => patch({ weightUh })} />
                  <Weight label="Tugas 1" value={draft.weightT1} onChange={(weightT1) => patch({ weightT1 })} />
                  <Weight label="Tugas 2" value={draft.weightT2} onChange={(weightT2) => patch({ weightT2 })} />
                  <Weight label="Tugas 3" value={draft.weightT3} onChange={(weightT3) => patch({ weightT3 })} />
                </>
              ) : null}
              {draft.useSummative ? <Weight label="Sumatif" value={draft.weightSummative} onChange={(weightSummative) => patch({ weightSummative })} /> : null}
              {draft.useSts ? <Weight label="STS" value={draft.weightSts} onChange={(weightSts) => patch({ weightSts })} /> : null}
              {draft.useSas ? <Weight label="SAS" value={draft.weightSas} onChange={(weightSas) => patch({ weightSas })} /> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">Kebijakan remedial
                <select className={inputClass} value={draft.remedialPolicy} onChange={(event) => patch({ remedialPolicy: event.target.value as RemedialScorePolicy, remedialCap: null })}>
                  <option value="HIGHEST">Nilai tertinggi</option>
                  <option value="LATEST">Nilai terbaru</option>
                  <option value="CAPPED">Batas maksimum</option>
                </select>
              </label>
              {draft.remedialPolicy === "CAPPED" ? <Weight label="Batas maksimum" value={draft.remedialCap} onChange={(remedialCap) => patch({ remedialCap })} /> : null}
              <label className="text-xs text-slate-600">Pembulatan nilai akhir
                <select className={inputClass} value={draft.roundingMode} onChange={(event) => patch({ roundingMode: event.target.value as GradeRoundingMode })}>
                  <option value="NONE">Tanpa pembulatan</option>
                  <option value="INTEGER">Bilangan bulat</option>
                  <option value="ONE_DECIMAL">Satu desimal</option>
                  <option value="TWO_DECIMALS">Dua desimal</option>
                </select>
              </label>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Nilai kosong diperlakukan sebagai belum lengkap, bukan otomatis nol.</p>
            {preview ? (
              <div className={`rounded-lg px-3 py-2 text-sm ${preview.valid ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
                <p className="font-medium">{preview.valid ? "Pratinjau valid" : "Pratinjau belum valid"}</p>
                <ul className="mt-1 list-disc pl-4">
                  {(preview.valid ? preview.summary : preview.messages).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setDraft(null)}>Tutup</button>
              <button type="button" className="h-9 rounded-lg border border-sky-700 px-3 text-sm text-sky-800" disabled={busy} onClick={() => void runPreview()}>Pratinjau</button>
              <button type="submit" className="h-9 rounded-lg bg-sky-700 px-3 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !preview?.valid}>Simpan draf</button>
            </div>
          </form>
        </div>
      ) : null}
      {activateId ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4">
            <h2 className="text-base font-semibold">Aktifkan pengaturan</h2>
            <p className="text-sm text-slate-600">Pengaturan aktif menjadi acuan kebijakan sekolah untuk lingkup ini. Nilai siswa tidak dihitung ulang.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setActivateId(null)}>Batal</button>
              <button type="button" className="h-9 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white" disabled={busy} onClick={() => void activate()}>Aktifkan</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function componentLabel(item: GradeReportPolicyDto): string {
  const names = [
    item.useFormative ? (item.formativeMode === "SEPARATE" ? "Formatif terpisah" : "Formatif") : "",
    item.useSummative ? "Sumatif" : "",
    item.useSts ? "STS" : "",
    item.useSas ? "SAS" : "",
  ].filter(Boolean);
  return names.join(", ");
}

function LegendCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Weight({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <label className="text-xs text-slate-600">{label} (%)
      <input className={inputClass} inputMode="decimal" value={weightText(value)} onChange={(event) => onChange(parseWeight(event.target.value))} />
    </label>
  );
}
