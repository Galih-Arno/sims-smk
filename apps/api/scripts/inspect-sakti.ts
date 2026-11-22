import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function run() {
  const school = await p.school.findUnique({ where: { npsn: "10814092" } });
  const user = await p.user.findUnique({
    where: { email: "suwartini@smkpgripasirsakti.sch.id" },
    include: { teacher: true },
  });
  const subjects = school ? await p.subject.findMany({ where: { schoolId: school.id } }) : [];
  const classes = school ? await p.schoolClass.findMany({ where: { schoolId: school.id } }) : [];
  const periods = school ? await p.academicPeriod.findMany({ where: { schoolId: school.id } }) : [];

  console.log({
    schoolId: school?.id,
    userId: user?.id,
    teacher: user?.teacher,
    subjects: subjects.map((s) => ({ id: s.id, code: s.code, name: s.name })),
    classes: classes.map((c) => ({ id: c.id, name: c.name })),
    periods: periods.map((pr) => ({ id: pr.id, name: pr.name, isActive: pr.isActive })),
  });
}

run().catch(console.error).finally(() => p.$disconnect());
