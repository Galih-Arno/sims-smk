-- Pemeriksaan, validasi, dan pengesahan rapor. Snapshot yang sudah disahkan tidak diubah.
ALTER TABLE "SchoolClass" ADD COLUMN "fase" VARCHAR(16);
ALTER TABLE "AcademicPeriod" ADD COLUMN "reportDate" DATE;

CREATE TYPE "ReportCardStatus" AS ENUM ('DRAF', 'DIAJUKAN', 'DISETUJUI_WAKAKUR', 'DIKEMBALIKAN', 'DISAHKAN');

CREATE TABLE "StudentReportActivity" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "pklText" VARCHAR(2000),
    "extracurricularText" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentReportActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportReview" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "homeroomAssignmentId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportCardWorkflow" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "homeroomAssignmentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "status" "ReportCardStatus" NOT NULL DEFAULT 'DRAF',
    "fingerprint" VARCHAR(64),
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "wakakurDecidedAt" TIMESTAMP(3),
    "wakakurDecidedById" TEXT,
    "wakakurReason" VARCHAR(500),
    "endorsedAt" TIMESTAMP(3),
    "endorsedById" TEXT,
    "principalReason" VARCHAR(500),
    "activeSnapshotId" TEXT,
    "reviewResetAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReportCardWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportCardSnapshot" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "endorsedById" TEXT NOT NULL,
    "endorsedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportCardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportCardEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "fromStatus" "ReportCardStatus",
    "toStatus" "ReportCardStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "fingerprint" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportCardEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentReportActivity_studentId_academicPeriodId_key" ON "StudentReportActivity"("studentId", "academicPeriodId");
CREATE INDEX "StudentReportActivity_schoolId_academicPeriodId_idx" ON "StudentReportActivity"("schoolId", "academicPeriodId");
CREATE INDEX "ReportReview_schoolId_studentId_academicPeriodId_reviewedAt_idx" ON "ReportReview"("schoolId", "studentId", "academicPeriodId", "reviewedAt");
CREATE UNIQUE INDEX "ReportCardWorkflow_studentId_academicPeriodId_key" ON "ReportCardWorkflow"("studentId", "academicPeriodId");
CREATE UNIQUE INDEX "ReportCardWorkflow_activeSnapshotId_key" ON "ReportCardWorkflow"("activeSnapshotId");
CREATE INDEX "ReportCardWorkflow_schoolId_academicPeriodId_status_idx" ON "ReportCardWorkflow"("schoolId", "academicPeriodId", "status");
CREATE UNIQUE INDEX "ReportCardSnapshot_studentId_academicPeriodId_version_key" ON "ReportCardSnapshot"("studentId", "academicPeriodId", "version");
CREATE INDEX "ReportCardSnapshot_workflowId_idx" ON "ReportCardSnapshot"("workflowId");
CREATE INDEX "ReportCardEvent_schoolId_workflowId_createdAt_idx" ON "ReportCardEvent"("schoolId", "workflowId", "createdAt");

ALTER TABLE "StudentReportActivity" ADD CONSTRAINT "StudentReportActivity_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentReportActivity" ADD CONSTRAINT "StudentReportActivity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentReportActivity" ADD CONSTRAINT "StudentReportActivity_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportReview" ADD CONSTRAINT "ReportReview_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportReview" ADD CONSTRAINT "ReportReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportReview" ADD CONSTRAINT "ReportReview_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportReview" ADD CONSTRAINT "ReportReview_homeroomAssignmentId_fkey" FOREIGN KEY ("homeroomAssignmentId") REFERENCES "HomeroomAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportReview" ADD CONSTRAINT "ReportReview_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardWorkflow" ADD CONSTRAINT "ReportCardWorkflow_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportCardWorkflow" ADD CONSTRAINT "ReportCardWorkflow_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardWorkflow" ADD CONSTRAINT "ReportCardWorkflow_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardWorkflow" ADD CONSTRAINT "ReportCardWorkflow_homeroomAssignmentId_fkey" FOREIGN KEY ("homeroomAssignmentId") REFERENCES "HomeroomAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardWorkflow" ADD CONSTRAINT "ReportCardWorkflow_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardWorkflow" ADD CONSTRAINT "ReportCardWorkflow_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardSnapshot" ADD CONSTRAINT "ReportCardSnapshot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportCardSnapshot" ADD CONSTRAINT "ReportCardSnapshot_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ReportCardWorkflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardSnapshot" ADD CONSTRAINT "ReportCardSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardSnapshot" ADD CONSTRAINT "ReportCardSnapshot_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportCardWorkflow" ADD CONSTRAINT "ReportCardWorkflow_activeSnapshotId_fkey" FOREIGN KEY ("activeSnapshotId") REFERENCES "ReportCardSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReportCardEvent" ADD CONSTRAINT "ReportCardEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportCardEvent" ADD CONSTRAINT "ReportCardEvent_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ReportCardWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
