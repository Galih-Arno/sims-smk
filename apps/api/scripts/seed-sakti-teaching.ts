import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const SCHOOL_ID = "cmwqmwd3v000et13ksqobf5pw";
const USER_ID = "cmwqnmwur002st1x5pyd6zc8z";
async function run() {
  let ay = await p.academicYear.findFirst({ where: { schoolId: SCHOOL_ID, isActive: true } }) ?? await p.academicYear.create({ data: { schoolId: SCHOOL_ID, name: "2026/2027", startDate: new Date("2026-07-01"), endDate: new Date("2027-06-30"), isActive: true } });
  let per = await p.academicPeriod.findFirst({ where: { schoolId: SCHOOL_ID, isActive: true } }) ?? await p.academicPeriod.create({ data: { schoolId: SCHOOL_ID, academicYearId: ay.id, name: "Ganjil 2026/2027", semesterKind: "GANJIL", startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31"), isActive: true } });
  const subj = await p.subject.upsert({ where: { schoolId_code: { schoolId: SCHOOL_ID, code: "BLPG" } }, update: { name: "B. LAMPUNG", category: "UMUM", isActive: true }, create: { schoolId: SCHOOL_ID, code: "BLPG", name: "B. LAMPUNG", category: "UMUM", isActive: true } });
  let cls = await p.schoolClass.findFirst({ where: { schoolId: SCHOOL_ID, academicYearId: ay.id, name: "XII TJKT 2" } }) ?? await p.schoolClass.create({ data: { schoolId: SCHOOL_ID, academicYearId: ay.id, name: "XII TJKT 2", gradeLevel: 12, fase: "F", isActive: true } });
  let tch = await p.teacher.findUnique({ where: { userId: USER_ID } }) ?? await p.teacher.create({ data: { schoolId: SCHOOL_ID, userId: USER_ID, name: "Suwartini, S.Pd", gender: "PEREMPUAN", email: "suwartini@smkpgripasirsakti.sch.id", isActive: true } });
  let asg = await p.teachingAssignment.findFirst({ where: { schoolId: SCHOOL_ID, teacherId: tch.id, subjectId: subj.id, classId: cls.id, academicPeriodId: per.id } }) ?? await p.teachingAssignment.create({ data: { schoolId: SCHOOL_ID, teacherId: tch.id, subjectId: subj.id, classId: cls.id, academicPeriodId: per.id } });
  console.log({ subject: subj.name, class: cls.name, teacher: tch.name, assignmentId: asg.id });
}
run().catch(console.error).finally(() => p.$disconnect());
