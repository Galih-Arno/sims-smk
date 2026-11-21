import type { HomeroomReportPrepDto, PreparedStudentReport, ReportTextField } from "./types.ts";
import { assessPrintReadiness, type PrintReadiness, type PrintSection } from "./print-readiness.ts";

const UNSOURCED_SECTIONS: PrintSection[] = [
  { key: "pkl", label: "PKL", status: "BELUM_TERSEDIA", value: null },
  { key: "extracurricular", label: "Ekstrakurikuler", status: "BELUM_TERSEDIA", value: null },
  { key: "reportDate", label: "Tanggal rapor", status: "BELUM_TERSEDIA", value: null },
];

export type ReportPreviewStudent = {
  studentId: string;
  name: string;
  nis: string | null;
  dataStatus: PreparedStudentReport["status"];
  printStatus: PrintReadiness["printStatus"];
  printLabel: PrintReadiness["printLabel"];
  blockers: string[];
  fields: ReportTextField[];
  subjects: PreparedStudentReport["subjects"];
  attendance: PreparedStudentReport["attendance"];
  homeroomNote: PreparedStudentReport["homeroomNote"];
  sections: PrintSection[];
};

export type ReportPreviewDto = {
  homerooms: HomeroomReportPrepDto["homerooms"];
  preview: null | {
    homeroomId: string;
    className: string;
    periodName: string;
    yearName: string;
    curriculumLabel: string | null;
    composer: "KURIKULUM_MERDEKA_SMK" | null;
    structureStatus: "TERSEDIA" | "BELUM_DIKONFIGURASI";
    students: ReportPreviewStudent[];
  };
};

export function buildReportPreview(
  prep: NonNullable<HomeroomReportPrepDto["prep"]>,
  sectionsByStudent: ReadonlyMap<string, PrintSection[]> = new Map(),
): NonNullable<ReportPreviewDto["preview"]> {
  return {
    homeroomId: prep.homeroomId,
    className: prep.className,
    periodName: prep.periodName,
    yearName: prep.yearName,
    curriculumLabel: prep.curriculumLabel,
    composer: prep.composer,
    structureStatus: prep.structureStatus,
    students: prep.students.map((student) => {
      const sections = sectionsByStudent.get(student.studentId) ?? UNSOURCED_SECTIONS;
      const readiness = assessPrintReadiness(student, prep.structureStatus, sections);
      return {
        studentId: student.studentId,
        name: student.name,
        nis: student.nis,
        dataStatus: student.status,
        printStatus: readiness.printStatus,
        printLabel: readiness.printLabel,
        blockers: readiness.blockers,
        fields: student.fields,
        subjects: student.subjects,
        attendance: student.attendance,
        homeroomNote: student.homeroomNote,
        sections,
      };
    }),
  };
}
