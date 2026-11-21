-- Kebijakan pengolahan nilai rapor. Tidak mengubah nilai yang sudah tersimpan.
CREATE TYPE "GradeReportPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE');
CREATE TYPE "FormativeWeightMode" AS ENUM ('COMBINED', 'SEPARATE');
CREATE TYPE "RemedialScorePolicy" AS ENUM ('HIGHEST', 'LATEST', 'CAPPED');
CREATE TYPE "GradeRoundingMode" AS ENUM ('NONE', 'INTEGER', 'ONE_DECIMAL', 'TWO_DECIMALS');
CREATE TYPE "EmptyScoreTreatment" AS ENUM ('INCOMPLETE');

CREATE TABLE "GradeReportPolicy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "status" "GradeReportPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "useFormative" BOOLEAN NOT NULL,
    "useSummative" BOOLEAN NOT NULL,
    "useSts" BOOLEAN NOT NULL,
    "useSas" BOOLEAN NOT NULL,
    "formativeMode" "FormativeWeightMode" NOT NULL,
    "weightFormative" DECIMAL(5,2),
    "weightUh" DECIMAL(5,2),
    "weightT1" DECIMAL(5,2),
    "weightT2" DECIMAL(5,2),
    "weightT3" DECIMAL(5,2),
    "weightSummative" DECIMAL(5,2),
    "weightSts" DECIMAL(5,2),
    "weightSas" DECIMAL(5,2),
    "remedialPolicy" "RemedialScorePolicy" NOT NULL,
    "remedialCap" DECIMAL(5,2),
    "emptyTreatment" "EmptyScoreTreatment" NOT NULL DEFAULT 'INCOMPLETE',
    "roundingMode" "GradeRoundingMode" NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeReportPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GradeReportPolicy_schoolId_academicYearId_academicPeriodId_curriculumId_key" ON "GradeReportPolicy"("schoolId", "academicYearId", "academicPeriodId", "curriculumId");
CREATE INDEX "GradeReportPolicy_schoolId_status_idx" ON "GradeReportPolicy"("schoolId", "status");

ALTER TABLE "GradeReportPolicy" ADD CONSTRAINT "GradeReportPolicy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GradeReportPolicy" ADD CONSTRAINT "GradeReportPolicy_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeReportPolicy" ADD CONSTRAINT "GradeReportPolicy_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeReportPolicy" ADD CONSTRAINT "GradeReportPolicy_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
