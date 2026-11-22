-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'TERBIT', 'SELESAI');

-- CreateEnum
CREATE TYPE "PayrollSlipStatus" AS ENUM ('DRAFT', 'DITERBITKAN', 'DIBAYAR');

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "ratePerJtm" INTEGER NOT NULL DEFAULT 35000,
    "ratePerHadir" INTEGER NOT NULL DEFAULT 25000,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSlip" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeName" VARCHAR(160) NOT NULL,
    "roleLabel" VARCHAR(100) NOT NULL,
    "totalHadirDays" INTEGER NOT NULL DEFAULT 0,
    "totalJtmHours" INTEGER NOT NULL DEFAULT 0,
    "baseHonor" INTEGER NOT NULL DEFAULT 0,
    "attendanceBonus" INTEGER NOT NULL DEFAULT 0,
    "positionBonus" INTEGER NOT NULL DEFAULT 0,
    "deductionAmount" INTEGER NOT NULL DEFAULT 0,
    "deductionNote" VARCHAR(300),
    "netPay" INTEGER NOT NULL DEFAULT 0,
    "status" "PayrollSlipStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollPeriod_schoolId_status_idx" ON "PayrollPeriod"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_schoolId_year_month_key" ON "PayrollPeriod"("schoolId", "year", "month");

-- CreateIndex
CREATE INDEX "PayrollSlip_schoolId_userId_status_idx" ON "PayrollSlip"("schoolId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSlip_periodId_userId_key" ON "PayrollSlip"("periodId", "userId");

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
