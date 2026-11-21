-- Kalender kelengkapan absensi semester. Hari wajib tidak dibuat otomatis.
CREATE TYPE "AttendanceCalendarKind" AS ENUM ('PEMBELAJARAN', 'LIBUR', 'TIDAK_WAJIB');

CREATE TYPE "AttendanceCompletenessStatus" AS ENUM ('DRAFT', 'ACTIVE');

CREATE TABLE "AttendanceCompletenessRule" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "status" "AttendanceCompletenessStatus" NOT NULL DEFAULT 'DRAFT',
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCompletenessRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCalendarDay" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "AttendanceCalendarKind" NOT NULL,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceCalendarDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceCompletenessRule_schoolId_academicPeriodId_key" ON "AttendanceCompletenessRule"("schoolId", "academicPeriodId");
CREATE INDEX "AttendanceCompletenessRule_schoolId_status_idx" ON "AttendanceCompletenessRule"("schoolId", "status");
CREATE UNIQUE INDEX "AttendanceCalendarDay_ruleId_date_key" ON "AttendanceCalendarDay"("ruleId", "date");
CREATE INDEX "AttendanceCalendarDay_schoolId_date_idx" ON "AttendanceCalendarDay"("schoolId", "date");

ALTER TABLE "AttendanceCompletenessRule" ADD CONSTRAINT "AttendanceCompletenessRule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCompletenessRule" ADD CONSTRAINT "AttendanceCompletenessRule_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCalendarDay" ADD CONSTRAINT "AttendanceCalendarDay_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCalendarDay" ADD CONSTRAINT "AttendanceCalendarDay_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AttendanceCompletenessRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
