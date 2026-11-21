-- AlterTable
ALTER TABLE "School" ADD COLUMN "stsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "School" ADD COLUMN "sasEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "GradeStatus" AS ENUM ('DRAFT');

-- CreateIndex
CREATE UNIQUE INDEX "FormativeAssessment_learningObjectiveId_key" ON "FormativeAssessment"("learningObjectiveId");

-- CreateIndex
CREATE UNIQUE INDEX "SummativeAssessment_materialScopeId_key" ON "SummativeAssessment"("materialScopeId");

-- CreateTable
CREATE TABLE "FormativeScore" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "formativeAssessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "uh" DECIMAL(5,2),
    "t1" DECIMAL(5,2),
    "t2" DECIMAL(5,2),
    "t3" DECIMAL(5,2),
    "remedial" DECIMAL(5,2),
    "status" "GradeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormativeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SummativeScore" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "summativeAssessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DECIMAL(5,2),
    "remedial" DECIMAL(5,2),
    "status" "GradeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SummativeScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermExamScore" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sts" DECIMAL(5,2),
    "sas" DECIMAL(5,2),
    "status" "GradeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermExamScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormativeScore_formativeAssessmentId_studentId_key" ON "FormativeScore"("formativeAssessmentId", "studentId");
CREATE INDEX "FormativeScore_schoolId_idx" ON "FormativeScore"("schoolId");
CREATE INDEX "FormativeScore_studentId_idx" ON "FormativeScore"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SummativeScore_summativeAssessmentId_studentId_key" ON "SummativeScore"("summativeAssessmentId", "studentId");
CREATE INDEX "SummativeScore_schoolId_idx" ON "SummativeScore"("schoolId");
CREATE INDEX "SummativeScore_studentId_idx" ON "SummativeScore"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TermExamScore_teachingAssignmentId_studentId_key" ON "TermExamScore"("teachingAssignmentId", "studentId");
CREATE INDEX "TermExamScore_schoolId_idx" ON "TermExamScore"("schoolId");
CREATE INDEX "TermExamScore_studentId_idx" ON "TermExamScore"("studentId");

-- AddForeignKey
ALTER TABLE "FormativeScore" ADD CONSTRAINT "FormativeScore_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormativeScore" ADD CONSTRAINT "FormativeScore_formativeAssessmentId_fkey" FOREIGN KEY ("formativeAssessmentId") REFERENCES "FormativeAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormativeScore" ADD CONSTRAINT "FormativeScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SummativeScore" ADD CONSTRAINT "SummativeScore_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SummativeScore" ADD CONSTRAINT "SummativeScore_summativeAssessmentId_fkey" FOREIGN KEY ("summativeAssessmentId") REFERENCES "SummativeAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SummativeScore" ADD CONSTRAINT "SummativeScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermExamScore" ADD CONSTRAINT "TermExamScore_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TermExamScore" ADD CONSTRAINT "TermExamScore_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TermExamScore" ADD CONSTRAINT "TermExamScore_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
