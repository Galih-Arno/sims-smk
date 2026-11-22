import "dotenv/config";
import * as XLSXNS from "xlsx";
import { PrismaClient } from "@prisma/client";
const XLSX: any = (XLSXNS as any).default ?? XLSXNS;
const p = new PrismaClient();
const SCHOOL_ID = "cmwqmwd3v000et13ksqobf5pw";
const XLS_PATH = "/home/kaido/Downloads/NILAI STS B. LAMPUNG KLS XII TKJ 2 KUMER 2627.xls";
async function run() {
  const wb = XLSX.readFile(XLS_PATH);
  console.log("Sheets:", wb.SheetNames);
  const students: Array<{ name: string; gender: "LAKI_LAKI" | "PEREMPUAN" }> = [];
  for (const sName of wb.SheetNames) {
    const ws = wb.Sheets[sName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const hIdx = rows.findIndex((r) => r.some((c) => /nama\s*siswa/i.test(String(c))));
    if (hIdx < 0) continue;
    console.log("Header sample [" + sName + "]:", rows.slice(hIdx, hIdx + 4));
    const nCol = rows[hIdx].findIndex((c) => /nama\s*siswa/i.test(String(c)));
    const gCol = rows[hIdx].findIndex((c) => /^l\s*\/\s*p$/i.test(String(c).trim()));
    if (students.length === 0) {
      for (let i = hIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const rawName = String(row[nCol] ?? "").replace(/\s+/g, " ").trim();
        const rawNo = String(row[nCol - 1] ?? "").trim();
        if (!rawName || !/^\d+$/.test(rawNo) || /jumlah|rata|nilai|tertinggi|terendah|tuntas/i.test(rawName)) continue;
        const gRaw = gCol >= 0 ? String(row[gCol] ?? "").trim().toUpperCase() : "L";
        students.push({ name: rawName, gender: gRaw === "P" ? "PEREMPUAN" : "LAKI_LAKI" });
      }
    }
  }
  const cls = await p.schoolClass.findFirstOrThrow({ where: { schoolId: SCHOOL_ID, name: "XII TJKT 2" } });
  await p.student.deleteMany({ where: { schoolId: SCHOOL_ID, classId: cls.id, nisn: { startsWith: "00814092" } } });
  for (let i = 0; i < students.length; i++) {
    const st = students[i]!;
    const nisn = "0081409" + String(101 + i).padStart(3, "0");
    const nis = "24" + String(101 + i).padStart(3, "0");
    await p.student.upsert({ where: { nisn }, update: { schoolId: SCHOOL_ID, nis, name: st.name, gender: st.gender, classId: cls.id, isActive: true }, create: { schoolId: SCHOOL_ID, nisn, nis, name: st.name, gender: st.gender, classId: cls.id, isActive: true } });
  }
  console.log({ importedStudents: students.length, first5: students.slice(0, 5) });
}
run().catch(console.error).finally(() => p.$disconnect());
