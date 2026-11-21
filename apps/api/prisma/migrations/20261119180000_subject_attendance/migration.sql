-- Absensi per mata pelajaran. Bukan rekap ketidakhadiran rapor.
CREATE TYPE "AttendanceMeetingStatus" AS ENUM ('DRAFT', 'FINAL');
CREATE TYPE "AttendanceMark" AS ENUM ('HADIR', 'SAKIT', 'IZIN', 'ALPA');

CREATE TABLE "ClassScheduleSlot" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "dayOfWeek" INTEGER,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassScheduleSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceMeeting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "meetingDate" DATE NOT NULL,
    "sessionNo" INTEGER NOT NULL,
    "scheduleSlotId" TEXT,
    "note" VARCHAR(200),
    "marker" VARCHAR(40),
    "status" "AttendanceMeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceMeeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceMark",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClassScheduleSlot_schoolId_idx" ON "ClassScheduleSlot"("schoolId");
CREATE INDEX "ClassScheduleSlot_teachingAssignmentId_idx" ON "ClassScheduleSlot"("teachingAssignmentId");
CREATE UNIQUE INDEX "AttendanceMeeting_teachingAssignmentId_meetingDate_sessionNo_key" ON "AttendanceMeeting"("teachingAssignmentId", "meetingDate", "sessionNo");
CREATE INDEX "AttendanceMeeting_schoolId_meetingDate_idx" ON "AttendanceMeeting"("schoolId", "meetingDate");
CREATE INDEX "AttendanceMeeting_teachingAssignmentId_status_idx" ON "AttendanceMeeting"("teachingAssignmentId", "status");
CREATE UNIQUE INDEX "AttendanceRecord_meetingId_studentId_key" ON "AttendanceRecord"("meetingId", "studentId");
CREATE INDEX "AttendanceRecord_schoolId_studentId_idx" ON "AttendanceRecord"("schoolId", "studentId");
CREATE INDEX "AttendanceCorrection_schoolId_meetingId_idx" ON "AttendanceCorrection"("schoolId", "meetingId");

ALTER TABLE "ClassScheduleSlot" ADD CONSTRAINT "ClassScheduleSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassScheduleSlot" ADD CONSTRAINT "ClassScheduleSlot_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceMeeting" ADD CONSTRAINT "AttendanceMeeting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceMeeting" ADD CONSTRAINT "AttendanceMeeting_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceMeeting" ADD CONSTRAINT "AttendanceMeeting_scheduleSlotId_fkey" FOREIGN KEY ("scheduleSlotId") REFERENCES "ClassScheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "AttendanceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "AttendanceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
