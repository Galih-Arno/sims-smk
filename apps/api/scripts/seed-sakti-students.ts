import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCHOOL_ID = "cmwqmwd3v000et13ksqobf5pw";
const USER_ID = "cmwqnmwur002st1x5pyd6zc8z";
const STUDENTS: Array<[string, string, string, "LAKI_LAKI" | "PEREMPUAN"]> = [
  ["0081409201", "24001", "Ahmad Fauzi Pratama", "LAKI_LAKI"],
  ["0081409202", "24002", "Alya Rahmawati", "PEREMPUAN"],
  ["0081409203", "24003", "Bagas Saputra", "LAKI_LAKI"],
  ["0081409204", "24004", "Citra Dewi Lestari", "PEREMPUAN"],
  ["0081409205", "24005", "Dimas Aditya Nugroho", "LAKI_LAKI"],
  ["0081409206", "24006", "Eka Putri Wulandari", "PEREMPUAN"],
  ["0081409207", "24007", "Fajar Ramadhan", "LAKI_LAKI"],
  ["0081409208", "24008", "Gita Nirmala Sari", "PEREMPUAN"],
  ["0081409209", "24009", "Hendra Wijaya", "LAKI_LAKI"],
  ["0081409210", "24010", "Intan Permatasari", "PEREMPUAN"],
];
async function run() {
  const teacher = await p.teacher.findUniqueOrThrow({ where: { userId: USER_ID } });
  const period = await p.academicPeriod.findFirstOrThrow({ where: { schoolId: SCHOOL_ID, isActive: true } });
  const schoolClass = await p.schoolClass.findFirstOrThrow({ where: { schoolId: SCHOOL_ID, name: "XII TJKT 2" } });
  const homeroom = await p.homeroomAssignment.upsert({
    where: { classId_academicPeriodId: { classId: schoolClass.id, academicPeriodId: period.id } },
    update: { teacherId: teacher.id },
    create: { schoolId: SCHOOL_ID, teacherId: teacher.id, classId: schoolClass.id, academicPeriodId: period.id },
  });
  for (const [nisn, nis, name, gender] of STUDENTS) {
    await p.student.upsert({
      where: { nisn },
      update: { schoolId: SCHOOL_ID, nis, name, gender, classId: schoolClass.id, isActive: true },
      create: { schoolId: SCHOOL_ID, nisn, nis, name, gender, classId: schoolClass.id, isActive: true },
    });
  }
  console.log({ homeroomId: homeroom.id, class: schoolClass.name, seededStudents: STUDENTS.length });
}
run().catch(console.error).finally(() => p.$disconnect());
