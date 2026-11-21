import type { PreviewStudent } from "./ReportPreviewSheet.tsx";

export type ReportPrintDocument = {
  mode: "DRAFT" | "OFFICIAL";
  schoolName: string;
  npsn: string;
  address: string;
  curriculumLabel: string;
  studentName: string;
  nis: string;
  nisn: string;
  className: string;
  fase: string;
  semester: string;
  yearName: string;
  periodName: string;
  subjects: Array<{ name: string; category: "UMUM" | "KEJURUAN"; teacherName: string; score: string; description: string }>;
  sakit: string;
  izin: string;
  alpa: string;
  attendanceCompleteness: string;
  homeroomNote: string;
  pkl: string;
  extracurricular: string;
  homeroomTeacher: string;
  principalName: string;
  reportDate: string;
  version: number | null;
  endorsedAt: string | null;
};

const MISSING = "Belum tersedia";

export function draftPrintDocument(student: PreviewStudent, context: { className: string; curriculumLabel: string | null; periodName: string; yearName: string }): ReportPrintDocument {
  return {
    mode: "DRAFT",
    schoolName: field(student, "school"),
    npsn: field(student, "npsn"),
    address: field(student, "address"),
    curriculumLabel: context.curriculumLabel ?? MISSING,
    studentName: field(student, "student"),
    nis: field(student, "nis"),
    nisn: field(student, "nisn"),
    className: context.className || field(student, "class"),
    fase: field(student, "fase"),
    semester: field(student, "semester"),
    yearName: context.yearName || field(student, "year"),
    periodName: context.periodName || MISSING,
    subjects: student.subjects.map((subject) => ({
      name: subject.name,
      category: subject.category,
      teacherName: subject.teacherName ?? "Guru belum ditugaskan",
      score: subject.gradeStatus === "SIAP" && subject.score !== null ? String(subject.score) : gradeLabel(subject.gradeStatus),
      description: subject.description.status === "SIAP" && subject.description.text ? subject.description.text : subject.description.status === "PERLU_DITINJAU" ? "Perlu ditinjau ulang" : MISSING,
    })),
    sakit: count(student, "sakit"),
    izin: count(student, "izin"),
    alpa: count(student, "alpa"),
    attendanceCompleteness: student.attendance.completeness === "LENGKAP" ? "Lengkap" : student.attendance.completeness === "BELUM_LENGKAP" ? "Belum lengkap" : "Belum dikonfigurasi",
    homeroomNote: student.homeroomNote.status === "SIAP" && student.homeroomNote.text ? student.homeroomNote.text : MISSING,
    pkl: section(student, "pkl"),
    extracurricular: section(student, "extracurricular"),
    homeroomTeacher: field(student, "homeroom"),
    principalName: field(student, "principal"),
    reportDate: section(student, "reportDate"),
    version: null,
    endorsedAt: null,
  };
}

export function ReportPrintSheet({ document }: { document: ReportPrintDocument }) {
  const umum = document.subjects.filter((subject) => subject.category === "UMUM");
  const kejuruan = document.subjects.filter((subject) => subject.category === "KEJURUAN");
  return (
    <article className="report-print relative mx-auto hidden w-full max-w-[210mm] bg-white text-[12px] leading-snug text-slate-900 print:block">
      {document.mode === "DRAFT" ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[34px] font-bold tracking-wide text-rose-800/25 [transform:rotate(-32deg)] print:text-rose-800/30">
          DRAF — BELUM DISAHKAN
        </p>
      ) : null}
      <header className="border-b border-slate-400 pb-2 text-center">
        <h2 className="text-[16px] font-semibold">{document.schoolName}</h2>
        <p>NPSN {document.npsn}</p>
        <p>{document.address}</p>
        <p className="mt-1 text-[13px] font-semibold">{document.mode === "OFFICIAL" ? "LAPORAN HASIL BELAJAR" : "DRAF LAPORAN HASIL BELAJAR"}</p>
        <p>{document.curriculumLabel}</p>
      </header>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
        <Identity label="Nama" value={document.studentName} />
        <Identity label="NIS" value={document.nis} />
        <Identity label="NISN" value={document.nisn} />
        <Identity label="Kelas" value={document.className} />
        <Identity label="Fase" value={document.fase} />
        <Identity label="Semester" value={document.semester} />
        <Identity label="Tahun pelajaran" value={document.yearName} />
        <Identity label="Periode" value={document.periodName} />
      </dl>
      <SubjectGroup title="Kelompok umum" subjects={umum} />
      <SubjectGroup title="Kelompok kejuruan" subjects={kejuruan} />
      {document.subjects.length === 0 ? <p className="mt-3">Mata pelajaran belum tersedia.</p> : null}
      <section className="mt-4 break-inside-avoid">
        <h3 className="font-semibold">Ketidakhadiran</h3>
        <p>Sakit: {document.sakit} · Izin: {document.izin} · Alpa: {document.alpa}</p>
        <p className="text-slate-600">Kelengkapan: {document.attendanceCompleteness}</p>
      </section>
      <Block title="Catatan wali kelas" value={document.homeroomNote} />
      <Block title="PKL" value={document.pkl} />
      <Block title="Ekstrakurikuler" value={document.extracurricular} />
      <section className="mt-5 break-inside-avoid border-t border-slate-400 pt-3">
        <h3 className="font-semibold">Pengesahan</h3>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <Sign label="Wali kelas" value={document.homeroomTeacher} />
          <Sign label="Kepala sekolah" value={document.principalName} />
          <Sign label="Tanggal rapor" value={document.reportDate} />
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Tanda tangan tidak ditampilkan.</p>
      </section>
      {document.mode === "OFFICIAL" && document.version !== null && document.endorsedAt ? (
        <p className="mt-3 text-[10px] text-slate-600">Versi snapshot {document.version} · Disahkan {document.endorsedAt}</p>
      ) : null}
    </article>
  );
}

function Identity({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-200 py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function SubjectGroup({ title, subjects }: { title: string; subjects: ReportPrintDocument["subjects"] }) {
  if (subjects.length === 0) return null;
  return (
    <section className="mt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <table className="mt-1 w-full border-collapse text-left">
        <thead>
          <tr className="text-[10px] uppercase text-slate-500">
            <th className="w-[34%] py-1 pr-2">Mata pelajaran</th>
            <th className="w-[12%] py-1 pr-2">Nilai</th>
            <th className="py-1">Capaian kompetensi</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject) => (
            <tr key={`${subject.category}-${subject.name}`} className="break-inside-avoid border-t border-slate-200 align-top">
              <td className="py-1.5 pr-2"><p>{subject.name}</p><p className="text-[10px] text-slate-500">{subject.teacherName}</p></td>
              <td className="py-1.5 pr-2">{subject.score}</td>
              <td className="whitespace-pre-wrap py-1.5">{subject.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Block({ title, value }: { title: string; value: string }) {
  return (
    <section className="mt-3 break-inside-avoid">
      <h3 className="font-semibold">{title}</h3>
      <p className="whitespace-pre-wrap">{value}</p>
    </section>
  );
}

function Sign({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-12">{value}</p>
    </div>
  );
}

function field(student: PreviewStudent, key: string): string {
  const item = student.fields.find((fieldItem) => fieldItem.key === key);
  return item?.status === "SIAP" && item.value ? item.value : MISSING;
}

function section(student: PreviewStudent, key: string): string {
  const item = student.sections.find((sectionItem) => sectionItem.key === key);
  return item?.status === "SIAP" && item.value ? item.value : MISSING;
}

function count(student: PreviewStudent, key: "sakit" | "izin" | "alpa"): string {
  if (student.attendance.dataStatus !== "TERSEDIA" || student.attendance[key] === null) return "Belum ada data";
  return String(student.attendance[key]);
}

function gradeLabel(status: PreviewStudent["subjects"][number]["gradeStatus"]): string {
  if (status === "BELUM_LENGKAP") return "Belum lengkap";
  if (status === "BELUM_DIKONFIGURASI") return "Belum dikonfigurasi";
  if (status === "BELUM_DITUGASKAN") return "Belum ditugaskan";
  return MISSING;
}
