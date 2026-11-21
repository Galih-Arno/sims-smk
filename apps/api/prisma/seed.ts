import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { RoleCode } from "@sims/shared";
import { hashPassword } from "../src/lib/password.ts";
import { ensureRoles, grantAssignment } from "../src/modules/access/assignments.ts";

if (process.env.NODE_ENV === "production") {
  throw new Error("Seed development tidak boleh dijalankan di production.");
}

const databaseUrl = process.env.DATABASE_URL ?? "";
if (databaseUrl.includes("sims_smk_test")) {
  throw new Error("Seed development tidak boleh memakai database test.");
}

const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? "").trim().toLowerCase();
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "";
const ownerName = (process.env.SEED_OWNER_NAME ?? "Pemilik Sistem").trim();

if (!ownerEmail || ownerPassword.length < 12) {
  throw new Error("SEED_OWNER_EMAIL dan SEED_OWNER_PASSWORD (minimal 12 karakter) wajib diisi.");
}

const prisma = new PrismaClient();

const schools = [
  {
    name: "SMK Negeri 1 Contoh",
    npsn: "20100001",
    address: "Jl. Pendidikan No. 1",
    phone: "0210000001",
    email: "smk1@sims.local",
  },
  {
    name: "SMK Negeri 2 Contoh",
    npsn: "20100002",
    address: "Jl. Pendidikan No. 2",
    phone: "0210000002",
    email: "smk2@sims.local",
  },
] as const;

const devUsers: Array<{
  email: string;
  password: string;
  name: string;
  assignments: Array<{ roleCode: RoleCode; npsn: string | null }>;
}> = [
  {
    email: ownerEmail,
    password: ownerPassword,
    name: ownerName,
    assignments: [{ roleCode: "SYSTEM_OWNER", npsn: null }],
  },
  {
    email: "admin.smk1@sims.local",
    password: "AdminSmk1!2026",
    name: "Admin SMK 1",
    assignments: [{ roleCode: "ADMIN_SEKOLAH", npsn: "20100001" }],
  },
  {
    email: "admin.smk2@sims.local",
    password: "AdminSmk2!2026",
    name: "Admin SMK 2",
    assignments: [{ roleCode: "ADMIN_SEKOLAH", npsn: "20100002" }],
  },
  {
    email: "guru.multi@sims.local",
    password: "GuruMulti!2026",
    name: "Siti Multi Peran",
    assignments: [
      { roleCode: "GURU_MAPEL", npsn: "20100001" },
      { roleCode: "WALI_KELAS", npsn: "20100001" },
      { roleCode: "TU", npsn: "20100002" },
    ],
  },
];

async function upsertSchool(input: (typeof schools)[number]) {
  return prisma.school.upsert({
    where: { npsn: input.npsn },
    update: {
      name: input.name,
      address: input.address,
      phone: input.phone,
      email: input.email,
      isActive: true,
    },
    create: { ...input, isActive: true },
  });
}

async function upsertUser(email: string, name: string, password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email,
      name,
      passwordHash,
      isActive: true,
    },
  });
}

async function seedPeriods(schoolId: string, npsn: string) {
  const periods = [
    {
      name: "2026/2027 Ganjil",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      isActive: true,
    },
    {
      name: "2026/2027 Genap",
      startDate: new Date("2027-01-01T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      isActive: false,
    },
  ];

  for (const period of periods) {
    if (npsn === "20100002" && period.name.endsWith("Genap")) {
      continue;
    }
    await prisma.academicPeriod.upsert({
      where: { schoolId_name: { schoolId, name: period.name } },
      update: {
        startDate: period.startDate,
        endDate: period.endDate,
        isActive: period.isActive,
      },
      create: {
        schoolId,
        ...period,
      },
    });
  }
}

async function linkAcademicYear(schoolId: string) {
  const year = await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId, name: "2026/2027" } },
    update: {},
    create: {
      schoolId,
      name: "2026/2027",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      isActive: true,
    },
  });
  await prisma.academicPeriod.updateMany({
    where: { schoolId, name: { startsWith: "2026/2027 Ganjil" }, academicYearId: null },
    data: { academicYearId: year.id, semesterKind: "GANJIL" },
  });
  await prisma.academicPeriod.updateMany({
    where: { schoolId, name: { startsWith: "2026/2027 Genap" }, academicYearId: null },
    data: { academicYearId: year.id, semesterKind: "GENAP" },
  });
}

async function main() {
  await ensureRoles(prisma);
  const schoolByNpsn = new Map<string, string>();

  for (const school of schools) {
    const saved = await upsertSchool(school);
    schoolByNpsn.set(school.npsn, saved.id);
    await seedPeriods(saved.id, school.npsn);
    await linkAcademicYear(saved.id);
  }

  for (const devUser of devUsers) {
    const user = await upsertUser(devUser.email, devUser.name, devUser.password);
    for (const assignment of devUser.assignments) {
      const schoolId = assignment.npsn ? (schoolByNpsn.get(assignment.npsn) ?? null) : null;
      if (assignment.npsn && !schoolId) {
        throw new Error(`Sekolah ${assignment.npsn} tidak ditemukan.`);
      }
      await grantAssignment(prisma, {
        userId: user.id,
        roleCode: assignment.roleCode,
        schoolId,
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
