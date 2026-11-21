import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { writeAudit } from "../src/lib/audit.ts";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "../src/lib/password.ts";
import { signAccessToken } from "../src/lib/tokens.ts";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (process.env.NODE_ENV === "production" || databaseUrl.includes("sims_smk_test") || !databaseUrl.includes("/sims_smk")) {
  throw new Error("Pemulihan akun hanya boleh dijalankan pada database pengembangan sims_smk.");
}

const prisma = new PrismaClient();
const apiOrigin = "http://127.0.0.1:3001";
const TARGETS = ["SYSTEM_OWNER", "WAKAKUR"] as const;

type TargetRole = (typeof TARGETS)[number];

type LoginUser = {
  email: string;
  mustChangePassword: boolean;
  assignments: Array<{ roleCode: string; schoolId: string | null }>;
};

const academicCounts = async () => ({
  student: await prisma.student.count(),
  formativeScore: await prisma.formativeScore.count(),
  gradeComponentSubmission: await prisma.gradeComponentSubmission.count(),
  gradeFinalResult: await prisma.gradeFinalResult.count(),
  dailyAttendance: await prisma.dailyAttendance.count(),
  competencyDescription: await prisma.competencyDescription.count(),
  homeroomNote: await prisma.homeroomNote.count(),
  reportReview: await prisma.reportReview.count(),
  reportCardWorkflow: await prisma.reportCardWorkflow.count(),
  reportCardSnapshot: await prisma.reportCardSnapshot.count(),
});

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function usersWithRole(code: TargetRole) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      assignments: { some: { isActive: true, role: { code } } },
    },
    include: {
      assignments: {
        select: {
          id: true,
          isActive: true,
          schoolId: true,
          role: { select: { code: true } },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { email: "asc" },
  });
}

async function probeLogin(email: string, password: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    console.log(`LOGIN ${email} GAGAL tidak terhubung`);
    return;
  }

  if (!response.ok) {
    console.log(`LOGIN ${email} GAGAL status=${response.status}`);
    return;
  }

  const data = (await response.json()) as { refreshToken?: string; user: LoginUser };
  const roles = data.user.assignments.map((assignment) => assignment.roleCode).join(",");
  console.log(`LOGIN ${email} OK mustChange=${data.user.mustChangePassword} roles=${roles}`);
  if (data.refreshToken) {
    await fetch(`${apiOrigin}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: data.refreshToken }),
    }).catch(() => undefined);
  }
}

async function statusOf(userId: string | null, path: string): Promise<number> {
  const headers = new Headers();
  if (userId) {
    headers.set("authorization", `Bearer ${signAccessToken(userId).token}`);
  }
  const response = await fetch(`${apiOrigin}${path}`, { headers });
  return response.status;
}

function protectCredentialFile(file: string): void {
  try {
    const account = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${account}:(R)`], { stdio: "ignore" });
    console.log("ACL berkas kredensial dibatasi ke pengguna Windows saat ini.");
  } catch {
    console.log("ACL berkas kredensial memakai izin bawaan pengguna saat ini.");
  }
}

async function main(): Promise<void> {
  const before = await academicCounts();
  const preserved = await prisma.user.findMany({
    where: { email: { in: ["ekonurrohman124@gmail.com", "guru.multi@sims.local", "admin.smk1@sims.local", "admin.smk2@sims.local"] } },
    select: { email: true, name: true, isActive: true, mustChangePassword: true, passwordHash: true, updatedAt: true },
    orderBy: { email: "asc" },
  });
  const preservedMark = preserved.map((user) => ({
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    updatedAt: user.updatedAt.toISOString(),
    mark: fingerprint(user.passwordHash),
  }));

  const owners = await usersWithRole("SYSTEM_OWNER");
  const wakakur = await usersWithRole("WAKAKUR");
  if (owners.length === 0) throw new Error("Akun SYSTEM_OWNER aktif tidak ditemukan. Akun baru tidak dibuat.");
  if (wakakur.length === 0) {
    const dormant = await prisma.userRole.count({ where: { role: { code: "WAKAKUR" } } });
    if (dormant > 0) throw new Error("Akun Wakakur lama tidak aktif. Peran tidak diubah dan akun baru tidak dibuat.");
    throw new Error("Akun Wakakur tidak ditemukan. Pembuatan akun baru dilewati agar tidak menduga identitas.");
  }

  const selected = new Map<string, { id: string; email: string; name: string; roles: TargetRole[] }>();
  for (const role of TARGETS) {
    const rows = role === "SYSTEM_OWNER" ? owners : wakakur;
    for (const user of rows) {
      const current = selected.get(user.id) ?? { id: user.id, email: user.email, name: user.name, roles: [] };
      current.roles.push(role);
      selected.set(user.id, current);
    }
  }

  const roleMark = new Map<string, string>();
  for (const user of [...owners, ...wakakur]) {
    roleMark.set(
      user.id,
      JSON.stringify(user.assignments.map((assignment) => [assignment.id, assignment.role.code, assignment.schoolId, assignment.isActive])),
    );
  }

  const issued: Array<{ email: string; name: string; roles: string; password: string }> = [];
  const seen = new Set<string>();
  for (const user of selected.values()) {
    let password = generateTemporaryPassword();
    while (seen.has(password)) password = generateTemporaryPassword();
    seen.add(password);
    issued.push({ email: user.email, name: user.name, roles: user.roles.join(", "), password });
  }

  const byEmail = new Map([...selected.values()].map((user) => [user.email, user]));
  await prisma.$transaction(async (tx) => {
    for (const item of issued) {
      const user = byEmail.get(item.email);
      if (!user) throw new Error("Akun target tidak konsisten.");
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(item.password),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAudit(tx, {
        actorId: null,
        action: "OPERATOR_PASSWORD_RECOVERY",
        entityType: "User",
        entityId: user.id,
        metadata: { email: user.email, roles: user.roles },
      });
    }
  });

  const folder = resolve(process.env.LOCALAPPDATA ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."), "sims-smk");
  mkdirSync(folder, { recursive: true });
  const file = resolve(folder, "kredensial-sementara.txt");
  const lines = [
    "SIMS SMK — kredensial sementara",
    `Komputer: ${hostname()}`,
    `Dibuat: ${new Date().toISOString()}`,
    "Berkas ini hanya untuk pengguna Windows saat ini.",
    "Hapus setelah kata sandi diganti. Jangan salin ke repositori, chat, atau laporan.",
    "",
  ];
  for (const item of issued) {
    lines.push(`Peran: ${item.roles}`, `Nama: ${item.name}`, `Email: ${item.email}`, `Kata sandi sementara: ${item.password}`, "Wajib diganti saat masuk pertama.", "");
  }
  writeFileSync(file, lines.join("\r\n"), { encoding: "utf8" });
  protectCredentialFile(file);

  for (const user of selected.values()) {
    const saved = await prisma.user.findUnique({
      where: { id: user.id },
      include: { assignments: { select: { id: true, isActive: true, schoolId: true, role: { select: { code: true } } }, orderBy: { id: "asc" } } },
    });
    const mark = JSON.stringify(saved?.assignments.map((assignment) => [assignment.id, assignment.role.code, assignment.schoolId, assignment.isActive]));
    if (!saved || saved.email !== user.email || saved.name !== user.name || !saved.mustChangePassword || mark !== roleMark.get(user.id)) {
      throw new Error(`Identitas atau peran ${user.email} berubah. Periksa akun sebelum QC.`);
    }
    console.log(`DIPULIHKAN ${user.roles.join(",")} ${user.email}`);
  }

  const afterPeople = await prisma.user.findMany({
    where: { email: { in: preservedMark.map((user) => user.email) } },
    select: { email: true, name: true, isActive: true, mustChangePassword: true, passwordHash: true, updatedAt: true },
  });
  for (const beforeUser of preservedMark) {
    const afterUser = afterPeople.find((user) => user.email === beforeUser.email);
    const same = afterUser
      && afterUser.name === beforeUser.name
      && afterUser.isActive === beforeUser.isActive
      && afterUser.mustChangePassword === beforeUser.mustChangePassword
      && afterUser.updatedAt.toISOString() === beforeUser.updatedAt
      && fingerprint(afterUser.passwordHash) === beforeUser.mark;
    console.log(`UTUH ${beforeUser.email} ${same ? "ya" : "TIDAK"}`);
  }

  const after = await academicCounts();
  console.log(`DATA_AKADEMIK ${JSON.stringify(before) === JSON.stringify(after) ? "utuh" : "BERUBAH"}`);
  console.log(`BERKAS ${file}`);

  for (const user of selected.values()) {
    const saved = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!saved) throw new Error("Akun pulih tidak terbaca.");
    console.log(`HASH ${user.email} tersimpan`);
  }

  const school1 = await prisma.school.findUnique({ where: { npsn: "20100001" }, select: { id: true } });
  const school2 = await prisma.school.findUnique({ where: { npsn: "20100002" }, select: { id: true } });
  const toji = await prisma.user.findUnique({ where: { email: "ekonurrohman124@gmail.com" }, select: { id: true } });
  const siti = await prisma.user.findUnique({ where: { email: "guru.multi@sims.local" }, select: { id: true } });
  const admin2 = await prisma.user.findUnique({ where: { email: "admin.smk2@sims.local" }, select: { id: true } });
  if (!school1 || !school2 || !toji || !siti || !admin2) throw new Error("Data sekolah atau akun pembanding tidak lengkap.");

  console.log(`TANPA_LOGIN ${await statusOf(null, "/api/v1/schools")}`);
  console.log(`TOJI_SEKOLAH_1 ${await statusOf(toji.id, `/api/v1/schools/${school1.id}`)}`);
  console.log(`TOJI_SEKOLAH_2 ${await statusOf(toji.id, `/api/v1/schools/${school2.id}`)}`);
  console.log(`SITI_SEKOLAH_1 ${await statusOf(siti.id, `/api/v1/schools/${school1.id}`)}`);
  console.log(`ADMIN2_SEKOLAH_1 ${await statusOf(admin2.id, `/api/v1/schools/${school1.id}`)}`);
  console.log(`ADMIN2_SEKOLAH_2 ${await statusOf(admin2.id, `/api/v1/schools/${school2.id}`)}`);

  const owner = [...selected.values()].find((user) => user.roles.includes("SYSTEM_OWNER"));
  const wakakurUser = [...selected.values()].find((user) => user.roles.includes("WAKAKUR"));
  if (owner) console.log(`OWNER_SETELAH_PULIH ${await statusOf(owner.id, "/api/v1/schools")}`);
  if (wakakurUser) console.log(`WAKAKUR_SETELAH_PULIH ${await statusOf(wakakurUser.id, "/api/v1/schools")}`);

  for (const item of issued) {
    const saved = await prisma.user.findUnique({ where: { email: item.email }, select: { passwordHash: true } });
    const matches = saved ? await verifyPassword(saved.passwordHash, item.password) : false;
    console.log(`COCOK ${item.email} ${matches ? "ya" : "TIDAK"}`);
    await probeLogin(item.email, item.password);
    item.password = "";
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Pemulihan akun gagal.";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
