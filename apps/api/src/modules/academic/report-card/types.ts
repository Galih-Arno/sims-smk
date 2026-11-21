export type ReportTextStatus = "SIAP" | "BELUM_TERSEDIA";
export type ReportGradeStatus = "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI" | "BELUM_DITUGASKAN";
export type ReportStudentStatus = "SIAP" | "BELUM_LENGKAP" | "BELUM_DIKONFIGURASI";

export type ReportTextField = {
  key: string;
  label: string;
  status: ReportTextStatus;
  value: string | null;
};

export type ReportSubjectLine = {
  subjectId: string;
  code: string;
  name: string;
  category: "UMUM" | "KEJURUAN";
  teacherName: string | null;
  gradeStatus: ReportGradeStatus;
  score: number | null;
  description: ReportDescription;
};

export type ReportDescription = {
  status: "SIAP" | "BELUM_TERSEDIA" | "PERLU_DITINJAU";
  text: string | null;
};

export type ReportHomeroomNote = {
  status: "SIAP" | "BELUM_TERSEDIA";
  text: string | null;
};

export type ReportAttendanceCompleteness = "BELUM_DIKONFIGURASI" | "LENGKAP" | "BELUM_LENGKAP";

export type ReportAttendanceCoverage = {
  completeness: ReportAttendanceCompleteness;
  finalDays: number;
  verifiedFrom: string | null;
  verifiedTo: string | null;
  requiredDays: number | null;
  finalRequiredDays: number;
  openRequiredDays: number | null;
};

export type ReportAttendance = ReportAttendanceCoverage & {
  dataStatus: "BELUM_ADA_DATA" | "TERSEDIA";
  sakit: number | null;
  izin: number | null;
  alpa: number | null;
  unverifiedDays: number | null;
};

export type PreparedStudentReport = {
  studentId: string;
  name: string;
  nis: string | null;
  status: ReportStudentStatus;
  siap: number;
  belumLengkap: number;
  fields: ReportTextField[];
  subjects: ReportSubjectLine[];
  attendance: ReportAttendance;
  homeroomNote: ReportHomeroomNote;
};

export type HomeroomReportPrepDto = {
  homerooms: Array<{ id: string; className: string; periodName: string }>;
  prep: {
    homeroomId: string;
    className: string;
    periodName: string;
    yearName: string;
    curriculumLabel: string | null;
    composer: "KURIKULUM_MERDEKA_SMK" | null;
    structureStatus: "TERSEDIA" | "BELUM_DIKONFIGURASI";
    attendance: ReportAttendanceCoverage;
    summary: { students: number; siap: number; belumLengkap: number; belumDikonfigurasi: number };
    students: PreparedStudentReport[];
  } | null;
};
