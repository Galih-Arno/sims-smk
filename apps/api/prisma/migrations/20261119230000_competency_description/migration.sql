-- Deskripsi capaian kompetensi. Terpisah dari nilai dan absensi.
CREATE TABLE "CompetencyDescription" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "status" "AssessmentWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "recipientTeacherId" TEXT,
    "revisionReason" VARCHAR(500),
    "revisionRequestedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" VARCHAR(500),
    "evidenceSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyDescription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetencyDescriptionEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "descriptionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyDescriptionEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompetencyDescription_teachingAssignmentId_key" ON "CompetencyDescription"("teachingAssignmentId");
CREATE INDEX "CompetencyDescription_schoolId_status_idx" ON "CompetencyDescription"("schoolId", "status");
CREATE INDEX "CompetencyDescription_recipientTeacherId_idx" ON "CompetencyDescription"("recipientTeacherId");
CREATE UNIQUE INDEX "CompetencyDescriptionEntry_descriptionId_studentId_key" ON "CompetencyDescriptionEntry"("descriptionId", "studentId");
CREATE INDEX "CompetencyDescriptionEntry_schoolId_studentId_idx" ON "CompetencyDescriptionEntry"("schoolId", "studentId");

ALTER TABLE "CompetencyDescription" ADD CONSTRAINT "CompetencyDescription_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetencyDescription" ADD CONSTRAINT "CompetencyDescription_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetencyDescription" ADD CONSTRAINT "CompetencyDescription_recipientTeacherId_fkey" FOREIGN KEY ("recipientTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetencyDescriptionEntry" ADD CONSTRAINT "CompetencyDescriptionEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetencyDescriptionEntry" ADD CONSTRAINT "CompetencyDescriptionEntry_descriptionId_fkey" FOREIGN KEY ("descriptionId") REFERENCES "CompetencyDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetencyDescriptionEntry" ADD CONSTRAINT "CompetencyDescriptionEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
