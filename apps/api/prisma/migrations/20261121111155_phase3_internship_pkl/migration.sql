-- CreateEnum
CREATE TYPE "InternshipStatus" AS ENUM ('AKTIF', 'SELESAI', 'DIBATALKAN');

-- CreateEnum
CREATE TYPE "InternshipLogStatus" AS ENUM ('MENUNGGU', 'DISETUJUI', 'REVISI');

-- CreateTable
CREATE TABLE "InternshipPlacement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "companyName" VARCHAR(200) NOT NULL,
    "companyAddress" VARCHAR(400),
    "supervisorName" VARCHAR(120),
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "InternshipStatus" NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternshipPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternshipLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "logDate" DATE NOT NULL,
    "activity" VARCHAR(2000) NOT NULL,
    "locationNote" VARCHAR(300),
    "status" "InternshipLogStatus" NOT NULL DEFAULT 'MENUNGGU',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternshipLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternshipPlacement_schoolId_studentId_status_idx" ON "InternshipPlacement"("schoolId", "studentId", "status");

-- CreateIndex
CREATE INDEX "InternshipLog_schoolId_logDate_status_idx" ON "InternshipLog"("schoolId", "logDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InternshipLog_placementId_logDate_key" ON "InternshipLog"("placementId", "logDate");

-- AddForeignKey
ALTER TABLE "InternshipPlacement" ADD CONSTRAINT "InternshipPlacement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipPlacement" ADD CONSTRAINT "InternshipPlacement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipLog" ADD CONSTRAINT "InternshipLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipLog" ADD CONSTRAINT "InternshipLog_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "InternshipPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipLog" ADD CONSTRAINT "InternshipLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipLog" ADD CONSTRAINT "InternshipLog_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
