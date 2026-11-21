import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const MARKER = "QC-03A1";
const SCHOOL_NAME = "SMK Negeri 1 Contoh";
const CLASS_NAME = "X TKJ 1";
const SUBJECT_NAME = "KJD";
const PERIOD_NAME = "2026/2027 Ganjil";
const TEACHER_NAME = "TOJI";
const OTHER_CLASS = `${MARKER} Kelas Lain`;
const OTHER_TEACHER = `${MARKER} Guru Lain`;
const STUDENT_COUNT = 10;

const prisma = new PrismaClient();

function studentName(index: number) {
  return `${MARKER} Siswa ${String(index).padStart(2, "0")}`;
}

function studentNisn(index: number) {
  return `9030301${String(index).padStart(3, "0")}`;
}

function studentNis(index: number) {
  return `QC03A1${String(index).padStart(2, "0")}`;
}

async function loadFixture() {
  const school = await prisma.school.findFirst({ where: { name: SCHOOL_NAME }, select: { id: true, stsEnabled: true, sasEnabled: true } });
  if (!school) throw new Error(`Sekolah ${SCHOOL_NAME} tidak ditemukan.`);
  const period = await prisma.academicPeriod.findFirst({
    where: { schoolId: school.id, name: PERIOD_NAME, isActive: true },
    select: { id: true, academicYearId: true },
  });
  if (!period?.academicYearId) throw new Error(`Semester aktif ${PERIOD_NAME} tidak ditemukan.`);
  const classRow = await prisma.schoolClass.findFirst({
    where: { schoolId: school.id, name: CLASS_NAME, academicYearId: period.academicYearId },
    select: { id: true },
  });
  if (!classRow) throw new Error(`Kelas ${CLASS_NAME} tidak ditemukan.`);
  const subject = await prisma.subject.findFirst({ where: { schoolId: school.id, name: SUBJECT_NAME }, select: { id: true } });
  if (!subject) throw new Error(`Mapel ${SUBJECT_NAME} tidak ditemukan.`);
  const assignment = await prisma.teachingAssignment.findFirst({
    where: { schoolId: school.id, classId: classRow.id, subjectId: subject.id, academicPeriodId: period.id, teacher: { name: TEACHER_NAME } },
    select: { id: true, teacherId: true },
  });
  if (!assignment) throw new Error("Penugasan TOJI tidak ditemukan.");
  return { school, period, classRow, subject, assignment };
}

async function prepare() {
  const { school, period, classRow, subject, assignment } = await loadFixture();
  if (!school.stsEnabled || !school.sasEnabled) {
    await prisma.school.update({ where: { id: school.id }, data: { stsEnabled: true, sasEnabled: true } });
  }

  const students = [];
  for (let index = 1; index <= STUDENT_COUNT; index += 1) {
    const nisn = studentNisn(index);
    const name = studentName(index);
    const existing = await prisma.student.findUnique({ where: { nisn }, select: { id: true, name: true, schoolId: true } });
    if (existing && !existing.name.startsWith(`${MARKER} `)) {
      throw new Error(`NISN ${nisn} sudah dipakai siswa lain.`);
    }
    const row = existing
      ? await prisma.student.update({
          where: { id: existing.id },
          data: { name, nis: studentNis(index), classId: classRow.id, isActive: true, schoolId: school.id },
        })
      : await prisma.student.create({
          data: {
            schoolId: school.id,
            nisn,
            nis: studentNis(index),
            name,
            gender: index % 2 === 0 ? "PEREMPUAN" : "LAKI_LAKI",
            classId: classRow.id,
            isActive: true,
          },
        });
    students.push(row.id);
  }

  const objectives = [];
  for (let index = 1; index <= 3; index += 1) {
    const code = `QC-TP${index}`;
    const description = `${MARKER} Tujuan pembelajaran ${index}`;
    const row = await prisma.learningObjective.upsert({
      where: { teachingAssignmentId_code: { teachingAssignmentId: assignment.id, code } },
      create: { schoolId: school.id, teachingAssignmentId: assignment.id, code, description, sequence: 80 + index },
      update: { description, sequence: 80 + index },
    });
    objectives.push(row.id);
  }

  const scopes = [];
  for (let index = 1; index <= 3; index += 1) {
    const code = `QC-LM${index}`;
    const description = `${MARKER} Lingkup materi ${index}`;
    const row = await prisma.materialScope.upsert({
      where: { teachingAssignmentId_code: { teachingAssignmentId: assignment.id, code } },
      create: { schoolId: school.id, teachingAssignmentId: assignment.id, code, description, sequence: 80 + index },
      update: { description, sequence: 80 + index },
    });
    scopes.push(row.id);
  }

  const otherClass = await prisma.schoolClass.upsert({
    where: { schoolId_academicYearId_name: { schoolId: school.id, academicYearId: period.academicYearId, name: OTHER_CLASS } },
    create: { schoolId: school.id, academicYearId: period.academicYearId, name: OTHER_CLASS, gradeLevel: 10 },
    update: {},
  });
  let otherTeacher = await prisma.teacher.findFirst({ where: { schoolId: school.id, name: OTHER_TEACHER }, select: { id: true } });
  if (!otherTeacher) {
    otherTeacher = await prisma.teacher.create({
      data: { schoolId: school.id, name: OTHER_TEACHER, gender: "LAKI_LAKI", email: "qc-03a1.guru@qc.local", nip: "9030301999" },
      select: { id: true },
    });
  }
  const otherAssignment = await prisma.teachingAssignment.upsert({
    where: { classId_subjectId_academicPeriodId: { classId: otherClass.id, subjectId: subject.id, academicPeriodId: period.id } },
    create: { schoolId: school.id, teacherId: otherTeacher.id, subjectId: subject.id, classId: otherClass.id, academicPeriodId: period.id },
    update: { teacherId: otherTeacher.id },
  });

  console.log(JSON.stringify({
    marker: MARKER,
    schoolId: school.id,
    assignmentId: assignment.id,
    classId: classRow.id,
    students: students.length,
    objectives: objectives.length,
    scopes: scopes.length,
    otherAssignmentId: otherAssignment.id,
    stsEnabled: true,
    sasEnabled: true,
  }, null, 2));
}

async function cleanup() {
  const { school, assignment } = await loadFixture();
  const students = await prisma.student.findMany({
    where: { schoolId: school.id, name: { startsWith: `${MARKER} ` }, nisn: { startsWith: "9030301" } },
    select: { id: true },
  });
  const objectives = await prisma.learningObjective.findMany({
    where: { teachingAssignmentId: assignment.id, code: { startsWith: "QC-TP" }, description: { startsWith: `${MARKER} ` } },
    select: { id: true },
  });
  const scopes = await prisma.materialScope.findMany({
    where: { teachingAssignmentId: assignment.id, code: { startsWith: "QC-LM" }, description: { startsWith: `${MARKER} ` } },
    select: { id: true },
  });
  const otherClasses = await prisma.schoolClass.findMany({ where: { schoolId: school.id, name: OTHER_CLASS }, select: { id: true } });
  const otherAssignments = await prisma.teachingAssignment.findMany({
    where: { schoolId: school.id, classId: { in: otherClasses.map((item) => item.id) }, id: { not: assignment.id } },
    select: { id: true },
  });
  const studentIds = students.map((item) => item.id);
  const objectiveIds = objectives.map((item) => item.id);
  const scopeIds = scopes.map((item) => item.id);
  const otherAssignmentIds = otherAssignments.map((item) => item.id);

  const removed = await prisma.$transaction(async (tx) => {
    const formative = await tx.formativeScore.deleteMany({
      where: {
        OR: [
          { studentId: { in: studentIds } },
          { formativeAssessment: { learningObjectiveId: { in: objectiveIds } } },
        ],
      },
    });
    const summative = await tx.summativeScore.deleteMany({
      where: {
        OR: [
          { studentId: { in: studentIds } },
          { summativeAssessment: { materialScopeId: { in: scopeIds } } },
        ],
      },
    });
    const term = await tx.termExamScore.deleteMany({
      where: { OR: [{ studentId: { in: studentIds } }, { teachingAssignmentId: { in: otherAssignmentIds } }] },
    });
    const formativeAnchors = await tx.formativeAssessment.deleteMany({ where: { learningObjectiveId: { in: objectiveIds } } });
    const summativeAnchors = await tx.summativeAssessment.deleteMany({ where: { materialScopeId: { in: scopeIds } } });
    const deletedObjectives = await tx.learningObjective.deleteMany({ where: { id: { in: objectiveIds } } });
    const deletedScopes = await tx.materialScope.deleteMany({ where: { id: { in: scopeIds } } });
    await tx.gradeComponentSubmission.deleteMany({ where: { teachingAssignmentId: { in: otherAssignmentIds } } });
    await tx.gradeSubmission.deleteMany({ where: { teachingAssignmentId: { in: otherAssignmentIds } } });
    const deletedAssignments = await tx.teachingAssignment.deleteMany({ where: { id: { in: otherAssignmentIds } } });
    const deletedStudents = await tx.student.deleteMany({ where: { id: { in: studentIds } } });
    const deletedTeachers = await tx.teacher.deleteMany({
      where: { schoolId: school.id, name: OTHER_TEACHER, teachingAssignments: { none: {} }, homeroomAssignments: { none: {} } },
    });
    const deletedClasses = await tx.schoolClass.deleteMany({
      where: { id: { in: otherClasses.map((item) => item.id) }, students: { none: {} }, teachingAssignments: { none: {} } },
    });
    return {
      formative: formative.count,
      summative: summative.count,
      term: term.count,
      formativeAnchors: formativeAnchors.count,
      summativeAnchors: summativeAnchors.count,
      objectives: deletedObjectives.count,
      scopes: deletedScopes.count,
      assignments: deletedAssignments.count,
      students: deletedStudents.count,
      teachers: deletedTeachers.count,
      classes: deletedClasses.count,
    };
  });
  console.log(JSON.stringify({ cleaned: MARKER, protectedAssignmentId: assignment.id, removed }, null, 2));
}

const cleanupMode = process.argv.includes("--cleanup");
try {
  if (cleanupMode) await cleanup();
  else await prepare();
} finally {
  await prisma.$disconnect();
}
