import type { PreparedStudentReport, ReportAttendance, ReportHomeroomNote, ReportSubjectLine, ReportTextField } from "./types.ts";

export type PrintComponentStatus = "SIAP" | "BELUM_TERSEDIA" | "BELUM_LENGKAP" | "PERLU_DITINJAU";

export type PrintSection = {
  key: string;
  label: string;
  status: "SIAP" | "BELUM_TERSEDIA";
  value: string | null;
};

export type PrintReadiness = {
  printStatus: "SIAP_CETAK" | "DRAF";
  printLabel: "SIAP CETAK" | "DRAF / BELUM LENGKAP";
  blockers: string[];
};

const REQUIRED_FIELDS = ["school", "npsn", "address", "student", "nisn", "nis", "year", "semester", "class", "fase", "homeroom", "principal"] as const;

export function assessPrintReadiness(
  student: Pick<PreparedStudentReport, "fields" | "subjects" | "attendance" | "homeroomNote">,
  structureStatus: "TERSEDIA" | "BELUM_DIKONFIGURASI",
  sections: PrintSection[],
): PrintReadiness {
  const blockers: string[] = [];
  if (structureStatus !== "TERSEDIA") blockers.push("Struktur kurikulum belum tersedia.");
  for (const key of REQUIRED_FIELDS) {
    const item = student.fields.find((field) => field.key === key);
    if (!isReadyField(item)) blockers.push(`${item?.label ?? key} belum tersedia.`);
  }
  if (student.subjects.length === 0) blockers.push("Mata pelajaran kurikulum belum tersedia.");
  for (const subject of student.subjects) blockers.push(...subjectBlockers(subject));
  blockers.push(...attendanceBlockers(student.attendance));
  blockers.push(...noteBlockers(student.homeroomNote));
  for (const section of sections) {
    if (section.status !== "SIAP" || !section.value?.trim()) blockers.push(`${section.label} belum tersedia.`);
  }
  if (blockers.length > 0) return { printStatus: "DRAF", printLabel: "DRAF / BELUM LENGKAP", blockers };
  return { printStatus: "SIAP_CETAK", printLabel: "SIAP CETAK", blockers: [] };
}

function isReadyField(field: ReportTextField | undefined): boolean {
  return field?.status === "SIAP" && Boolean(field.value?.trim());
}

function subjectBlockers(subject: ReportSubjectLine): string[] {
  const blockers: string[] = [];
  if (subject.gradeStatus !== "SIAP" || subject.score === null) blockers.push(`Nilai akhir ${subject.name} belum lengkap.`);
  if (subject.description.status === "PERLU_DITINJAU") blockers.push(`Deskripsi ${subject.name} perlu ditinjau ulang.`);
  else if (subject.description.status !== "SIAP" || !subject.description.text?.trim()) blockers.push(`Deskripsi ${subject.name} belum tersedia.`);
  return blockers;
}

function attendanceBlockers(attendance: ReportAttendance): string[] {
  const blockers: string[] = [];
  if (attendance.dataStatus !== "TERSEDIA") blockers.push("Absensi harian belum ada data.");
  if (attendance.completeness === "BELUM_DIKONFIGURASI") blockers.push("Kelengkapan absensi belum dikonfigurasi.");
  else if (attendance.completeness !== "LENGKAP") blockers.push("Kelengkapan absensi belum lengkap.");
  return blockers;
}

function noteBlockers(note: ReportHomeroomNote): string[] {
  if (note.status === "SIAP" && note.text?.trim()) return [];
  return ["Catatan wali kelas belum final."];
}
