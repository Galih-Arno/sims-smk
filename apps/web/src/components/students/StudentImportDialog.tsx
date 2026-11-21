import { useMemo, useState } from "react";
import type { ImportCommitDto, ImportPreviewDto, ImportPreviewRow } from "@sims/shared";
import { ApiClientError, api, apiBlob } from "../../lib/api.ts";

const MAX_BYTES = 2 * 1024 * 1024;

type StudentImportDialogProps = {
  schoolId: string;
  years: { id: string; label: string }[];
  operational: boolean;
  onClose: () => void;
  onImported: (message: string) => void;
};

function csvCell(value: string): string {
  const safe = /^[\d]+$/.test(value) ? `="${value}"` : value;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function downloadErrors(rows: ImportPreviewRow[]) {
  const header = ["baris", "nama", "nisn", "nis", "kelas", "status", "alasan"];
  const lines = rows
    .filter((row) => !row.valid)
    .map((row) => [
      String(row.rowNumber),
      row.data.nama ?? "",
      row.data.nisn ?? "",
      row.data.nis ?? "",
      row.data.kelas ?? "",
      row.status === "DUPLIKAT" ? "Duplikat" : "Gagal",
      row.errors.join("; "),
    ]);
  const csv = `\uFEFF${[header, ...lines].map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "laporan-kesalahan-siswa.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function statusText(row: ImportPreviewRow, committed: boolean): string {
  if (committed && row.valid) return "Berhasil";
  if (row.status === "DUPLIKAT") return "Duplikat";
  if (!row.valid) return "Gagal";
  return "Valid";
}

export function StudentImportDialog({ schoolId, years, operational, onClose, onImported }: StudentImportDialogProps) {
  const [yearId, setYearId] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [result, setResult] = useState<ImportCommitDto | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"SEMUA" | "VALID" | "DUPLIKAT" | "GAGAL">("SEMUA");

  const rows = result?.rows ?? preview?.rows ?? [];
  const summary = result
    ? {
        total: result.totalCount ?? result.rows.length,
        valid: result.created,
        duplicate: result.duplicateCount ?? 0,
        failed: result.failedCount ?? 0,
        validLabel: "Berhasil",
      }
    : {
        total: preview?.totalCount ?? preview?.rows.length ?? 0,
        valid: preview?.validCount ?? 0,
        duplicate: preview?.duplicateCount ?? 0,
        failed: preview?.failedCount ?? 0,
        validLabel: "Valid",
      };
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const status = row.status ?? (row.valid ? "VALID" : "GAGAL");
      if (statusFilter === "VALID" && !row.valid) return false;
      if (statusFilter === "DUPLIKAT" && status !== "DUPLIKAT") return false;
      if (statusFilter === "GAGAL" && (status !== "GAGAL" || row.valid)) return false;
      if (!needle) return true;
      const haystack = [row.data.nama, row.data.nisn, row.data.nis, row.data.kelas, row.errors.join(" ")].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, rows, statusFilter]);

  async function downloadTemplate() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ format: "xlsx" });
      if (yearId) params.set("academicYearId", yearId);
      const file = await apiBlob(`/api/v1/schools/${schoolId}/imports/students/template?${params.toString()}`);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename || "templat-siswa.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Template gagal diunduh.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      setError("Berkas harus berformat XLSX atau CSV.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Berkas terlalu besar. Maksimal 2 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setFileName(file.name);
    const body = new FormData();
    if (yearId) body.append("academicYearId", yearId);
    body.append("file", file);
    try {
      setPreview(await api<ImportPreviewDto>(`/api/v1/schools/${schoolId}/imports/students/preview`, { method: "POST", body }));
      setQuery("");
      setStatusFilter("SEMUA");
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof ApiClientError ? caught.message : "Berkas gagal diperiksa.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const response = await api<ImportCommitDto>(`/api/v1/schools/${schoolId}/imports/students/commit`, {
        method: "POST",
        body: JSON.stringify({
          ...(yearId ? { academicYearId: yearId } : {}),
          rows: preview.rows.map((row) => ({ rowNumber: row.rowNumber, data: row.data })),
        }),
      });
      setResult(response);
      setPreview({
        rows: response.rows,
        validCount: response.rows.filter((row) => row.valid).length,
        invalidCount: response.rows.filter((row) => !row.valid).length,
        totalCount: response.totalCount,
        duplicateCount: response.duplicateCount,
        failedCount: response.failedCount,
      });
      const parts = [`${response.created} siswa berhasil diimpor`];
      if ((response.duplicateCount ?? 0) > 0) parts.push(`${response.duplicateCount} duplikat dilewati`);
      if ((response.failedCount ?? 0) > 0) parts.push(`${response.failedCount} baris gagal`);
      onImported(`${parts.join(". ")}.`);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Impor gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="student-import-title" className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="student-import-title" className="text-lg font-semibold text-slate-900">Import Excel</h2>
            <p className="mt-1 text-sm text-slate-500">Download Template, pilih berkas, periksa pratinjau, lalu konfirmasi simpan. Hanya baris valid yang disimpan. Siswa lama tidak diubah dan akun login tidak dibuat.</p>
          </div>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={onClose}>Tutup</button>
        </div>
        {!operational ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">Sekolah ini tidak aktif. Import tidak dapat dilakukan sampai pemilik sistem mengaktifkannya kembali.</p> : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block text-sm font-medium text-slate-700">Tahun pelajaran
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm sm:w-64"
              value={yearId}
              disabled={!operational || busy}
              onChange={(event) => {
                setYearId(event.target.value);
                setPreview(null);
                setResult(null);
                setError("");
              }}
            >
              <option value="">Tanpa penempatan kelas</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
            </select>
          </label>
          <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!operational || busy} onClick={() => void downloadTemplate()}>Download Template</button>
          <label className={`rounded-xl bg-teal-800 px-4 py-2 text-center text-sm font-semibold text-white ${!operational || busy ? "opacity-50" : ""}`}>
            Pilih File
            <input
              className="hidden"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!operational || busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">XLSX atau CSV UTF-8, maksimal 2 MB dan 1.000 baris. NISN dan NIS dibaca sebagai teks. Kolom Kelas hanya menerima kelas yang sudah ada pada tahun pelajaran yang dipilih.</p>
        {fileName ? <p className="mt-2 text-sm text-slate-600">Berkas: {fileName}</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {result ? <p role="status" className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{summary.valid} siswa berhasil diimpor. {summary.duplicate} duplikat dilewati. {summary.failed} baris gagal.</p> : null}
        {preview || result ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="block text-slate-500">Total</span><span className="text-lg font-semibold">{summary.total}</span></p>
              <p className="rounded-xl bg-teal-50 px-3 py-2 text-sm"><span className="block text-teal-800">{summary.validLabel}</span><span className="text-lg font-semibold">{summary.valid}</span></p>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm"><span className="block text-amber-800">Duplikat</span><span className="text-lg font-semibold">{summary.duplicate}</span></p>
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm"><span className="block text-red-800">Gagal</span><span className="text-lg font-semibold">{summary.failed}</span></p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:max-w-xs" value={query} placeholder="Cari nama, NISN, NIS, atau kelas" aria-label="Cari hasil pratinjau" onChange={(event) => setQuery(event.target.value)} />
              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" aria-label="Filter status pratinjau" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="SEMUA">Semua status</option>
                <option value="VALID">Valid</option>
                <option value="DUPLIKAT">Duplikat</option>
                <option value="GAGAL">Gagal</option>
              </select>
              <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50" disabled={rows.every((row) => row.valid)} onClick={() => downloadErrors(rows)}>Unduh laporan kesalahan</button>
            </div>
            <div className="max-h-80 overflow-auto rounded-2xl border border-slate-200">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Baris</th>
                    <th className="px-3 py-2 font-medium">Nama</th>
                    <th className="px-3 py-2 font-medium">NISN</th>
                    <th className="px-3 py-2 font-medium">NIS</th>
                    <th className="px-3 py-2 font-medium">Kelas</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? <tr><td className="px-3 py-4 text-slate-500" colSpan={7}>Tidak ada baris pada filter ini.</td></tr> : null}
                  {visible.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-slate-100">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.data.nama || "-"}</td>
                      <td className="px-3 py-2 font-mono">{row.data.nisn || "-"}</td>
                      <td className="px-3 py-2 font-mono">{row.data.nis?.trim() ? row.data.nis : "Belum diisi"}</td>
                      <td className="px-3 py-2">{row.data.kelas || "-"}</td>
                      <td className="px-3 py-2">{statusText(row, Boolean(result))}</td>
                      <td className="px-3 py-2 text-red-700">{row.errors.join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button type="button" className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!operational || busy || Boolean(result) || (preview?.validCount ?? 0) === 0} onClick={() => void commit()}>
                {busy ? "Menyimpan..." : "Konfirmasi Simpan"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
