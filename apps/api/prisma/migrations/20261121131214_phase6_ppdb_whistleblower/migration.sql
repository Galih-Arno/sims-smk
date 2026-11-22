-- CreateEnum
CREATE TYPE "PpdbStatus" AS ENUM ('MENDAFTAR', 'TERVERIFIKASI', 'DITERIMA', 'CADANGAN', 'DITOLAK');

-- CreateEnum
CREATE TYPE "WhistleblowerCategory" AS ENUM ('PERUNDUNGAN_BULLYING', 'KEKERASAN_FISIK_VERBAL', 'FASILITAS_KEAMANAN', 'LAINNYA');

-- CreateEnum
CREATE TYPE "WhistleblowerStatus" AS ENUM ('BARU', 'DITINDAKLANJUTI', 'SELESAI');

-- CreateTable
CREATE TABLE "PpdbApplicant" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "registrationNo" VARCHAR(40) NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "nisn" VARCHAR(20),
    "originSchool" VARCHAR(160) NOT NULL,
    "chosenMajor" VARCHAR(120) NOT NULL,
    "parentPhone" VARCHAR(32) NOT NULL,
    "averageScore" DOUBLE PRECISION,
    "status" "PpdbStatus" NOT NULL DEFAULT 'MENDAFTAR',
    "notes" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PpdbApplicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousReport" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "ticketCode" VARCHAR(32) NOT NULL,
    "category" "WhistleblowerCategory" NOT NULL DEFAULT 'PERUNDUNGAN_BULLYING',
    "incidentPlace" VARCHAR(160),
    "description" VARCHAR(2000) NOT NULL,
    "status" "WhistleblowerStatus" NOT NULL DEFAULT 'BARU',
    "counselorReply" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymousReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PpdbApplicant_schoolId_status_chosenMajor_idx" ON "PpdbApplicant"("schoolId", "status", "chosenMajor");

-- CreateIndex
CREATE UNIQUE INDEX "PpdbApplicant_schoolId_registrationNo_key" ON "PpdbApplicant"("schoolId", "registrationNo");

-- CreateIndex
CREATE INDEX "AnonymousReport_schoolId_status_idx" ON "AnonymousReport"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousReport_schoolId_ticketCode_key" ON "AnonymousReport"("schoolId", "ticketCode");

-- AddForeignKey
ALTER TABLE "PpdbApplicant" ADD CONSTRAINT "PpdbApplicant_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnonymousReport" ADD CONSTRAINT "AnonymousReport_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
