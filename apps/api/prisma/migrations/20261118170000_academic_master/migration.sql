-- CreateEnum
CREATE TYPE "SemesterKind" AS ENUM ('GANJIL', 'GENAP');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('LAKI_LAKI', 'PEREMPUAN');

-- CreateEnum
CREATE TYPE "SubjectCategory" AS ENUM ('UMUM', 'KEJURUAN');

-- AlterTable
ALTER TABLE "AcademicPeriod" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "semesterKind" "SemesterKind";

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "accreditation" VARCHAR(8),
ADD COLUMN     "city" VARCHAR(80),
ADD COLUMN     "postalCode" VARCHAR(10),
ADD COLUMN     "principalName" TEXT,
ADD COLUMN     "province" VARCHAR(80),
ADD COLUMN     "website" VARCHAR(200);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertiseField" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertiseField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertiseProgram" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertiseProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertiseConcentration" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertiseConcentration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT,
    "nip" VARCHAR(18),
    "nuptk" VARCHAR(16),
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "concentrationId" TEXT,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 36,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "nisn" VARCHAR(10) NOT NULL,
    "nis" VARCHAR(32),
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "birthPlace" VARCHAR(80),
    "birthDate" DATE,
    "email" VARCHAR(254),
    "phone" VARCHAR(32),
    "classId" TEXT,
    "concentrationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SubjectCategory" NOT NULL DEFAULT 'UMUM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeachingAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeroomAssignment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeroomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicYear_schoolId_isActive_idx" ON "AcademicYear"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");

-- CreateIndex
CREATE INDEX "ExpertiseField_schoolId_name_idx" ON "ExpertiseField"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertiseField_schoolId_code_key" ON "ExpertiseField"("schoolId", "code");

-- CreateIndex
CREATE INDEX "ExpertiseProgram_schoolId_fieldId_idx" ON "ExpertiseProgram"("schoolId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertiseProgram_schoolId_code_key" ON "ExpertiseProgram"("schoolId", "code");

-- CreateIndex
CREATE INDEX "ExpertiseConcentration_schoolId_programId_idx" ON "ExpertiseConcentration"("schoolId", "programId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertiseConcentration_schoolId_code_key" ON "ExpertiseConcentration"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");

-- CreateIndex
CREATE INDEX "Teacher_schoolId_name_idx" ON "Teacher"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_schoolId_nip_key" ON "Teacher"("schoolId", "nip");

-- CreateIndex
CREATE INDEX "SchoolClass_schoolId_gradeLevel_idx" ON "SchoolClass"("schoolId", "gradeLevel");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_schoolId_academicYearId_name_key" ON "SchoolClass"("schoolId", "academicYearId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Student_nisn_key" ON "Student"("nisn");

-- CreateIndex
CREATE INDEX "Student_schoolId_name_idx" ON "Student"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Student_classId_idx" ON "Student"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_nis_key" ON "Student"("schoolId", "nis");

-- CreateIndex
CREATE INDEX "Subject_schoolId_name_idx" ON "Subject"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolId_code_key" ON "Subject"("schoolId", "code");

-- CreateIndex
CREATE INDEX "TeachingAssignment_schoolId_teacherId_idx" ON "TeachingAssignment"("schoolId", "teacherId");

-- CreateIndex
CREATE INDEX "TeachingAssignment_academicPeriodId_idx" ON "TeachingAssignment"("academicPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingAssignment_classId_subjectId_academicPeriodId_key" ON "TeachingAssignment"("classId", "subjectId", "academicPeriodId");

-- CreateIndex
CREATE INDEX "HomeroomAssignment_schoolId_idx" ON "HomeroomAssignment"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeroomAssignment_classId_academicPeriodId_key" ON "HomeroomAssignment"("classId", "academicPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeroomAssignment_teacherId_academicPeriodId_key" ON "HomeroomAssignment"("teacherId", "academicPeriodId");

-- CreateIndex
CREATE INDEX "AcademicPeriod_academicYearId_idx" ON "AcademicPeriod"("academicYearId");

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPeriod" ADD CONSTRAINT "AcademicPeriod_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseField" ADD CONSTRAINT "ExpertiseField_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseProgram" ADD CONSTRAINT "ExpertiseProgram_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseProgram" ADD CONSTRAINT "ExpertiseProgram_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ExpertiseField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseConcentration" ADD CONSTRAINT "ExpertiseConcentration_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseConcentration" ADD CONSTRAINT "ExpertiseConcentration_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ExpertiseProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_concentrationId_fkey" FOREIGN KEY ("concentrationId") REFERENCES "ExpertiseConcentration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_concentrationId_fkey" FOREIGN KEY ("concentrationId") REFERENCES "ExpertiseConcentration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeroomAssignment" ADD CONSTRAINT "HomeroomAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeroomAssignment" ADD CONSTRAINT "HomeroomAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeroomAssignment" ADD CONSTRAINT "HomeroomAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeroomAssignment" ADD CONSTRAINT "HomeroomAssignment_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tautkan semester yang sudah ada ke tahun pelajaran tanpa mengubah nama atau tanggalnya.
INSERT INTO "AcademicYear" ("id", "schoolId", "name", "startDate", "endDate", "isActive", "createdAt", "updatedAt")
SELECT
  'ay' || substr(md5("schoolId" || ':2026/2027'), 1, 24),
  "schoolId",
  '2026/2027',
  DATE '2026-07-01',
  DATE '2027-06-30',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AcademicPeriod"
WHERE "name" LIKE '2026/2027%'
GROUP BY "schoolId"
ON CONFLICT ("schoolId", "name") DO NOTHING;

UPDATE "AcademicPeriod" AS period
SET
  "academicYearId" = year."id",
  "semesterKind" = CASE
    WHEN period."name" ILIKE '%Genap%' THEN 'GENAP'::"SemesterKind"
    WHEN period."name" ILIKE '%Ganjil%' THEN 'GANJIL'::"SemesterKind"
    ELSE period."semesterKind"
  END
FROM "AcademicYear" AS year
WHERE period."academicYearId" IS NULL
  AND period."schoolId" = year."schoolId"
  AND period."name" LIKE year."name" || '%';
