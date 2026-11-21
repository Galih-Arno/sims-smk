import type { ImportCommitDto, ImportPreviewDto, ImportPreviewRow } from "@sims/shared";
import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import { auditChange } from "./common.ts";
import { parseTabular } from "./import.service.ts";

type PlanKind = "objective" | "scope";

export const OBJECTIVE_TEMPLATE = "kelas,mapel,semester,kode,deskripsi\nX TKJ 1,MTK,2026/2027 Ganjil,TP1,Siswa mampu menjelaskan konsep dasar\n";
export const SCOPE_TEMPLATE = "kelas,mapel,semester,kode,deskripsi\nX TKJ 1,MTK,2026/2027 Ganjil,LM1,Konsep dasar dan latihan terarah\n";

type Catalog = {
  classes: { id: string; name: string; academicYearId: string }[];
  subjects: { id: string; code: string; name: string }[];
  periods: { id: string; name: string; academicYearId: string | null }[];
  assignments: { id: string; classId: string; subjectId: string; academicPeriodId: string; teacherId: string }[];
  codes: Set<string>;
};

function sameText(left: string, right: string) {
  return left.trim().toLocaleLowerCase("id-ID") === right.trim().toLocaleLowerCase("id-ID");
}

function previewRow(rowNumber: number, data: Record<string, string>, errors: string[]): ImportPreviewRow {
  return { rowNumber, data, errors, valid: errors.length === 0 };
}

async function loadCatalog(prisma: PrismaClient, schoolId: string, kind: PlanKind): Promise<Catalog> {
  const [classes, subjects, periods, assignments, items] = await Promise.all([
    prisma.schoolClass.findMany({ where: { schoolId }, select: { id: true, name: true, academicYearId: true } }),
    prisma.subject.findMany({ where: { schoolId }, select: { id: true, code: true, name: true } }),
    prisma.academicPeriod.findMany({ where: { schoolId }, select: { id: true, name: true, academicYearId: true } }),
    prisma.teachingAssignment.findMany({
      where: { schoolId },
      select: { id: true, classId: true, subjectId: true, academicPeriodId: true, teacherId: true },
    }),
    kind === "objective"
      ? prisma.learningObjective.findMany({ where: { schoolId }, select: { teachingAssignmentId: true, code: true } })
      : prisma.materialScope.findMany({ where: { schoolId }, select: { teachingAssignmentId: true, code: true } }),
  ]);
  return {
    classes,
    subjects,
    periods,
    assignments,
    codes: new Set(items.map((item) => `${item.teachingAssignmentId}:${item.code.toUpperCase()}`)),
  };
}

function annotateRows(catalog: Catalog, rows: Record<string, string>[], actorTeacherId: string | null): Array<ImportPreviewRow & { assignmentId?: string; curriculumYearId?: string | null; classId?: string; subjectId?: string }> {
  const seen = new Set<string>();
  return rows.map((data, index) => {
    const errors: string[] = [];
    const kelas = data.kelas?.trim() ?? "";
    const mapel = data.mapel?.trim() ?? "";
    const semester = data.semester?.trim() ?? "";
    const code = data.kode?.trim().toUpperCase() ?? "";
    const description = data.deskripsi?.trim() ?? "";
    if (!kelas) errors.push("Kelas wajib diisi.");
    if (!mapel) errors.push("Mata pelajaran wajib diisi.");
    if (!semester) errors.push("Semester wajib diisi.");
    if (!code) errors.push("Kode wajib diisi.");
    if (code.length > 32) errors.push("Kode maksimal 32 karakter.");
    if (description.length < 3) errors.push("Deskripsi minimal 3 karakter.");
    if (description.length > 1000) errors.push("Deskripsi maksimal 1000 karakter.");

    const periodMatches = catalog.periods.filter((item) => sameText(item.name, semester));
    const period = periodMatches.length === 1 ? periodMatches[0] : undefined;
    if (semester && periodMatches.length === 0) errors.push("Semester tidak ditemukan.");
    if (periodMatches.length > 1) errors.push("Nama semester tidak unik.");

    const classMatches = catalog.classes.filter(
      (item) => sameText(item.name, kelas) && (!period?.academicYearId || item.academicYearId === period.academicYearId),
    );
    const schoolClass = classMatches.length === 1 ? classMatches[0] : undefined;
    if (kelas && period && classMatches.length === 0) errors.push("Kelas tidak ditemukan pada tahun pelajaran semester ini.");
    if (classMatches.length > 1) errors.push("Nama kelas tidak unik pada tahun pelajaran ini.");

    const codeMatches = catalog.subjects.filter((item) => item.code.toUpperCase() === mapel.toUpperCase());
    const nameMatches = catalog.subjects.filter((item) => sameText(item.name, mapel));
    const subjectMatches = codeMatches.length > 0 ? codeMatches : nameMatches;
    const subject = subjectMatches.length === 1 ? subjectMatches[0] : undefined;
    if (mapel && subjectMatches.length === 0) errors.push("Mata pelajaran tidak ditemukan.");
    if (subjectMatches.length > 1) errors.push("Nama mata pelajaran tidak unik.");

    const assignment =
      schoolClass && subject && period
        ? catalog.assignments.find(
            (item) => item.classId === schoolClass.id && item.subjectId === subject.id && item.academicPeriodId === period.id,
          )
        : undefined;
    if (schoolClass && subject && period && !assignment) errors.push("Penugasan guru untuk kelas, mapel, dan semester ini tidak ditemukan.");
    if (assignment && actorTeacherId && assignment.teacherId !== actorTeacherId) errors.push("Penugasan ini bukan milik Anda.");
    if (assignment && code) {
      const key = `${assignment.id}:${code}`;
      if (seen.has(key)) errors.push("Kode duplikat di dalam berkas.");
      seen.add(key);
      if (catalog.codes.has(key)) errors.push("Kode sudah digunakan pada penugasan ini.");
    }
    return {
      ...previewRow(index + 2, { ...data, kode: code }, errors),
      assignmentId: assignment?.id,
      curriculumYearId: period?.academicYearId ?? null,
      classId: schoolClass?.id,
      subjectId: subject?.id,
    };
  });
}

function summarize(rows: ImportPreviewRow[]): ImportPreviewDto {
  const validCount = rows.filter((row) => row.valid).length;
  return { rows, validCount, invalidCount: rows.length - validCount };
}

async function parsedRows(filename: string, buffer: Buffer) {
  const parsed = await parseTabular(filename, buffer);
  if (parsed.length === 0) throw new AppError(400, "VALIDATION_ERROR", "Berkas tidak memiliki data.");
  if (parsed.length > 500) throw new AppError(400, "VALIDATION_ERROR", "Impor dibatasi 500 baris.");
  return parsed;
}

export async function previewPlanImport(
  prisma: PrismaClient,
  schoolId: string,
  kind: PlanKind,
  filename: string,
  buffer: Buffer,
  actorTeacherId: string | null,
): Promise<ImportPreviewDto> {
  const catalog = await loadCatalog(prisma, schoolId, kind);
  return summarize(annotateRows(catalog, await parsedRows(filename, buffer), actorTeacherId));
}

export async function commitPlanImport(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  kind: PlanKind,
  rows: Record<string, string>[],
  meta: RequestMeta,
  actorTeacherId: string | null,
): Promise<ImportCommitDto> {
  if (rows.length > 500) throw new AppError(400, "VALIDATION_ERROR", "Impor dibatasi 500 baris.");
  const catalog = await loadCatalog(prisma, schoolId, kind);
  const annotated = annotateRows(catalog, rows, actorTeacherId);
  const sequenceByAssignment = new Map<string, number>();
  let created = 0;
  for (const row of annotated) {
    if (!row.valid || !row.assignmentId || !row.classId || !row.subjectId) continue;
    let sequence = sequenceByAssignment.get(row.assignmentId);
    if (sequence === undefined) {
      const aggregate =
        kind === "objective"
          ? await prisma.learningObjective.aggregate({ where: { teachingAssignmentId: row.assignmentId }, _max: { sequence: true } })
          : await prisma.materialScope.aggregate({ where: { teachingAssignmentId: row.assignmentId }, _max: { sequence: true } });
      sequence = aggregate._max.sequence ?? 0;
    }
    sequence += 1;
    sequenceByAssignment.set(row.assignmentId, sequence);
    const placement = row.curriculumYearId
      ? await prisma.curriculumPlacement.findFirst({
          where: {
            schoolId,
            classId: row.classId,
            subjectId: row.subjectId,
            curriculum: { academicYearId: row.curriculumYearId, isActive: true },
          },
          orderBy: { createdAt: "asc" },
          select: { curriculumId: true },
        })
      : null;
    const data = {
      schoolId,
      teachingAssignmentId: row.assignmentId,
      curriculumId: placement?.curriculumId ?? null,
      code: row.data.kode?.trim().toUpperCase() ?? "",
      description: row.data.deskripsi?.trim() ?? "",
      sequence,
    };
    if (kind === "objective") await prisma.learningObjective.create({ data });
    else await prisma.materialScope.create({ data });
    catalog.codes.add(`${row.assignmentId}:${data.code}`);
    created += 1;
  }
  await auditChange(prisma, auth, meta, {
    schoolId,
    action: kind === "objective" ? "OBJECTIVES_IMPORTED" : "SCOPES_IMPORTED",
    entityType: kind === "objective" ? "LearningObjective" : "MaterialScope",
  });
  return {
    created,
    skipped: annotated.length - created,
    rows: annotated.map(({ rowNumber, data, errors, valid }) => ({ rowNumber, data, errors, valid })),
  };
}
