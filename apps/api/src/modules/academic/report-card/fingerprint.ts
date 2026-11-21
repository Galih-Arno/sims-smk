import { createHash } from "node:crypto";
import type { ReportPreviewDto } from "./preview.ts";

export type PreviewContext = NonNullable<ReportPreviewDto["preview"]>;
export type PreviewStudent = PreviewContext["students"][number];

export function reportFingerprint(context: Pick<PreviewContext, "className" | "yearName" | "periodName" | "curriculumLabel" | "composer">, student: PreviewStudent): string {
  const canonical = canonicalReport(context, student);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function snapshotPayload(
  context: Pick<PreviewContext, "className" | "yearName" | "periodName" | "curriculumLabel" | "composer">,
  student: PreviewStudent,
  endorsement: { version: number; endorsedAt: string; endorsedById: string },
) {
  return {
    ...canonicalReport(context, student),
    version: endorsement.version,
    endorsedAt: endorsement.endorsedAt,
    endorsedById: endorsement.endorsedById,
  };
}

function canonicalReport(context: Pick<PreviewContext, "className" | "yearName" | "periodName" | "curriculumLabel" | "composer">, student: PreviewStudent) {
  return {
    className: context.className,
    yearName: context.yearName,
    periodName: context.periodName,
    curriculumLabel: context.curriculumLabel,
    composer: context.composer,
    studentId: student.studentId,
    name: student.name,
    nis: student.nis,
    printStatus: student.printStatus,
    fields: student.fields.map((field) => ({ key: field.key, status: field.status, value: field.value })),
    subjects: student.subjects.map((subject) => ({
      subjectId: subject.subjectId,
      code: subject.code,
      name: subject.name,
      category: subject.category,
      teacherName: subject.teacherName,
      gradeStatus: subject.gradeStatus,
      score: subject.score,
      descriptionStatus: subject.description.status,
      descriptionText: subject.description.text,
    })),
    attendance: {
      dataStatus: student.attendance.dataStatus,
      completeness: student.attendance.completeness,
      sakit: student.attendance.sakit,
      izin: student.attendance.izin,
      alpa: student.attendance.alpa,
    },
    homeroomNote: { status: student.homeroomNote.status, text: student.homeroomNote.text },
    sections: student.sections.map((section) => ({ key: section.key, status: section.status, value: section.value })),
  };
}
