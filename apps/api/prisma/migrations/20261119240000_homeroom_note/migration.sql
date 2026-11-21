-- Catatan wali kelas per siswa dan semester. Terpisah dari nilai, deskripsi, dan absensi.
CREATE TYPE "HomeroomNoteStatus" AS ENUM ('DRAFT', 'FINAL');

CREATE TABLE "HomeroomNote" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "homeroomAssignmentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "status" "HomeroomNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeroomNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomeroomNoteCorrection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "previousText" VARCHAR(2000) NOT NULL,
    "nextText" VARCHAR(2000) NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeroomNoteCorrection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HomeroomNote_studentId_academicPeriodId_key" ON "HomeroomNote"("studentId", "academicPeriodId");
CREATE INDEX "HomeroomNote_schoolId_classId_academicPeriodId_idx" ON "HomeroomNote"("schoolId", "classId", "academicPeriodId");
CREATE INDEX "HomeroomNote_homeroomAssignmentId_status_idx" ON "HomeroomNote"("homeroomAssignmentId", "status");
CREATE INDEX "HomeroomNoteCorrection_schoolId_noteId_idx" ON "HomeroomNoteCorrection"("schoolId", "noteId");

ALTER TABLE "HomeroomNote" ADD CONSTRAINT "HomeroomNote_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeroomNote" ADD CONSTRAINT "HomeroomNote_homeroomAssignmentId_fkey" FOREIGN KEY ("homeroomAssignmentId") REFERENCES "HomeroomAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomeroomNote" ADD CONSTRAINT "HomeroomNote_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomeroomNote" ADD CONSTRAINT "HomeroomNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomeroomNote" ADD CONSTRAINT "HomeroomNote_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomeroomNote" ADD CONSTRAINT "HomeroomNote_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "AcademicPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HomeroomNoteCorrection" ADD CONSTRAINT "HomeroomNoteCorrection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeroomNoteCorrection" ADD CONSTRAINT "HomeroomNoteCorrection_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "HomeroomNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
