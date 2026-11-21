-- Hasil resmi nilai akhir yang disimpan. Tidak mengubah nilai mentah atau status pengiriman.
CREATE TABLE "GradeFinalResult" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "formula" VARCHAR(1000) NOT NULL,
    "detail" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeFinalResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GradeFinalResult_teachingAssignmentId_studentId_key" ON "GradeFinalResult"("teachingAssignmentId", "studentId");
CREATE INDEX "GradeFinalResult_schoolId_idx" ON "GradeFinalResult"("schoolId");

ALTER TABLE "GradeFinalResult" ADD CONSTRAINT "GradeFinalResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GradeFinalResult" ADD CONSTRAINT "GradeFinalResult_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeFinalResult" ADD CONSTRAINT "GradeFinalResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
