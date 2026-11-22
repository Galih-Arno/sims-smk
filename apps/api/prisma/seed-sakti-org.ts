import "dotenv/config";
import { PrismaClient, type RoleCode } from "@prisma/client";
import { hashPassword } from "../src/lib/password.ts";
import { ensureRoles, grantAssignment } from "../src/modules/access/assignments.ts";

const prisma = new PrismaClient();
const TEST_PASSWORD = process.env.TEST_ORG_PASSWORD ?? "Sakti2026!";

const ORG_ACCOUNTS: Array<{ email: string; name: string; roles: RoleCode[] }> = [
  { email: "kepsek@smkpgripasirsakti.sch.id", name: "Khairun Nisa Rakhmasari, S.Pd", roles: ["KEPALA_SEKOLAH"] },
  { email: "komite@smkpgripasirsakti.sch.id", name: "I Nyoman Yunianto", roles: ["KOMITE_SEKOLAH"] },
  { email: "wakakur@smkpgripasirsakti.sch.id", name: "Nurcholis, S.Pd", roles: ["WAKAKUR", "GURU_MAPEL"] },
  { email: "wakakesiswaan@smkpgripasirsakti.sch.id", name: "Nurul Huda, S.Pd", roles: ["WAKA_KESISWAAN", "GURU_MAPEL"] },
  { email: "wakasarpras@smkpgripasirsakti.sch.id", name: "Didit Agung Prabowo, ST", roles: ["WAKA_SARPRAS", "GURU_MAPEL"] },
  { email: "wakahumas@smkpgripasirsakti.sch.id", name: "Heru Supriyanto, S.Pd", roles: ["WAKA_HUMAS", "GURU_MAPEL"] },
  { email: "bendahara.komite@smkpgripasirsakti.sch.id", name: "Sri Yuningsih, S.Pd, M.Si", roles: ["BENDAHARA", "GURU_MAPEL"] },
  { email: "bendahara.bos@smkpgripasirsakti.sch.id", name: "Wahyu Eka Sumaryati, S.Pd", roles: ["BENDAHARA", "GURU_MAPEL"] },
  { email: "bendahara.barang@smkpgripasirsakti.sch.id", name: "Reni Diah Setiowati, MM", roles: ["BENDAHARA", "TU"] },
  { email: "kepalatu@smkpgripasirsakti.sch.id", name: "Zulkarnaen", roles: ["TU", "ADMIN_SEKOLAH"] },
  { email: "operator@smkpgripasirsakti.sch.id", name: "Yogi Nugroho, SE", roles: ["OPERATOR_SEKOLAH", "ADMIN_SEKOLAH", "TU"] },
  { email: "tu.kurikulum@smkpgripasirsakti.sch.id", name: "Endang Susilowati", roles: ["TU"] },
  { email: "tu.umum@smkpgripasirsakti.sch.id", name: "Sugeng Wahyudi, A.Md T", roles: ["TU"] },
  { email: "tu.siswa@smkpgripasirsakti.sch.id", name: "Rizky Hermin F., A.Md T", roles: ["TU"] },
  { email: "kaprog.tjkt@smkpgripasirsakti.sch.id", name: "Filma Andriani, S.Kom", roles: ["KAPROG", "GURU_MAPEL"] },
  { email: "kaprog.tsm@smkpgripasirsakti.sch.id", name: "Made Raiyanto, ST", roles: ["KAPROG", "GURU_MAPEL"] },
  { email: "kaprog.akl@smkpgripasirsakti.sch.id", name: "Sulistianingsih, SE", roles: ["KAPROG", "GURU_MAPEL"] },
  { email: "kaprog.bdp@smkpgripasirsakti.sch.id", name: "Lia Apriyanti, M.Pd", roles: ["KAPROG", "GURU_MAPEL"] },
  { email: "kaprog.ph@smkpgripasirsakti.sch.id", name: "Ni Wayan Seriyati, SE", roles: ["KAPROG", "GURU_MAPEL"] },
  { email: "suwartini@smkpgripasirsakti.sch.id", name: "Suwartini, S.Pd", roles: ["GURU_MAPEL", "WALI_KELAS"] },
];

async function main() {
  await ensureRoles(prisma);
  const school = await prisma.school.upsert({
    where: { npsn: "10814092" },
    update: { name: "SMK PGRI Pasir Sakti", address: "Jl. Merdeka No. 1, Pasir Sakti, Lampung Timur", email: "smkpgripasirsakti@yahoo.co.id", accessStatus: "AKTIF" },
    create: { name: "SMK PGRI Pasir Sakti", npsn: "10814092", address: "Jl. Merdeka No. 1, Pasir Sakti, Lampung Timur", email: "smkpgripasirsakti@yahoo.co.id", accessStatus: "AKTIF" },
  });
  const passwordHash = await hashPassword(TEST_PASSWORD);
  for (const acc of ORG_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      update: { name: acc.name, passwordHash, isActive: true, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
      create: { email: acc.email, name: acc.name, passwordHash, isActive: true, mustChangePassword: false },
    });
    for (const roleCode of acc.roles) {
      await grantAssignment(prisma, { userId: user.id, roleCode, schoolId: school.id });
    }
  }
  console.log("OK_SEED", ORG_ACCOUNTS.length);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
