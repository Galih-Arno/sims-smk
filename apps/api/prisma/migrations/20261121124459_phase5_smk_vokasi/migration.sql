-- CreateEnum
CREATE TYPE "ToolCondition" AS ENUM ('BAIK', 'PERLU_PERBAIKAN', 'RUSAK');

-- CreateEnum
CREATE TYPE "ToolLoanStatus" AS ENUM ('DIPINJAM', 'DIKEMBALIKAN');

-- CreateEnum
CREATE TYPE "TracerStatus" AS ENUM ('BEKERJA', 'WIRAUSAHA', 'KULIAH', 'BELUM_BEKERJA');

-- CreateTable
CREATE TABLE "WorkshopTool" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assetCode" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "labName" VARCHAR(120) NOT NULL,
    "totalQty" INTEGER NOT NULL DEFAULT 1,
    "availableQty" INTEGER NOT NULL DEFAULT 1,
    "condition" "ToolCondition" NOT NULL DEFAULT 'BAIK',
    "notes" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolLoan" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "borrowerName" VARCHAR(160) NOT NULL,
    "borrowerRole" VARCHAR(80) NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "purpose" VARCHAR(300),
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "status" "ToolLoanStatus" NOT NULL DEFAULT 'DIPINJAM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BkkJobPost" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "companyName" VARCHAR(160) NOT NULL,
    "positionTitle" VARCHAR(160) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "majorTarget" VARCHAR(120),
    "deadline" DATE,
    "description" VARCHAR(2000) NOT NULL,
    "contactInfo" VARCHAR(200),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BkkJobPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlumniTracer" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "alumniName" VARCHAR(160) NOT NULL,
    "graduationYear" INTEGER NOT NULL,
    "majorName" VARCHAR(120) NOT NULL,
    "status" "TracerStatus" NOT NULL DEFAULT 'BEKERJA',
    "institutionName" VARCHAR(160),
    "positionOrStudy" VARCHAR(160),
    "phone" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlumniTracer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkshopTool_schoolId_labName_idx" ON "WorkshopTool"("schoolId", "labName");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopTool_schoolId_assetCode_key" ON "WorkshopTool"("schoolId", "assetCode");

-- CreateIndex
CREATE INDEX "ToolLoan_schoolId_status_idx" ON "ToolLoan"("schoolId", "status");

-- CreateIndex
CREATE INDEX "BkkJobPost_schoolId_isActive_idx" ON "BkkJobPost"("schoolId", "isActive");

-- CreateIndex
CREATE INDEX "AlumniTracer_schoolId_graduationYear_status_idx" ON "AlumniTracer"("schoolId", "graduationYear", "status");

-- AddForeignKey
ALTER TABLE "WorkshopTool" ADD CONSTRAINT "WorkshopTool_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolLoan" ADD CONSTRAINT "ToolLoan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolLoan" ADD CONSTRAINT "ToolLoan_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "WorkshopTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BkkJobPost" ADD CONSTRAINT "BkkJobPost_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniTracer" ADD CONSTRAINT "AlumniTracer_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
