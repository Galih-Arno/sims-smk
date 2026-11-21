import { useEffect, useState } from "react";
import { ReportPreviewSheet, type PreviewStudent } from "../components/report/ReportPreviewSheet.tsx";
import { draftPrintDocument, ReportPrintSheet, type ReportPrintDocument } from "../components/report/ReportPrintSheet.tsx";
import { ApiClientError, api, apiBlob } from "../lib/api.ts";
import { useSchoolScope } from "../lib/school.tsx";

type Preview = {
  homeroomId: string;
  academicPeriodId?: string | null;
  className: string;
  periodName: string;
  yearName: string;
  curriculumLabel: string | null;
  composer: "KURIKULUM_MERDEKA_SMK" | null;
  structureStatus: "TERSEDIA" | "BELUM_DIKONFIGURASI";
  students: Array<PreviewStudent & { official: { version: number; endorsedAt: string } | null }>;
};
type Payload = { homerooms: Array<{ id: string; className: string; periodName: string }>; preview: Preview | null };

const inputClass = "h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm";

export function ReportPreviewPage() {
  const { schoolId } = useSchoolScope();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [homeroomId, setHomeroomId] = useState("");
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [officialDoc, setOfficialDoc] = useState<ReportPrintDocument | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function reset() { setOfficialDoc(null); }
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);

  useEffect(() => { setOfficialDoc(null); }, [index, homeroomId]);

  useEffect(() => {
    if (!schoolId) return;
    const suffix = homeroomId ? `?homeroomId=${encodeURIComponent(homeroomId)}` : "";
    api<Payload>(`/api/v1/schools/${schoolId}/homeroom-report-preview${suffix}`)
      .then((result) => {
        setPayload(result);
        const requested = new URLSearchParams(window.location.search).get("studentId");
        const found = result.preview?.students.findIndex((item) => item.studentId === requested) ?? -1;
        setIndex(found >= 0 ? found : 0);
        setOfficialDoc(null);
        setMessage("");
      })
      .catch((error: unknown) => setMessage(error instanceof ApiClientError ? error.message : "Pratinjau rapor gagal dimuat."));
  }, [schoolId, homeroomId]);

  const preview = payload?.preview ?? null;
  const total = preview?.students.length ?? 0;
  const safeIndex = total === 0 ? 0 : Math.min(index, total - 1);
  const student = preview?.students[safeIndex] ?? null;
  const draft = preview && student ? draftPrintDocument(student, preview) : null;
  const printable = officialDoc ?? draft;
  const officialReady = Boolean(student?.official && preview?.academicPeriodId);

  async function printDraft() {
    setOfficialDoc(null);
    await paint();
    window.print();
  }

  async function printOfficial() {
    if (!schoolId || !student || !preview?.academicPeriodId || !student.official) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ studentId: student.studentId, academicPeriodId: preview.academicPeriodId });
      const document = await api<ReportPrintDocument>(`/api/v1/schools/${schoolId}/report-official-print?${params}`);
      setOfficialDoc(document);
      await paint();
      window.print();
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "Cetak resmi gagal dibuka.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadOfficial() {
    if (!schoolId || !student || !preview?.academicPeriodId || !student.official) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ studentId: student.studentId, academicPeriodId: preview.academicPeriodId });
      const file = await apiBlob(`/api/v1/schools/${schoolId}/report-official-print.pdf?${params}`);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("PDF resmi diunduh dari snapshot yang disahkan.");
    } catch (error: unknown) {
      setMessage(error instanceof ApiClientError ? error.message : "PDF resmi gagal diunduh.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="report-screen">
        <h1 className="text-lg font-semibold text-slate-900">Pratinjau Rapor</h1>
        <p className="text-sm text-slate-500">Cetak draf memakai data terkini. Cetak resmi dan PDF resmi hanya memakai snapshot yang sudah disahkan.</p>
      </div>
      {message ? <p className="report-screen rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p> : null}
      <div className="report-screen flex flex-wrap items-center gap-2">
        <select className={inputClass} value={homeroomId || preview?.homeroomId || ""} onChange={(event) => { setHomeroomId(event.target.value); setIndex(0); }}>
          {(payload?.homerooms.length ?? 0) === 0 ? <option value="">Belum ada kelas binaan</option> : null}
          {payload?.homerooms.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.periodName}</option>)}
        </select>
        <select className={`${inputClass} min-w-48`} aria-label="Pilih siswa" value={student?.studentId ?? ""} onChange={(event) => setIndex(preview?.students.findIndex((item) => item.studentId === event.target.value) ?? 0)}>
          {total === 0 ? <option value="">Belum ada siswa</option> : null}
          {preview?.students.map((item) => <option key={item.studentId} value={item.studentId}>{item.name}{item.nis ? ` · ${item.nis}` : ""}</option>)}
        </select>
        <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={safeIndex <= 0} onClick={() => setIndex((value) => value - 1)}>Sebelumnya</button>
        <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={total === 0 || safeIndex >= total - 1} onClick={() => setIndex((value) => value + 1)}>Berikutnya</button>
        <button type="button" className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50" disabled={!draft || busy} onClick={() => void printDraft()}>Cetak Draf</button>
        <button type="button" className="h-9 rounded-lg bg-emerald-700 px-3 text-sm text-white disabled:opacity-50" disabled={!officialReady || busy} onClick={() => void printOfficial()}>Cetak Resmi</button>
        <button type="button" className="h-9 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:opacity-50" disabled={!officialReady || busy} onClick={() => void downloadOfficial()}>Unduh PDF</button>
        <p className="text-sm text-slate-600">{total === 0 ? "0 siswa" : `${safeIndex + 1}/${total}`}{student ? ` · ${student.printLabel}` : ""}{student?.official ? ` · Versi ${student.official.version}` : ""}</p>
      </div>
      {!preview || !student ? <p className="report-screen text-sm text-slate-500">Belum ada kelas binaan pada semester aktif.</p> : (
        <div className="report-screen">
          <ReportPreviewSheet student={student} className={preview.className} curriculumLabel={preview.curriculumLabel} structureStatus={preview.structureStatus} />
        </div>
      )}
      {printable ? <ReportPrintSheet document={printable} /> : null}
    </section>
  );
}

function paint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => requestAnimationFrame(() => resolve()), 40);
  });
}
