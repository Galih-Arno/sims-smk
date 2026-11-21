import type { ImportCommitDto, ImportPreviewDto, ImportPreviewRow, ImportRowStatus } from "@sims/shared";
import ExcelJS from "exceljs";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import { auditChange, parseDateOnly } from "./common.ts";

type Kind = "teacher" | "student";
type Db = PrismaClient | Prisma.TransactionClient;

export type ImportSourceRow = {
  rowNumber: number;
  data: Record<string, string>;
};

const TEACHER_ROW_LIMIT = 500;
const STUDENT_ROW_LIMIT = 1000;
const STUDENT_HEADERS = ["nisn", "nama", "jenis_kelamin"] as const;

const HEADER_ALIASES: Record<string, string> = {
  nama: "nama",
  name: "nama",
  nama_lengkap: "nama",
  jenis_kelamin: "jenis_kelamin",
  jk: "jenis_kelamin",
  gender: "jenis_kelamin",
  telepon: "telepon",
  phone: "telepon",
  no_hp: "telepon",
  tempat_lahir: "tempat_lahir",
  tanggal_lahir: "tanggal_lahir",
  tgl_lahir: "tanggal_lahir",
  nip: "nip",
  nuptk: "nuptk",
  email: "email",
  nisn: "nisn",
  nis: "nis",
  kelas: "kelas",
  rombel: "kelas",
};

export const TEACHER_TEMPLATE = "nip,nama,jenis_kelamin,email,telepon,nuptk\n";
export const STUDENT_TEMPLATE = "\uFEFFNISN,NIS,Nama Lengkap,Jenis Kelamin,Tempat Lahir,Tanggal Lahir,Kelas,Email,Telepon\n";

const STUDENT_COLUMNS = ["NISN", "NIS", "Nama Lengkap", "Jenis Kelamin", "Tempat Lahir", "Tanggal Lahir", "Kelas", "Email", "Telepon"] as const;

function normalizeHeader(value: string): string {
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[key] ?? key;
}

function identifier(value: string): string {
  return value.trim().replace(/^'+/, "");
}

type CsvLine = { line: number; cells: string[] };

export function parseCsv(text: string): { headers: string[]; rows: ImportSourceRow[] } {
  const source = text.replace(/^\uFEFF/, "");
  const table: CsvLine[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      table.push({ line: rowLine, cells: row });
      row = [];
      cell = "";
      line += 1;
      rowLine = line;
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    table.push({ line: rowLine, cells: row });
  }
  const filled = table.filter((entry) => entry.cells.some((column) => column !== ""));
  const header = filled.shift();
  if (!header) return { headers: [], rows: [] };
  const headers = header.cells.map(normalizeHeader);
  return {
    headers,
    rows: filled.map((entry) => {
      const data: Record<string, string> = {};
      headers.forEach((key, columnIndex) => {
        if (key && data[key] === undefined) data[key] = entry.cells[columnIndex] ?? "";
      });
      return { rowNumber: entry.line, data };
    }),
  };
}

function calendarDate(value: Date): string {
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  const day = value.getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cellString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) {
    const text = dateOf(cell.text?.trim() ?? "");
    return text ?? calendarDate(value);
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    const text = cell.text?.trim() ?? "";
    return text || String(value);
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("").trim();
    }
    if ("result" in value) {
      const result = value.result;
      if (result instanceof Date) return dateOf(cell.text?.trim() ?? "") ?? calendarDate(result);
      if (result == null) return "";
      if (typeof result === "number" && Number.isInteger(result)) return String(result);
      return String(result).trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
  }
  return (cell.text ?? "").trim();
}

async function readTabular(filename: string, buffer: Buffer): Promise<{ headers: string[]; rows: ImportSourceRow[] }> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return parseCsv(buffer.toString("utf8"));
  if (!lower.endsWith(".xlsx")) {
    throw new AppError(400, "VALIDATION_ERROR", "Berkas harus berformat XLSX atau CSV.");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "VALIDATION_ERROR", "Berkas Excel tidak dapat dibaca. Gunakan template XLSX atau CSV UTF-8.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = normalizeHeader(cellString(cell));
  });
  const rows: ImportSourceRow[] = [];
  sheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const data: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((key, column) => {
      if (!key || data[key] !== undefined) return;
      const value = cellString(excelRow.getCell(column));
      if (value) hasValue = true;
      data[key] = value;
    });
    if (hasValue) rows.push({ rowNumber, data });
  });
  return { headers: headers.filter((key) => Boolean(key)), rows };
}

export async function parseTabular(filename: string, buffer: Buffer): Promise<Record<string, string>[]> {
  return (await readTabular(filename, buffer)).rows.map((row) => row.data);
}

function genderOf(value: string): "LAKI_LAKI" | "PEREMPUAN" | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, " ");
  if (["l", "laki laki", "pria", "laki_laki"].includes(normalized)) return "LAKI_LAKI";
  if (["p", "perempuan", "wanita"].includes(normalized)) return "PEREMPUAN";
  return null;
}

function dateOf(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  let iso = "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) iso = text;
  else {
    const match = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(text);
    if (!match) return null;
    iso = `${match[3]}-${match[2]}-${match[1]}`;
  }
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return iso;
}

function rowStatus(errors: string[]): ImportRowStatus {
  if (errors.length === 0) return "VALID";
  const duplicate = errors.every((error) => /duplikat|sudah digunakan/i.test(error));
  return duplicate ? "DUPLIKAT" : "GAGAL";
}

function previewRow(rowNumber: number, data: Record<string, string>, errors: string[]): ImportPreviewRow {
  return { rowNumber, data, errors, valid: errors.length === 0, status: rowStatus(errors) };
}

function summarize(rows: ImportPreviewRow[]): ImportPreviewDto {
  const validCount = rows.filter((row) => row.valid).length;
  const duplicateCount = rows.filter((row) => row.status === "DUPLIKAT").length;
  const failedCount = rows.filter((row) => !row.valid && row.status !== "DUPLIKAT").length;
  return {
    rows,
    totalCount: rows.length,
    validCount,
    invalidCount: rows.length - validCount,
    duplicateCount,
    failedCount,
  };
}

function assertStudentHeaders(headers: string[]): void {
  const present = new Set(headers);
  const missing = STUDENT_HEADERS.filter((key) => !present.has(key));
  if (missing.length > 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Format berkas tidak sesuai. Gunakan template siswa. Kolom wajib: NISN, Nama Lengkap, dan Jenis Kelamin.",
    );
  }
}

async function annotateTeachers(prisma: Db, schoolId: string, rows: ImportSourceRow[]): Promise<ImportPreviewRow[]> {
  const seen = new Set<string>();
  const annotated: ImportPreviewRow[] = [];
  for (const source of rows) {
    const data = source.data;
    const errors: string[] = [];
    const gender = genderOf(data.jenis_kelamin ?? "");
    if (!data.nama?.trim()) errors.push("Nama wajib diisi.");
    if (!gender) errors.push("Jenis kelamin harus L atau P.");
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push("Email tidak valid.");
    const nip = data.nip?.trim() ?? "";
    if (nip && !/^\d{8,18}$/.test(nip)) errors.push("NIP harus 8–18 digit.");
    if (nip) {
      const key = `nip:${nip}`;
      if (seen.has(key)) errors.push("NIP duplikat di dalam berkas.");
      seen.add(key);
      const exists = await prisma.teacher.findFirst({ where: { schoolId, nip }, select: { id: true } });
      if (exists) errors.push("NIP sudah digunakan di sekolah ini.");
    }
    if (data.nuptk && !/^\d+$/.test(data.nuptk)) errors.push("NUPTK harus berupa angka.");
    annotated.push(previewRow(source.rowNumber, data, errors));
  }
  return annotated;
}

type ClassMap = Map<string, string>;

async function loadClassMap(prisma: Db, schoolId: string, academicYearId: string | null): Promise<ClassMap | null> {
  if (!academicYearId) return null;
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true } });
  if (!year) throw new AppError(400, "VALIDATION_ERROR", "Tahun pelajaran tidak ditemukan di sekolah ini.");
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId, academicYearId, isActive: true },
    select: { id: true, name: true },
  });
  const map: ClassMap = new Map();
  for (const item of classes) {
    const key = item.name.trim().toLocaleLowerCase("id-ID");
    const current = map.get(key);
    if (current && current !== item.id) map.set(key, "");
    else map.set(key, item.id);
  }
  return map;
}

function studentPayload(raw: Record<string, string>): Record<string, string> {
  const birth = dateOf(raw.tanggal_lahir ?? "");
  return {
    ...raw,
    nisn: identifier(raw.nisn ?? ""),
    nis: identifier(raw.nis ?? ""),
    nama: (raw.nama ?? "").trim(),
    jenis_kelamin: (raw.jenis_kelamin ?? "").trim(),
    tempat_lahir: (raw.tempat_lahir ?? "").trim(),
    tanggal_lahir: birth ?? (raw.tanggal_lahir ?? "").trim(),
    kelas: (raw.kelas ?? "").trim(),
    email: (raw.email ?? "").trim().toLowerCase(),
    telepon: (raw.telepon ?? "").trim(),
  };
}

async function annotateStudents(
  prisma: Db,
  schoolId: string,
  rows: ImportSourceRow[],
  academicYearId: string | null,
): Promise<{ rows: ImportPreviewRow[]; classIds: Map<number, string | null> }> {
  const prepared = rows.map((source) => ({ rowNumber: source.rowNumber, data: studentPayload(source.data) }));
  const nisnKeys = [...new Set(prepared.flatMap((row) => {
    const nisn = row.data.nisn ?? "";
    return /^\d{10}$/.test(nisn) ? [nisn] : [];
  }))];
  const nisKeys = [...new Set(prepared.flatMap((row) => {
    const nis = row.data.nis ?? "";
    return nis.length > 0 && nis.length <= 32 ? [nis] : [];
  }))];
  const [existingNisn, existingNis, classMap] = await Promise.all([
    nisnKeys.length
      ? prisma.student.findMany({ where: { nisn: { in: nisnKeys } }, select: { nisn: true } })
      : Promise.resolve([]),
    nisKeys.length
      ? prisma.student.findMany({ where: { schoolId, nis: { in: nisKeys } }, select: { nis: true } })
      : Promise.resolve([]),
    loadClassMap(prisma, schoolId, academicYearId),
  ]);
  const nisnUsed = new Set(existingNisn.map((row) => row.nisn));
  const nisUsed = new Set(existingNis.map((row) => row.nis).filter((value): value is string => Boolean(value)));
  const seenNisn = new Set<string>();
  const seenNis = new Set<string>();
  const classIds = new Map<number, string | null>();
  const annotated = prepared.map((source) => {
    const data = source.data;
    const errors: string[] = [];
    const name = data.nama ?? "";
    if (!name) errors.push("Nama wajib diisi.");
    else if (name.length < 3) errors.push("Nama minimal 3 karakter.");
    else if (name.length > 120) errors.push("Nama maksimal 120 karakter.");
    if (!genderOf(data.jenis_kelamin ?? "")) errors.push("Jenis kelamin harus L atau P.");
    const birthPlace = data.tempat_lahir ?? "";
    if (birthPlace.length > 80) errors.push("Tempat lahir maksimal 80 karakter.");
    if ((data.tanggal_lahir ?? "").length > 0 && !dateOf(data.tanggal_lahir ?? "")) {
      errors.push("Tanggal lahir harus YYYY-MM-DD atau DD/MM/YYYY.");
    }
    const email = data.email ?? "";
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.push("Email tidak valid.");
    const phone = data.telepon ?? "";
    if (phone.length > 32) errors.push("Telepon maksimal 32 karakter.");

    const nisn = data.nisn ?? "";
    if (!/^\d{10}$/.test(nisn)) errors.push("NISN harus 10 digit.");
    else {
      if (seenNisn.has(nisn)) errors.push("NISN duplikat di dalam berkas.");
      seenNisn.add(nisn);
      if (nisnUsed.has(nisn)) errors.push("NISN sudah digunakan.");
    }

    const nis = data.nis ?? "";
    if (nis.length > 32) errors.push("NIS maksimal 32 karakter.");
    else if (nis) {
      if (seenNis.has(nis)) errors.push("NIS duplikat di dalam berkas.");
      seenNis.add(nis);
      if (nisUsed.has(nis)) errors.push("NIS sudah digunakan di sekolah ini.");
    }

    const className = data.kelas ?? "";
    if (className) {
      if (!classMap) errors.push("Pilih tahun pelajaran agar kelas dapat dipetakan.");
      else {
        const key = className.toLocaleLowerCase("id-ID");
        const match = classMap.get(key);
        if (!classMap.has(key)) errors.push("Kelas tidak tersedia pada tahun pelajaran ini.");
        else if (!match) errors.push("Nama kelas tidak unik pada tahun pelajaran ini.");
        else if (errors.length === 0) classIds.set(source.rowNumber, match);
      }
    } else if (errors.length === 0) {
      classIds.set(source.rowNumber, null);
    }

    const row = previewRow(source.rowNumber, data, errors);
    if (!row.valid) classIds.delete(source.rowNumber);
    return row;
  });
  return { rows: annotated, classIds };
}

function optionalStoredNis(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
}

function studentCreateData(schoolId: string, data: Record<string, string>, classId: string | null) {
  const gender = genderOf(data.jenis_kelamin ?? "");
  const birth = dateOf(data.tanggal_lahir ?? "");
  if (!gender || !/^\d{10}$/.test(data.nisn ?? "")) {
    throw new AppError(400, "VALIDATION_ERROR", "Baris siswa tidak lagi valid. Pratinjau ulang sebelum menyimpan.");
  }
  return {
    schoolId,
    nisn: data.nisn ?? "",
    nis: optionalStoredNis(data.nis),
    name: data.nama?.trim() ?? "",
    gender,
    birthPlace: data.tempat_lahir?.trim() || null,
    birthDate: birth ? parseDateOnly(birth) : null,
    email: data.email?.trim() || null,
    phone: data.telepon?.trim() || null,
    classId,
    isActive: true,
  };
}

export async function previewImport(
  prisma: PrismaClient,
  schoolId: string,
  kind: Kind,
  filename: string,
  buffer: Buffer,
  academicYearId: string | null = null,
): Promise<ImportPreviewDto> {
  const parsed = await readTabular(filename, buffer);
  const limit = kind === "student" ? STUDENT_ROW_LIMIT : TEACHER_ROW_LIMIT;
  if (kind === "student") assertStudentHeaders(parsed.headers);
  if (parsed.rows.length === 0) throw new AppError(400, "VALIDATION_ERROR", "Berkas tidak memiliki data.");
  if (parsed.rows.length > limit) {
    throw new AppError(400, "VALIDATION_ERROR", kind === "student" ? "Impor siswa dibatasi 1.000 baris." : "Impor dibatasi 500 baris.");
  }
  if (kind === "teacher") return summarize(await annotateTeachers(prisma, schoolId, parsed.rows));
  return summarize((await annotateStudents(prisma, schoolId, parsed.rows, academicYearId)).rows);
}

function commitCounts(rows: ImportPreviewRow[], created: number): ImportCommitDto {
  const duplicateCount = rows.filter((row) => row.status === "DUPLIKAT").length;
  const failedCount = rows.filter((row) => !row.valid && row.status !== "DUPLIKAT").length;
  return {
    created,
    skipped: rows.length - created,
    rows,
    totalCount: rows.length,
    duplicateCount,
    failedCount,
  };
}

export async function commitImport(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  kind: Kind,
  rows: ImportSourceRow[],
  meta: RequestMeta,
  academicYearId: string | null = null,
): Promise<ImportCommitDto> {
  const limit = kind === "student" ? STUDENT_ROW_LIMIT : TEACHER_ROW_LIMIT;
  if (rows.length > limit) {
    throw new AppError(400, "VALIDATION_ERROR", kind === "student" ? "Impor siswa dibatasi 1.000 baris." : "Impor dibatasi 500 baris.");
  }
  if (kind === "teacher") {
    const annotated = await annotateTeachers(prisma, schoolId, rows);
    let created = 0;
    for (const row of annotated) {
      if (!row.valid) continue;
      const gender = genderOf(row.data.jenis_kelamin ?? "");
      if (!gender) continue;
      await prisma.teacher.create({
        data: {
          schoolId,
          nip: row.data.nip?.trim() || null,
          nuptk: row.data.nuptk?.trim() || null,
          name: row.data.nama?.trim() ?? "",
          gender,
          email: row.data.email?.trim() || null,
          phone: row.data.telepon?.trim() || null,
        },
      });
      created += 1;
    }
    await auditChange(prisma, auth, meta, {
      schoolId,
      action: "TEACHERS_IMPORTED",
      entityType: "Teacher",
    });
    return commitCounts(annotated, created);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const annotated = await annotateStudents(tx, schoolId, rows, academicYearId);
      let created = 0;
      for (const row of annotated.rows) {
        if (!row.valid) continue;
        const classId = annotated.classIds.get(row.rowNumber);
        if (classId === undefined) {
          throw new AppError(400, "VALIDATION_ERROR", "Kelas tidak dapat dipetakan. Pratinjau ulang sebelum menyimpan.");
        }
        await tx.student.create({ data: studentCreateData(schoolId, row.data, classId) });
        created += 1;
      }
      const result = commitCounts(annotated.rows, created);
      await writeAudit(tx, {
        schoolId,
        actorId: auth.userId,
        action: "STUDENTS_IMPORTED",
        entityType: "Student",
        metadata: {
          total: result.totalCount,
          created: result.created,
          duplicate: result.duplicateCount,
          failed: result.failedCount,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return result;
    }, { maxWait: 5000, timeout: 20000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "CONFLICT", "Data siswa berubah sejak pratinjau. Periksa ulang berkas sebelum menyimpan.");
    }
    throw error;
  }
}

export async function buildStudentTemplate(prisma: PrismaClient, schoolId: string, academicYearId: string | null): Promise<Buffer> {
  let classes: { name: string }[] = [];
  if (academicYearId) {
    const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true } });
    if (!year) throw new AppError(400, "VALIDATION_ERROR", "Tahun pelajaran tidak ditemukan di sekolah ini.");
    classes = await prisma.schoolClass.findMany({
      where: { schoolId, academicYearId, isActive: true },
      select: { name: true },
      orderBy: [{ gradeLevel: "asc" }, { name: "asc" }],
    });
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Siswa");
  sheet.columns = [
    { width: 18 },
    { width: 16 },
    { width: 32 },
    { width: 16 },
    { width: 22 },
    { width: 18 },
    { width: 24 },
    { width: 28 },
    { width: 18 },
  ];
  sheet.addRow([...STUDENT_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getColumn(1).numFmt = "@";
  sheet.getColumn(2).numFmt = "@";
  sheet.getColumn(6).numFmt = "yyyy-mm-dd";
  sheet.getCell("A1").note = "Teks 10 digit. Jangan mengubah format sel agar nol di depan tetap ada.";
  sheet.getCell("B1").note = "Opsional. Kosongkan jika NIS belum ada. Jangan menyalin NISN ke kolom ini.";
  sheet.getCell("G1").note = "Isi dengan nama kelas yang sudah ada pada tahun pelajaran yang dipilih. Kosongkan jika siswa belum ditempatkan. Kelas baru tidak dibuat.";
  const validations = sheet as ExcelJS.Worksheet & {
    dataValidations: { add: (range: string, validation: ExcelJS.DataValidation) => void };
  };
  validations.dataValidations.add("D2:D1001", {
    type: "list",
    allowBlank: true,
    formulae: ['"L,P"'],
    showErrorMessage: true,
    errorTitle: "Jenis kelamin",
    error: "Isi L atau P.",
  });
  if (classes.length > 0) {
    const list = workbook.addWorksheet("Daftar Kelas");
    list.addRow(["Nama Kelas"]);
    list.getRow(1).font = { bold: true };
    for (const item of classes) {
      const cell = list.addRow([item.name]).getCell(1);
      cell.numFmt = "@";
    }
    validations.dataValidations.add("G2:G1001", {
      type: "list",
      allowBlank: true,
      formulae: [`'Daftar Kelas'!$A$2:$A$${classes.length + 1}`],
      showErrorMessage: true,
      errorTitle: "Kelas",
      error: "Pilih kelas yang sudah ada. Kelas baru tidak dibuat.",
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
