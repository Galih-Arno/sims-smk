-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RoleCode" ADD VALUE 'KOMITE_SEKOLAH';
ALTER TYPE "RoleCode" ADD VALUE 'WAKA_KESISWAAN';
ALTER TYPE "RoleCode" ADD VALUE 'WAKA_SARPRAS';
ALTER TYPE "RoleCode" ADD VALUE 'WAKA_HUMAS';
ALTER TYPE "RoleCode" ADD VALUE 'BENDAHARA';
ALTER TYPE "RoleCode" ADD VALUE 'OPERATOR_SEKOLAH';
ALTER TYPE "RoleCode" ADD VALUE 'KAPROG';
