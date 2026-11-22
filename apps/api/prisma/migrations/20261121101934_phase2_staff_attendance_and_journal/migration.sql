-- CreateEnum
CREATE TYPE "StaffAttendanceStatus" AS ENUM ('TEPAT_WAKTU', 'TERLAMBAT', 'DINAS_LUAR', 'IZIN');

-- DropIndex
DROP INDEX "FormativeAssessment_learningObjectiveId_idx";

-- DropIndex
DROP INDEX "SummativeAssessment_materialScopeId_idx";

-- CreateTable
CREATE TABLE "SchoolAttendanceSetting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL DEFAULT -7.2248,
    "longitude" DOUBLE PRECISION NOT NULL DEFAULT 105.7745,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "workStartTime" VARCHAR(5) NOT NULL DEFAULT '07:00',
    "lateToleranceMin" INTEGER NOT NULL DEFAULT 15,
    "workEndTime" VARCHAR(5) NOT NULL DEFAULT '15:30',
    "requireLiveness" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAttendanceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInDistanceM" INTEGER,
    "checkInPhotoUrl" VARCHAR(500),
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutDistanceM" INTEGER,
    "checkOutPhotoUrl" VARCHAR(500),
    "status" "StaffAttendanceStatus" NOT NULL DEFAULT 'TEPAT_WAKTU',
    "note" VARCHAR(300),
    "idempotencyKey" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeachingJournal" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "attendanceMeetingId" TEXT,
    "learningObjectiveId" TEXT,
    "teacherUserId" TEXT NOT NULL,
    "journalDate" DATE NOT NULL,
    "sessionNo" INTEGER NOT NULL DEFAULT 1,
    "topic" VARCHAR(300) NOT NULL,
    "activities" VARCHAR(2000) NOT NULL,
    "studentNotes" VARCHAR(1000),
    "photoUrl" VARCHAR(500),
    "idempotencyKey" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeachingJournal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolAttendanceSetting_schoolId_key" ON "SchoolAttendanceSetting"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_idempotencyKey_key" ON "StaffAttendance"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StaffAttendance_schoolId_workDate_idx" ON "StaffAttendance"("schoolId", "workDate");

-- CreateIndex
CREATE INDEX "StaffAttendance_userId_workDate_idx" ON "StaffAttendance"("userId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_schoolId_userId_workDate_key" ON "StaffAttendance"("schoolId", "userId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingJournal_attendanceMeetingId_key" ON "TeachingJournal"("attendanceMeetingId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingJournal_idempotencyKey_key" ON "TeachingJournal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TeachingJournal_schoolId_journalDate_idx" ON "TeachingJournal"("schoolId", "journalDate");

-- CreateIndex
CREATE INDEX "TeachingJournal_teacherUserId_journalDate_idx" ON "TeachingJournal"("teacherUserId", "journalDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingJournal_teachingAssignmentId_journalDate_sessionNo_key" ON "TeachingJournal"("teachingAssignmentId", "journalDate", "sessionNo");

-- AddForeignKey
ALTER TABLE "SchoolAttendanceSetting" ADD CONSTRAINT "SchoolAttendanceSetting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingJournal" ADD CONSTRAINT "TeachingJournal_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingJournal" ADD CONSTRAINT "TeachingJournal_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingJournal" ADD CONSTRAINT "TeachingJournal_attendanceMeetingId_fkey" FOREIGN KEY ("attendanceMeetingId") REFERENCES "AttendanceMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingJournal" ADD CONSTRAINT "TeachingJournal_learningObjectiveId_fkey" FOREIGN KEY ("learningObjectiveId") REFERENCES "LearningObjective"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingJournal" ADD CONSTRAINT "TeachingJournal_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "AttendanceMeeting_teachingAssignmentId_meetingDate_sessionNo_ke" RENAME TO "AttendanceMeeting_teachingAssignmentId_meetingDate_sessionN_key";

-- RenameIndex
ALTER INDEX "GradeReportPolicy_schoolId_academicYearId_academicPeriodId_curr" RENAME TO "GradeReportPolicy_schoolId_academicYearId_academicPeriodId__key";
