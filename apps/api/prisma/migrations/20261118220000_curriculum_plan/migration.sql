-- CreateTable
CREATE TABLE "Curriculum" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" TEXT NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumPlacement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningObjective" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialScope" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "code" VARCHAR(32) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormativeAssessment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "learningObjectiveId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormativeAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SummativeAssessment" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "materialScopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SummativeAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Curriculum_schoolId_academicYearId_code_key" ON "Curriculum"("schoolId", "academicYearId", "code");

-- CreateIndex
CREATE INDEX "Curriculum_schoolId_name_idx" ON "Curriculum"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumPlacement_curriculumId_classId_subjectId_key" ON "CurriculumPlacement"("curriculumId", "classId", "subjectId");

-- CreateIndex
CREATE INDEX "CurriculumPlacement_schoolId_idx" ON "CurriculumPlacement"("schoolId");

-- CreateIndex
CREATE INDEX "CurriculumPlacement_classId_subjectId_idx" ON "CurriculumPlacement"("classId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningObjective_teachingAssignmentId_code_key" ON "LearningObjective"("teachingAssignmentId", "code");

-- CreateIndex
CREATE INDEX "LearningObjective_schoolId_sequence_idx" ON "LearningObjective"("schoolId", "sequence");

-- CreateIndex
CREATE INDEX "LearningObjective_curriculumId_idx" ON "LearningObjective"("curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialScope_teachingAssignmentId_code_key" ON "MaterialScope"("teachingAssignmentId", "code");

-- CreateIndex
CREATE INDEX "MaterialScope_schoolId_sequence_idx" ON "MaterialScope"("schoolId", "sequence");

-- CreateIndex
CREATE INDEX "MaterialScope_curriculumId_idx" ON "MaterialScope"("curriculumId");

-- CreateIndex
CREATE INDEX "FormativeAssessment_schoolId_idx" ON "FormativeAssessment"("schoolId");

-- CreateIndex
CREATE INDEX "FormativeAssessment_learningObjectiveId_idx" ON "FormativeAssessment"("learningObjectiveId");

-- CreateIndex
CREATE INDEX "SummativeAssessment_schoolId_idx" ON "SummativeAssessment"("schoolId");

-- CreateIndex
CREATE INDEX "SummativeAssessment_materialScopeId_idx" ON "SummativeAssessment"("materialScopeId");

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curriculum" ADD CONSTRAINT "Curriculum_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumPlacement" ADD CONSTRAINT "CurriculumPlacement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumPlacement" ADD CONSTRAINT "CurriculumPlacement_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumPlacement" ADD CONSTRAINT "CurriculumPlacement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumPlacement" ADD CONSTRAINT "CurriculumPlacement_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialScope" ADD CONSTRAINT "MaterialScope_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialScope" ADD CONSTRAINT "MaterialScope_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialScope" ADD CONSTRAINT "MaterialScope_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormativeAssessment" ADD CONSTRAINT "FormativeAssessment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormativeAssessment" ADD CONSTRAINT "FormativeAssessment_learningObjectiveId_fkey" FOREIGN KEY ("learningObjectiveId") REFERENCES "LearningObjective"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummativeAssessment" ADD CONSTRAINT "SummativeAssessment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummativeAssessment" ADD CONSTRAINT "SummativeAssessment_materialScopeId_fkey" FOREIGN KEY ("materialScopeId") REFERENCES "MaterialScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
