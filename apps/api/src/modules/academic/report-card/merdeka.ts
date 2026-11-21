import type { DailyAttendanceRead } from "./attendance.ts";
import { studentAttendance } from "./attendance.ts";
import type { PreparedStudentReport, ReportDescription, ReportGradeStatus, ReportHomeroomNote, ReportSubjectLine, ReportTextField } from "./types.ts";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export type MerdekaGrade = { status: "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI"; score: number | null };

export type MerdekaSubjectInput = {
  subjectId: string;
  code: string;
  name: string;
  category: "UMUM" | "KEJURUAN";
  teacherName: string | null;
  grades: Map<string, MerdekaGrade> | null;
  descriptions: Map<string, ReportDescription>;
};

export type MerdekaComposeInput = {
  school: { name: string; npsn: string; address: string | null; city: string | null; province: string | null; accreditation: string | null; principalName: string | null };
  term: { yearName: string; periodName: string; semester: string | null; className: string; concentration: string | null; homeroomTeacher: string; fase: string | null };
  curriculumLabel: string;
  students: Array<{
    id: string;
    name: string;
    nisn: string;
    nis: string | null;
    gender: "LAKI_LAKI" | "PEREMPUAN";
    birthPlace: string | null;
    birthDate: Date | null;
    concentration: string | null;
  }>;
  subjects: MerdekaSubjectInput[];
  attendance: DailyAttendanceRead;
  notes: Map<string, ReportHomeroomNote>;
};

export function supportsMerdeka(curriculum: { code: string; name: string }): boolean {
  const text = `${curriculum.code} ${curriculum.name}`.toLowerCase();
  return text.includes("kumer") || text.includes("merdeka");
}

export function composeMerdekaReport(input: MerdekaComposeInput): PreparedStudentReport[] {
  const subjects = [...input.subjects].sort((left, right) => {
    if (left.category !== right.category) return left.category === "UMUM" ? -1 : 1;
    return left.name.localeCompare(right.name, "id");
  });
  return input.students.map((student) => {
    const lines = subjects.map((subject) => subjectLine(student.id, subject));
    const siap = lines.filter((item) => item.gradeStatus === "SIAP").length;
    const belumLengkap = lines.filter((item) => item.gradeStatus !== "SIAP").length;
    const attendance = studentAttendance(input.attendance, student.id);
    return {
      studentId: student.id,
      name: student.name,
      nis: student.nis,
      status: reportStatus(lines, attendance.completeness),
      siap,
      belumLengkap,
      fields: identityFields(input, student),
      subjects: lines,
      attendance,
      homeroomNote: input.notes.get(student.id) ?? { status: "BELUM_TERSEDIA", text: null },
    };
  });
}

function subjectLine(studentId: string, subject: MerdekaSubjectInput): ReportSubjectLine {
  const grade = resolveGrade(studentId, subject);
  return {
    subjectId: subject.subjectId,
    code: subject.code,
    name: subject.name,
    category: subject.category,
    teacherName: subject.teacherName,
    gradeStatus: grade.status,
    score: grade.score,
    description: subject.descriptions.get(studentId) ?? { status: "BELUM_TERSEDIA", text: null },
  };
}

function resolveGrade(studentId: string, subject: MerdekaSubjectInput): { status: ReportGradeStatus; score: number | null } {
  if (!subject.grades) return { status: "BELUM_DITUGASKAN", score: null };
  const grade = subject.grades.get(studentId);
  if (!grade || grade.status === "BELUM_DIKONFIGURASI") return { status: "BELUM_DIKONFIGURASI", score: null };
  if (grade.status === "SIAP") return { status: "SIAP", score: grade.score };
  return { status: "BELUM_LENGKAP", score: null };
}

function rollup(subjects: ReportSubjectLine[]): PreparedStudentReport["status"] {
  if (subjects.length === 0 || subjects.every((item) => item.gradeStatus === "BELUM_DIKONFIGURASI")) return "BELUM_DIKONFIGURASI";
  if (subjects.every((item) => item.gradeStatus === "SIAP")) return "SIAP";
  return "BELUM_LENGKAP";
}

function reportStatus(subjects: ReportSubjectLine[], completeness: DailyAttendanceRead["coverage"]["completeness"]): PreparedStudentReport["status"] {
  const grades = rollup(subjects);
  if (grades !== "SIAP") return grades;
  if (completeness !== "LENGKAP") return "BELUM_LENGKAP";
  return "SIAP";
}

function identityFields(input: MerdekaComposeInput, student: MerdekaComposeInput["students"][number]): ReportTextField[] {
  const concentration = student.concentration ?? input.term.concentration;
  return [
    textField("school", "Sekolah", input.school.name),
    textField("npsn", "NPSN", input.school.npsn),
    textField("address", "Alamat", input.school.address),
    textField("city", "Kota", input.school.city),
    textField("province", "Provinsi", input.school.province),
    textField("accreditation", "Akreditasi", input.school.accreditation),
    textField("principal", "Kepala sekolah", input.school.principalName),
    textField("student", "Nama siswa", student.name),
    textField("nisn", "NISN", student.nisn),
    textField("nis", "NIS", student.nis),
    textField("gender", "Jenis kelamin", student.gender === "PEREMPUAN" ? "Perempuan" : "Laki-laki"),
    textField("birthPlace", "Tempat lahir", student.birthPlace),
    textField("birthDate", "Tanggal lahir", formatDate(student.birthDate)),
    textField("year", "Tahun pelajaran", input.term.yearName),
    textField("semester", "Semester", input.term.semester),
    textField("class", "Kelas", input.term.className),
    textField("concentration", "Konsentrasi keahlian", concentration),
    textField("fase", "Fase", input.term.fase),
    textField("homeroom", "Wali kelas", input.term.homeroomTeacher),
    textField("curriculum", "Kurikulum", input.curriculumLabel),
  ];
}

function textField(key: string, label: string, value: string | null | undefined): ReportTextField {
  const text = value?.trim() ?? "";
  if (!text) return { key, label, status: "BELUM_TERSEDIA", value: null };
  return { key, label, status: "SIAP", value: text };
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return `${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}
