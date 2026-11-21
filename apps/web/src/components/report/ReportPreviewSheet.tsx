import type { ReactNode } from "react";

type Field = { key: string; label: string; status: "SIAP" | "BELUM_TERSEDIA"; value: string | null };
type Subject = {
  subjectId: string;
  name: string;
  category: "UMUM" | "KEJURUAN";
  teacherName: string | null;
  gradeStatus: "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI" | "BELUM_DITUGASKAN";
  score: number | null;
  description: { status: "SIAP" | "BELUM_TERSEDIA" | "PERLU_DITINJAU"; text: string | null };
};
type Attendance = {
  dataStatus: "BELUM_ADA_DATA" | "TERSEDIA";
  completeness: "BELUM_DIKONFIGURASI" | "LENGKAP" | "BELUM_LENGKAP";
  sakit: number | null;
  izin: number | null;
  alpa: number | null;
};
export type PreviewStudent = {
  studentId: string;
  name: string;
  nis: string | null;
  dataStatus: "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI";
  printStatus: "SIAP_CETAK" | "DRAF";
  printLabel: string;
  blockers: string[];
  fields: Field[];
  subjects: Subject[];
  attendance: Attendance;
  homeroomNote: { status: "SIAP" | "BELUM_TERSEDIA"; text: string | null };
  sections: Array<{ key: string; label: string; status: "SIAP" | "BELUM_TERSEDIA"; value: string | null }>;
};

const DATA_LABEL = { SIAP: "Siap", BELUM_LENGKAP: "Belum lengkap", BELUM_DIKONFIGURASI: "Belum dikonfigurasi" } as const;
const GRADE_LABEL = { SIAP: "Siap", BELUM_LENGKAP: "Belum lengkap", BELUM_DIKONFIGURASI: "Belum dikonfigurasi", BELUM_DITUGASKAN: "Belum ditugaskan" } as const;

export function ReportPreviewSheet({
  student,
  className,
  curriculumLabel,
  structureStatus,
}: {
  student: PreviewStudent;
  className: string;
  curriculumLabel: string | null;
  structureStatus: "TERSEDIA" | "BELUM_DIKONFIGURASI";
}) {
  const umum = student.subjects.filter((subject) => subject.category === "UMUM");
  const kejuruan = student.subjects.filter((subject) => subject.category === "KEJURUAN");
  const ready = student.printStatus === "SIAP_CETAK";
  return (
    <article className="mx-auto w-full max-w-[210mm] space-y-4 bg-white px-4 py-5 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:px-8 sm:py-7">
      <header className="space-y-1 border-b border-slate-300 pb-3 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Pratinjau rapor</p>
        <h2 className="text-base font-semibold">{valueOf(student.fields, "school")}</h2>
        <p className="text-xs text-slate-600">NPSN {valueOf(student.fields, "npsn")}</p>
        <p className="text-xs text-slate-600">{valueOf(student.fields, "address")}</p>
        <p className="pt-1 text-sm font-medium">{curriculumLabel ?? "Kurikulum belum tersedia"}</p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`rounded px-2 py-1 text-xs font-semibold ${ready ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{student.printLabel}</p>
        <p className="text-xs text-slate-600">Kesiapan data: {DATA_LABEL[student.dataStatus]}</p>
      </div>
      {structureStatus !== "TERSEDIA" ? <p className="text-xs text-amber-900">Struktur kurikulum kelas belum tersedia untuk rapor Kurikulum Merdeka.</p> : null}
      <Identity student={student} className={className} />
      <SubjectTable title="Kelompok umum" subjects={umum} />
      <SubjectTable title="Kelompok kejuruan" subjects={kejuruan} />
      {student.subjects.length === 0 ? <p className="text-sm text-slate-500">Mata pelajaran belum tersedia.</p> : null}
      <section className="grid gap-3 sm:grid-cols-2">
        <Box title="Ketidakhadiran">
          <p>Sakit: {count(student.attendance, "sakit")}</p>
          <p>Izin: {count(student.attendance, "izin")}</p>
          <p>Alpa: {count(student.attendance, "alpa")}</p>
          <p className="text-slate-500">Kelengkapan: {completeness(student.attendance.completeness)}</p>
        </Box>
        <Box title="Catatan wali kelas">
          <p className="whitespace-pre-wrap">{student.homeroomNote.status === "SIAP" && student.homeroomNote.text ? student.homeroomNote.text : "Belum tersedia"}</p>
        </Box>
        <Box title="PKL">
          <p>{sectionValue(student, "pkl")}</p>
        </Box>
        <Box title="Ekstrakurikuler">
          <p>{sectionValue(student, "extracurricular")}</p>
        </Box>
      </section>
      <section className="grid gap-3 border-t border-slate-300 pt-3 sm:grid-cols-3">
        <Endorsement label="Wali kelas" value={valueOf(student.fields, "homeroom")} />
        <Endorsement label="Kepala sekolah" value={valueOf(student.fields, "principal")} />
        <Endorsement label="Tanggal rapor" value={sectionValue(student, "reportDate")} />
      </section>
      <p className="text-[11px] text-slate-500">Pratinjau ini hanya untuk dibaca. Tanda tangan tidak ditampilkan.</p>
      {student.blockers.length > 0 ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-950">Belum siap cetak</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-950">
            {student.blockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function Identity({ student, className }: { student: PreviewStudent; className: string }) {
  const rows = [
    ["Nama", valueOf(student.fields, "student")],
    ["NIS", valueOf(student.fields, "nis")],
    ["NISN", valueOf(student.fields, "nisn")],
    ["Kelas", className || valueOf(student.fields, "class")],
    ["Fase", valueOf(student.fields, "fase")],
    ["Semester", valueOf(student.fields, "semester")],
    ["Tahun pelajaran", valueOf(student.fields, "year")],
    ["Konsentrasi", valueOf(student.fields, "concentration")],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 border-b border-slate-100 py-1 text-sm">
          <dt className="text-slate-500">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SubjectTable({ title, subjects }: { title: string; subjects: Subject[] }) {
  if (subjects.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1 pr-3">Mata pelajaran</th>
              <th className="py-1 pr-3">Nilai</th>
              <th className="py-1">Capaian kompetensi</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.subjectId} className="border-t border-slate-200 align-top">
                <td className="py-1.5 pr-3">
                  <p>{subject.name}</p>
                  <p className="text-xs text-slate-500">{subject.teacherName ?? "Guru belum ditugaskan"}</p>
                </td>
                <td className="py-1.5 pr-3">{subject.gradeStatus === "SIAP" && subject.score !== null ? subject.score : GRADE_LABEL[subject.gradeStatus]}</td>
                <td className="py-1.5 whitespace-pre-wrap">{descriptionText(subject.description)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 px-3 py-2 text-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-1 space-y-0.5">{children}</div>
    </section>
  );
}

function Endorsement({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-sm">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-6">{value}</p>
    </div>
  );
}

function valueOf(fields: Field[], key: string): string {
  const field = fields.find((item) => item.key === key);
  return field?.status === "SIAP" && field.value ? field.value : "Belum tersedia";
}

function sectionValue(student: PreviewStudent, key: string): string {
  const section = student.sections.find((item) => item.key === key);
  return section?.status === "SIAP" && section.value ? section.value : "Belum tersedia";
}

function descriptionText(description: Subject["description"]): string {
  if (description.status === "SIAP" && description.text) return description.text;
  if (description.status === "PERLU_DITINJAU") return "Perlu ditinjau ulang";
  return "Belum tersedia";
}

function count(attendance: Attendance, key: "sakit" | "izin" | "alpa"): string {
  if (attendance.dataStatus !== "TERSEDIA" || attendance[key] === null) return "Belum ada data";
  return String(attendance[key]);
}

function completeness(value: Attendance["completeness"]): string {
  if (value === "LENGKAP") return "Lengkap";
  if (value === "BELUM_LENGKAP") return "Belum lengkap";
  return "Belum dikonfigurasi";
}
