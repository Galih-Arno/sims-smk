export type ReportPrintSubject = {
  name: string;
  category: "UMUM" | "KEJURUAN";
  teacherName: string;
  score: string;
  description: string;
};

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
  subjects: ReportPrintSubject[];
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
const NO_ATTENDANCE = "Belum ada data";

export function presentOfficialSnapshot(payload: unknown, endorsement: { version: number; endorsedAt: Date }): ReportPrintDocument {
  const source = asRecord(payload);
  if (!source) throw new Error("SNAPSHOT_INVALID");
  const fields = asRecords(source.fields);
  const subjects = asRecords(source.subjects).flatMap(presentSubject);
  const attendance = asRecord(source.attendance);
  const note = asRecord(source.homeroomNote);
  const sections = asRecords(source.sections);
  return {
    mode: "OFFICIAL",
    schoolName: fieldValue(fields, "school"),
    npsn: fieldValue(fields, "npsn"),
    address: fieldValue(fields, "address"),
    curriculumLabel: text(source.curriculumLabel),
    studentName: fieldValue(fields, "student"),
    nis: fieldValue(fields, "nis"),
    nisn: fieldValue(fields, "nisn"),
    className: text(source.className) === MISSING ? fieldValue(fields, "class") : text(source.className),
    fase: fieldValue(fields, "fase"),
    semester: fieldValue(fields, "semester"),
    yearName: text(source.yearName) === MISSING ? fieldValue(fields, "year") : text(source.yearName),
    periodName: text(source.periodName),
    subjects,
    sakit: attendanceCount(attendance, "sakit"),
    izin: attendanceCount(attendance, "izin"),
    alpa: attendanceCount(attendance, "alpa"),
    attendanceCompleteness: completenessLabel(attendance?.completeness),
    homeroomNote: note?.status === "SIAP" ? text(note.text) : MISSING,
    pkl: sectionValue(sections, "pkl"),
    extracurricular: sectionValue(sections, "extracurricular"),
    homeroomTeacher: fieldValue(fields, "homeroom"),
    principalName: fieldValue(fields, "principal"),
    reportDate: sectionValue(sections, "reportDate"),
    version: endorsement.version,
    endorsedAt: formatJakarta(endorsement.endorsedAt),
  };
}

function presentSubject(subject: Record<string, unknown>): ReportPrintSubject[] {
  const category = subject.category === "UMUM" || subject.category === "KEJURUAN" ? subject.category : null;
  if (!category || typeof subject.name !== "string") return [];
  const description = subject.descriptionStatus === "SIAP"
    ? text(subject.descriptionText)
    : subject.descriptionStatus === "PERLU_DITINJAU"
      ? "Perlu ditinjau ulang"
      : MISSING;
  const score = subject.gradeStatus === "SIAP" && typeof subject.score === "number" ? String(subject.score) : gradeLabel(subject.gradeStatus);
  return [{
    name: subject.name,
    category,
    teacherName: text(subject.teacherName) === MISSING ? "Guru belum ditugaskan" : text(subject.teacherName),
    score,
    description,
  }];
}

function fieldValue(fields: Array<Record<string, unknown>>, key: string): string {
  const field = fields.find((item) => item.key === key);
  if (field?.status === "SIAP") return text(field.value);
  return MISSING;
}

function sectionValue(sections: Array<Record<string, unknown>>, key: string): string {
  const section = sections.find((item) => item.key === key);
  if (section?.status === "SIAP") return text(section.value);
  return MISSING;
}

function attendanceCount(attendance: Record<string, unknown> | null, key: "sakit" | "izin" | "alpa"): string {
  if (attendance?.dataStatus !== "TERSEDIA" || typeof attendance[key] !== "number") return NO_ATTENDANCE;
  return String(attendance[key]);
}

function completenessLabel(value: unknown): string {
  if (value === "LENGKAP") return "Lengkap";
  if (value === "BELUM_LENGKAP") return "Belum lengkap";
  return "Belum dikonfigurasi";
}

function gradeLabel(status: unknown): string {
  if (status === "BELUM_LENGKAP") return "Belum lengkap";
  if (status === "BELUM_DIKONFIGURASI") return "Belum dikonfigurasi";
  if (status === "BELUM_DITUGASKAN") return "Belum ditugaskan";
  return MISSING;
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : MISSING;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  }) : [];
}

function formatJakarta(value: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);
}
