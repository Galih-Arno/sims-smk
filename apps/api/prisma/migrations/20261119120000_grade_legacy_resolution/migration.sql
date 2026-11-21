-- Penyelesaian status lama bersifat tambahan. Baris GradeSubmission dan nilai tidak dihapus.
-- Kolom baru kosong sampai Admin Sekolah atau pemilik sistem mengonfirmasi penyelesaian.
ALTER TABLE "GradeSubmission" ADD COLUMN "legacyResolvedAt" TIMESTAMP(3),
ADD COLUMN "legacyResolvedById" TEXT,
ADD COLUMN "legacyResolutionNote" VARCHAR(500);
