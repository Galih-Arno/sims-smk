-- Absensi harian wali kelas. Terpisah dari absensi per mata pelajaran.
CREATE TABLE "DailyAttendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "homeroomAssignmentId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "status" "AttendanceMeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAttendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyAttendanceRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dailyAttendanceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceMark",
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyAttendanceCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dailyAttendanceId" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAttendanceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyAttendance_homeroomAssignmentId_attendanceDate_key" ON "DailyAttendance"("homeroomAssignmentId", "attendanceDate");
CREATE INDEX "DailyAttendance_schoolId_attendanceDate_idx" ON "DailyAttendance"("schoolId", "attendanceDate");
CREATE INDEX "DailyAttendance_homeroomAssignmentId_status_idx" ON "DailyAttendance"("homeroomAssignmentId", "status");
CREATE UNIQUE INDEX "DailyAttendanceRecord_dailyAttendanceId_studentId_key" ON "DailyAttendanceRecord"("dailyAttendanceId", "studentId");
CREATE INDEX "DailyAttendanceRecord_schoolId_studentId_idx" ON "DailyAttendanceRecord"("schoolId", "studentId");
CREATE INDEX "DailyAttendanceCorrection_schoolId_dailyAttendanceId_idx" ON "DailyAttendanceCorrection"("schoolId", "dailyAttendanceId");

ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyAttendance" ADD CONSTRAINT "DailyAttendance_homeroomAssignmentId_fkey" FOREIGN KEY ("homeroomAssignmentId") REFERENCES "HomeroomAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAttendanceRecord" ADD CONSTRAINT "DailyAttendanceRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyAttendanceRecord" ADD CONSTRAINT "DailyAttendanceRecord_dailyAttendanceId_fkey" FOREIGN KEY ("dailyAttendanceId") REFERENCES "DailyAttendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyAttendanceRecord" ADD CONSTRAINT "DailyAttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAttendanceCorrection" ADD CONSTRAINT "DailyAttendanceCorrection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyAttendanceCorrection" ADD CONSTRAINT "DailyAttendanceCorrection_dailyAttendanceId_fkey" FOREIGN KEY ("dailyAttendanceId") REFERENCES "DailyAttendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
