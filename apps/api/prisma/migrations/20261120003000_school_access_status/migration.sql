CREATE TYPE "SchoolAccessStatus" AS ENUM ('AKTIF', 'NONAKTIF', 'DITANGGUHKAN');

ALTER TABLE "School" ADD COLUMN "accessStatus" "SchoolAccessStatus" NOT NULL DEFAULT 'AKTIF';

UPDATE "School" SET "accessStatus" = 'NONAKTIF' WHERE "isActive" = false;
