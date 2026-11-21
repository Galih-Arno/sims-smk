import PDFDocument from "pdfkit";
import type { ReportPrintDocument, ReportPrintSubject } from "./print-document.ts";

const MARGIN = 40;
const WATERMARK = "DRAF — BELUM DISAHKAN";

export function renderReportPdf(document: ReportPrintDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: MARGIN, compress: false, bufferPages: true, info: { Title: document.mode === "OFFICIAL" ? "Rapor resmi" : "Draf rapor" } });
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    draw(pdf, document);
    if (document.mode === "DRAFT") stampDraft(pdf);
    pdf.end();
  });
}

function draw(pdf: PDFKit.PDFDocument, document: ReportPrintDocument) {
  const width = contentWidth(pdf);
  pdf.font("Helvetica-Bold").fontSize(14).text(document.schoolName, { align: "center", width });
  pdf.font("Helvetica").fontSize(9).fillColor("#334155");
  pdf.text(`NPSN ${document.npsn}`, { align: "center", width });
  pdf.text(document.address, { align: "center", width });
  pdf.moveDown(0.35);
  pdf.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(document.mode === "OFFICIAL" ? "LAPORAN HASIL BELAJAR" : "DRAF LAPORAN HASIL BELAJAR", { align: "center", width });
  pdf.font("Helvetica").fontSize(9).fillColor("#334155").text(document.curriculumLabel, { align: "center", width });
  pdf.fillColor("#0f172a");
  pdf.moveDown(0.7);
  identity(pdf, document, width);
  pdf.moveDown(0.6);
  heading(pdf, "Hasil belajar");
  drawGroup(pdf, "Kelompok umum", document.subjects.filter((subject) => subject.category === "UMUM"), width);
  drawGroup(pdf, "Kelompok kejuruan", document.subjects.filter((subject) => subject.category === "KEJURUAN"), width);
  if (document.subjects.length === 0) pdf.font("Helvetica").fontSize(10).text("Mata pelajaran belum tersedia.", { width });
  pdf.moveDown(0.5);
  kept(pdf, 78, () => {
    heading(pdf, "Ketidakhadiran");
    pdf.font("Helvetica").fontSize(10);
    pdf.text(`Sakit: ${document.sakit}    Izin: ${document.izin}    Alpa: ${document.alpa}`, { width });
    pdf.fillColor("#475569").text(`Kelengkapan: ${document.attendanceCompleteness}`, { width }).fillColor("#0f172a");
  });
  kept(pdf, blockHeight(pdf, document.homeroomNote, width) + 28, () => textBlock(pdf, "Catatan wali kelas", document.homeroomNote, width));
  kept(pdf, blockHeight(pdf, document.pkl, width) + 28, () => textBlock(pdf, "PKL", document.pkl, width));
  kept(pdf, blockHeight(pdf, document.extracurricular, width) + 28, () => textBlock(pdf, "Ekstrakurikuler", document.extracurricular, width));
  kept(pdf, 118, () => endorsement(pdf, document, width));
  if (document.mode === "OFFICIAL" && document.version !== null && document.endorsedAt) {
    pdf.moveDown(0.6);
    pdf.font("Helvetica").fontSize(8).fillColor("#334155").text(`Versi snapshot ${document.version} · Disahkan ${document.endorsedAt}`, { width });
  }
}

function identity(pdf: PDFKit.PDFDocument, document: ReportPrintDocument, width: number) {
  const rows: Array<[string, string]> = [
    ["Nama", document.studentName],
    ["NIS", document.nis],
    ["NISN", document.nisn],
    ["Kelas", document.className],
    ["Fase", document.fase],
    ["Semester", document.semester],
    ["Tahun pelajaran", document.yearName],
    ["Periode", document.periodName],
  ];
  const column = width / 2 - 8;
  let y = pdf.y;
  for (let index = 0; index < rows.length; index += 2) {
    pair(pdf, rows[index]!, pdf.page.margins.left, y, column);
    const next = rows[index + 1];
    if (next) pair(pdf, next, pdf.page.margins.left + column + 16, y, column);
    y += 16;
  }
  pdf.y = y;
  pdf.x = pdf.page.margins.left;
}

function pair(pdf: PDFKit.PDFDocument, row: [string, string], x: number, y: number, column: number) {
  pdf.font("Helvetica").fontSize(9).fillColor("#64748b").text(row[0], x, y, { width: 78, lineBreak: false });
  pdf.font("Helvetica").fontSize(9).fillColor("#0f172a").text(row[1], x + 80, y, { width: Math.max(40, column - 80), lineBreak: false });
}

function drawGroup(pdf: PDFKit.PDFDocument, title: string, subjects: ReportPrintSubject[], width: number) {
  if (subjects.length === 0) return;
  ensure(pdf, 36);
  pdf.font("Helvetica-Bold").fontSize(9).fillColor("#475569").text(title.toUpperCase(), { width });
  pdf.fillColor("#0f172a");
  tableHeader(pdf, width);
  for (const subject of subjects) drawSubject(pdf, subject, width);
}

function tableHeader(pdf: PDFKit.PDFDocument, width: number) {
  const y = pdf.y;
  pdf.font("Helvetica-Bold").fontSize(8).fillColor("#64748b");
  pdf.text("Mata pelajaran", pdf.page.margins.left, y, { width: width * 0.34, lineBreak: false });
  pdf.text("Nilai", pdf.page.margins.left + width * 0.36, y, { width: width * 0.12, lineBreak: false });
  pdf.text("Capaian kompetensi", pdf.page.margins.left + width * 0.5, y, { width: width * 0.5, lineBreak: false });
  pdf.fillColor("#0f172a");
  pdf.y = y + 14;
  pdf.x = pdf.page.margins.left;
}

function drawSubject(pdf: PDFKit.PDFDocument, subject: ReportPrintSubject, width: number) {
  const nameWidth = width * 0.34;
  const scoreWidth = width * 0.12;
  const descriptionWidth = width * 0.48;
  pdf.font("Helvetica").fontSize(9);
  const nameHeight = pdf.heightOfString(`${subject.name}\n${subject.teacherName}`, { width: nameWidth });
  const descriptionHeight = pdf.heightOfString(subject.description, { width: descriptionWidth });
  const height = Math.max(nameHeight, descriptionHeight, 18) + 8;
  const limit = pdf.page.height - pdf.page.margins.top - pdf.page.margins.bottom;
  if (height <= limit) ensure(pdf, height);
  else ensure(pdf, 36);
  const y = pdf.y;
  pdf.font("Helvetica").fontSize(9).text(subject.name, pdf.page.margins.left, y, { width: nameWidth });
  pdf.font("Helvetica").fontSize(8).fillColor("#64748b").text(subject.teacherName, pdf.page.margins.left, pdf.y, { width: nameWidth });
  const afterName = pdf.y;
  pdf.fillColor("#0f172a").font("Helvetica").fontSize(9).text(subject.score, pdf.page.margins.left + width * 0.36, y, { width: scoreWidth });
  pdf.text(subject.description, pdf.page.margins.left + width * 0.5, y, { width: descriptionWidth });
  pdf.y = Math.max(pdf.y, afterName) + 6;
  pdf.x = pdf.page.margins.left;
  pdf.moveTo(pdf.page.margins.left, pdf.y - 3).lineTo(pdf.page.margins.left + width, pdf.y - 3).strokeColor("#e2e8f0").stroke();
}

function textBlock(pdf: PDFKit.PDFDocument, title: string, value: string, width: number) {
  heading(pdf, title);
  pdf.font("Helvetica").fontSize(10).fillColor("#0f172a").text(value, { width });
  pdf.moveDown(0.35);
}

function endorsement(pdf: PDFKit.PDFDocument, document: ReportPrintDocument, width: number) {
  heading(pdf, "Pengesahan");
  const column = width / 3;
  const y = pdf.y;
  const entries: Array<[string, string]> = [
    ["Wali kelas", document.homeroomTeacher],
    ["Kepala sekolah", document.principalName],
    ["Tanggal rapor", document.reportDate],
  ];
  entries.forEach(([label, value], index) => {
    const x = pdf.page.margins.left + index * column;
    pdf.font("Helvetica").fontSize(8).fillColor("#64748b").text(label.toUpperCase(), x, y, { width: column - 8, lineBreak: false });
    pdf.font("Helvetica").fontSize(9).fillColor("#0f172a").text(value, x, y + 46, { width: column - 8, lineBreak: false });
  });
  pdf.y = y + 64;
  pdf.x = pdf.page.margins.left;
  pdf.font("Helvetica").fontSize(8).fillColor("#64748b").text("Tanda tangan tidak ditampilkan.", { width });
  pdf.fillColor("#0f172a");
}

function heading(pdf: PDFKit.PDFDocument, title: string) {
  pdf.x = pdf.page.margins.left;
  pdf.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(title, { width: contentWidth(pdf) });
  pdf.moveDown(0.2);
}

function blockHeight(pdf: PDFKit.PDFDocument, value: string, width: number): number {
  pdf.font("Helvetica").fontSize(10);
  return pdf.heightOfString(value, { width });
}

function kept(pdf: PDFKit.PDFDocument, height: number, drawBlock: () => void) {
  ensure(pdf, height);
  drawBlock();
}

function ensure(pdf: PDFKit.PDFDocument, height: number) {
  const bottom = pdf.page.height - pdf.page.margins.bottom;
  if (pdf.y + height > bottom) pdf.addPage();
}

function stampDraft(pdf: PDFKit.PDFDocument) {
  const { start, count } = pdf.bufferedPageRange();
  for (let index = start; index < start + count; index += 1) {
    pdf.switchToPage(index);
    pdf.save();
    pdf.fillColor("#9f1239").fillOpacity(0.16);
    pdf.font("Helvetica-Bold").fontSize(34);
    pdf.rotate(-32, { origin: [pdf.page.width / 2, pdf.page.height / 2] });
    pdf.text(WATERMARK, 78, pdf.page.height / 2, { lineBreak: false });
    pdf.restore();
  }
}

function contentWidth(pdf: PDFKit.PDFDocument): number {
  return pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
}
