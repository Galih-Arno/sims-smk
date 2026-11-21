-- CreateEnum
CREATE TYPE "AssessmentWorkflowStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED');

-- AlterTable
ALTER TABLE "School" ADD COLUMN "requireUh" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireT1" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireT2" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireT3" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireSummative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireSts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireSas" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GradeSubmission" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "status" "AssessmentWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "revisionReason" VARCHAR(500),
    "revisionRequestedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GradeSubmission_teachingAssignmentId_key" ON "GradeSubmission"("teachingAssignmentId");

-- CreateIndex
CREATE INDEX "GradeSubmission_schoolId_status_idx" ON "GradeSubmission"("schoolId", "status");

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeSubmission" ADD CONSTRAINT "GradeSubmission_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
