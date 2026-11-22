-- CreateEnum
CREATE TYPE "StaffLeaveType" AS ENUM ('CUTI', 'IZIN', 'SAKIT', 'DINAS_LUAR_SPD');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('MENUNGGU', 'DISETUJUI', 'DITOLAK');

-- CreateEnum
CREATE TYPE "CharacterRecordType" AS ENUM ('PRESTASI', 'PELANGGARAN');

-- CreateEnum
CREATE TYPE "CounselingReportStatus" AS ENUM ('BARU', 'DIPROSES', 'SELESAI');

-- CreateTable
CREATE TABLE "StaffLeaveRequest" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveType" "StaffLeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "attachmentUrl" VARCHAR(500),
    "status" "ApprovalStatus" NOT NULL DEFAULT 'MENUNGGU',
    "reviewedById" TEXT,
    "reviewNote" VARCHAR(500),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCharacterRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "recordType" "CharacterRecordType" NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "points" INTEGER NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "recordedBy" VARCHAR(120),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCharacterRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounselingReport" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "reporterUserId" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "subject" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "status" "CounselingReportStatus" NOT NULL DEFAULT 'BARU',
    "counselorNote" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounselingReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffLeaveRequest_schoolId_status_startDate_idx" ON "StaffLeaveRequest"("schoolId", "status", "startDate");

-- CreateIndex
CREATE INDEX "StaffLeaveRequest_userId_startDate_idx" ON "StaffLeaveRequest"("userId", "startDate");

-- CreateIndex
CREATE INDEX "StudentCharacterRecord_schoolId_studentId_occurredAt_idx" ON "StudentCharacterRecord"("schoolId", "studentId", "occurredAt");

-- CreateIndex
CREATE INDEX "CounselingReport_schoolId_status_createdAt_idx" ON "CounselingReport"("schoolId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffLeaveRequest" ADD CONSTRAINT "StaffLeaveRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeaveRequest" ADD CONSTRAINT "StaffLeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeaveRequest" ADD CONSTRAINT "StaffLeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCharacterRecord" ADD CONSTRAINT "StudentCharacterRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCharacterRecord" ADD CONSTRAINT "StudentCharacterRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselingReport" ADD CONSTRAINT "CounselingReport_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselingReport" ADD CONSTRAINT "CounselingReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselingReport" ADD CONSTRAINT "CounselingReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
