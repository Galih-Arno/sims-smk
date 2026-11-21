import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  GradeReportPolicyDto,
  GradeReportPolicyInput,
  GradeReportPolicyPreviewDto,
} from "@sims/shared";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import { duplicate, notFound, pageWindow, type PageQuery } from "./common.ts";

const include = {
  academicYear: { select: { name: true } },
  academicPeriod: { select: { name: true } },
  curriculum: { select: { code: true, name: true } },
} satisfies Prisma.GradeReportPolicyInclude;

type PolicyRow = Prisma.GradeReportPolicyGetPayload<{ include: typeof include }>;

function cents(value: number): number {
  return Math.round(value * 100);
}

function amount(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

function stored(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value.toFixed(2));
}

const REMEDIAL_LABEL = {
  HIGHEST: "Nilai remedial memakai nilai tertinggi.",
  LATEST: "Nilai remedial memakai nilai terbaru.",
  CAPPED: "Nilai remedial dibatasi pada nilai maksimum.",
} as const;

const ROUNDING_LABEL = {
  NONE: "Tanpa pembulatan",
  INTEGER: "Bilangan bulat",
  ONE_DECIMAL: "Satu angka di belakang koma",
  TWO_DECIMALS: "Dua angka di belakang koma",
} as const;

export function assessGradePolicy(input: GradeReportPolicyInput): GradeReportPolicyPreviewDto {
  const messages: string[] = [];
  const included: { label: string; weight: number }[] = [];

  function use(label: string, enabled: boolean, weight: number | null) {
    if (!enabled) {
      if (weight !== null) messages.push(`${label} tidak digunakan, sehingga bobotnya harus kosong.`);
      return;
    }
    if (weight === null) {
      messages.push(`Bobot ${label} wajib diisi.`);
      return;
    }
    included.push({ label, weight });
  }

  if (input.useFormative && input.formativeMode === "COMBINED") {
    use("Formatif", true, input.weightFormative);
    for (const [label, weight] of [
      ["UH", input.weightUh],
      ["Tugas 1", input.weightT1],
      ["Tugas 2", input.weightT2],
      ["Tugas 3", input.weightT3],
    ] as const) {
      if (weight !== null) messages.push(`${label} digabung dalam Formatif, sehingga bobotnya harus kosong.`);
    }
  } else if (input.useFormative) {
    if (input.weightFormative !== null) messages.push("Saat UH dan tugas dihitung terpisah, bobot Formatif gabungan harus kosong.");
    use("UH", true, input.weightUh);
    use("Tugas 1", true, input.weightT1);
    use("Tugas 2", true, input.weightT2);
    use("Tugas 3", true, input.weightT3);
  } else {
    for (const [label, weight] of [
      ["Formatif", input.weightFormative],
      ["UH", input.weightUh],
      ["Tugas 1", input.weightT1],
      ["Tugas 2", input.weightT2],
      ["Tugas 3", input.weightT3],
    ] as const) {
      if (weight !== null) messages.push(`${label} tidak digunakan, sehingga bobotnya harus kosong.`);
    }
  }

  use("Sumatif", input.useSummative, input.weightSummative);
  use("STS", input.useSts, input.weightSts);
  use("SAS", input.useSas, input.weightSas);

  if (!input.useFormative && !input.useSummative && !input.useSts && !input.useSas) {
    messages.push("Pilih minimal satu komponen penilaian.");
  }

  const total = included.length === 0 ? null : included.reduce((sum, item) => sum + cents(item.weight), 0) / 100;
  const complete = included.length > 0 && messages.length === 0;
  if (complete && cents(total ?? 0) !== 10000) {
    messages.push(`Total bobot ${total}% harus tepat 100%.`);
  }

  if (input.remedialPolicy === "CAPPED") {
    if (input.remedialCap === null) messages.push("Batas maksimum remedial wajib diisi.");
  } else if (input.remedialCap !== null) {
    messages.push("Batas maksimum hanya diisi saat kebijakan remedial memakai batas maksimum.");
  }
  if (input.emptyTreatment !== "INCOMPLETE") {
    messages.push("Nilai kosong harus diperlakukan sebagai belum lengkap, bukan nol.");
  }

  const summary = included.map((item) => `${item.label}: ${item.weight}%`);
  if (total !== null) summary.push(`Total: ${total}%`);
  summary.push(REMEDIAL_LABEL[input.remedialPolicy]);
  if (input.remedialPolicy === "CAPPED" && input.remedialCap !== null) summary.push(`Batas maksimum: ${input.remedialCap}.`);
  summary.push("Nilai kosong tetap belum lengkap dan tidak diubah menjadi nol.");
  summary.push(`Pembulatan nilai akhir: ${ROUNDING_LABEL[input.roundingMode]}.`);
  summary.push("Konfigurasi ini belum menghitung nilai akhir.");

  return { valid: messages.length === 0, messages, summary, total: complete ? total : total };
}

function assertValid(input: GradeReportPolicyInput): void {
  const preview = assessGradePolicy(input);
  if (!preview.valid) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      preview.messages[0] ?? "Konfigurasi belum valid.",
      preview.messages.map((message) => ({ path: "policy", message })),
    );
  }
}

function present(row: PolicyRow): GradeReportPolicyDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    academicPeriodId: row.academicPeriodId,
    curriculumId: row.curriculumId,
    academicYearName: row.academicYear.name,
    periodName: row.academicPeriod.name,
    curriculumName: `${row.curriculum.code} · ${row.curriculum.name}`,
    label: row.label,
    status: row.status,
    useFormative: row.useFormative,
    useSummative: row.useSummative,
    useSts: row.useSts,
    useSas: row.useSas,
    formativeMode: row.formativeMode,
    weightFormative: amount(row.weightFormative),
    weightUh: amount(row.weightUh),
    weightT1: amount(row.weightT1),
    weightT2: amount(row.weightT2),
    weightT3: amount(row.weightT3),
    weightSummative: amount(row.weightSummative),
    weightSts: amount(row.weightSts),
    weightSas: amount(row.weightSas),
    remedialPolicy: row.remedialPolicy,
    remedialCap: amount(row.remedialCap),
    emptyTreatment: "INCOMPLETE",
    roundingMode: row.roundingMode,
    activatedAt: row.activatedAt?.toISOString() ?? null,
  };
}

function snapshot(input: GradeReportPolicyInput) {
  return {
    useFormative: input.useFormative,
    useSummative: input.useSummative,
    useSts: input.useSts,
    useSas: input.useSas,
    formativeMode: input.formativeMode,
    label: input.label,
    weightFormative: input.weightFormative,
    weightUh: input.weightUh,
    weightT1: input.weightT1,
    weightT2: input.weightT2,
    weightT3: input.weightT3,
    weightSummative: input.weightSummative,
    weightSts: input.weightSts,
    weightSas: input.weightSas,
    remedialPolicy: input.remedialPolicy,
    remedialCap: input.remedialCap,
    emptyTreatment: input.emptyTreatment,
    roundingMode: input.roundingMode,
  };
}

async function record(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  action: string,
  entityId: string,
  meta: RequestMeta,
  metadata: Prisma.InputJsonValue,
) {
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action,
    entityType: "GradeReportPolicy",
    entityId,
    metadata,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

function columns(input: GradeReportPolicyInput) {
  return {
    academicYearId: input.academicYearId,
    academicPeriodId: input.academicPeriodId,
    curriculumId: input.curriculumId,
    label: input.label,
    useFormative: input.useFormative,
    useSummative: input.useSummative,
    useSts: input.useSts,
    useSas: input.useSas,
    formativeMode: input.formativeMode,
    weightFormative: stored(input.weightFormative),
    weightUh: stored(input.weightUh),
    weightT1: stored(input.weightT1),
    weightT2: stored(input.weightT2),
    weightT3: stored(input.weightT3),
    weightSummative: stored(input.weightSummative),
    weightSts: stored(input.weightSts),
    weightSas: stored(input.weightSas),
    remedialPolicy: input.remedialPolicy,
    remedialCap: stored(input.remedialCap),
    emptyTreatment: input.emptyTreatment,
    roundingMode: input.roundingMode,
  };
}

async function assertScope(prisma: PrismaClient, schoolId: string, input: GradeReportPolicyInput): Promise<void> {
  const [year, period, curriculum] = await Promise.all([
    prisma.academicYear.findFirst({ where: { id: input.academicYearId, schoolId }, select: { id: true } }),
    prisma.academicPeriod.findFirst({ where: { id: input.academicPeriodId, schoolId }, select: { academicYearId: true } }),
    prisma.curriculum.findFirst({ where: { id: input.curriculumId, schoolId }, select: { academicYearId: true } }),
  ]);
  if (!year || !period || !curriculum) notFound();
  if (period.academicYearId !== year.id) {
    throw new AppError(400, "VALIDATION_ERROR", "Semester tidak termasuk pada tahun pelajaran yang dipilih.");
  }
  if (curriculum.academicYearId !== year.id) {
    throw new AppError(400, "VALIDATION_ERROR", "Kurikulum tidak termasuk pada tahun pelajaran yang dipilih.");
  }
}

async function load(prisma: PrismaClient, schoolId: string, id: string): Promise<PolicyRow> {
  const row = await prisma.gradeReportPolicy.findFirst({ where: { id, schoolId }, include });
  if (!row) notFound();
  return row;
}

export async function listGradePolicies(prisma: PrismaClient, schoolId: string, query: PageQuery) {
  const where: Prisma.GradeReportPolicyWhereInput = {
    schoolId,
    ...(query.q
      ? {
          OR: [
            { academicYear: { name: { contains: query.q, mode: "insensitive" } } },
            { academicPeriod: { name: { contains: query.q, mode: "insensitive" } } },
            { curriculum: { name: { contains: query.q, mode: "insensitive" } } },
            { curriculum: { code: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.gradeReportPolicy.count({ where }),
    prisma.gradeReportPolicy.findMany({
      where,
      include,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      ...pageWindow(query),
    }),
  ]);
  return { items: rows.map(present), page: query.page, pageSize: query.pageSize, total };
}

export function previewGradePolicy(input: GradeReportPolicyInput): GradeReportPolicyPreviewDto {
  return assessGradePolicy(input);
}

export async function createGradePolicy(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: GradeReportPolicyInput,
  meta: RequestMeta,
): Promise<GradeReportPolicyDto> {
  assertValid(input);
  await assertScope(prisma, schoolId, input);
  try {
    const saved = await prisma.gradeReportPolicy.create({
      data: { schoolId, status: "DRAFT", ...columns(input) },
      include,
    });
    await record(prisma, auth, schoolId, "GRADE_POLICY_CREATED", saved.id, meta, {
      status: "DRAFT",
      policy: snapshot(input),
    });
    return present(saved);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      duplicate("Pengaturan untuk tahun, semester, dan kurikulum ini sudah ada.");
    }
    throw error;
  }
}

export async function updateGradePolicy(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  id: string,
  input: GradeReportPolicyInput,
  meta: RequestMeta,
): Promise<GradeReportPolicyDto> {
  const current = await load(prisma, schoolId, id);
  if (current.status !== "DRAFT") {
    throw new AppError(409, "CONFLICT", "Pengaturan yang sudah aktif tidak dapat diubah.");
  }
  assertValid(input);
  await assertScope(prisma, schoolId, input);
  try {
    const saved = await prisma.gradeReportPolicy.update({
      where: { id: current.id },
      data: columns(input),
      include,
    });
    await record(prisma, auth, schoolId, "GRADE_POLICY_UPDATED", saved.id, meta, {
      status: "DRAFT",
      policy: snapshot(input),
    });
    return present(saved);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      duplicate("Pengaturan untuk tahun, semester, dan kurikulum ini sudah ada.");
    }
    throw error;
  }
}

function assertCanActivate(auth: AuthState, schoolId: string): void {
  const allowed =
    auth.isSystemOwner ||
    auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "WAKAKUR");
  if (!allowed) throw new AppError(403, "FORBIDDEN", "Pengaturan nilai hanya dapat diaktifkan oleh Wakasek Kurikulum.");
}

export async function activateGradePolicy(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  id: string,
  meta: RequestMeta,
): Promise<GradeReportPolicyDto> {
  assertCanActivate(auth, schoolId);
  const current = await load(prisma, schoolId, id);
  if (current.status === "ACTIVE") {
    throw new AppError(409, "CONFLICT", "Pengaturan ini sudah aktif.");
  }
  assertValid({
    academicYearId: current.academicYearId,
    academicPeriodId: current.academicPeriodId,
    curriculumId: current.curriculumId,
    label: current.label,
    useFormative: current.useFormative,
    useSummative: current.useSummative,
    useSts: current.useSts,
    useSas: current.useSas,
    formativeMode: current.formativeMode,
    weightFormative: amount(current.weightFormative),
    weightUh: amount(current.weightUh),
    weightT1: amount(current.weightT1),
    weightT2: amount(current.weightT2),
    weightT3: amount(current.weightT3),
    weightSummative: amount(current.weightSummative),
    weightSts: amount(current.weightSts),
    weightSas: amount(current.weightSas),
    remedialPolicy: current.remedialPolicy,
    remedialCap: amount(current.remedialCap),
    emptyTreatment: "INCOMPLETE",
    roundingMode: current.roundingMode,
  });
  const saved = await prisma.gradeReportPolicy.update({
    where: { id: current.id },
    data: { status: "ACTIVE", activatedAt: new Date(), activatedById: auth.userId },
    include,
  });
  await record(prisma, auth, schoolId, "GRADE_POLICY_ACTIVATED", saved.id, meta, {
    previousStatus: "DRAFT",
    status: "ACTIVE",
  });
  return present(saved);
}

export async function deleteGradePolicy(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  id: string,
  meta: RequestMeta,
): Promise<void> {
  const current = await load(prisma, schoolId, id);
  if (current.status !== "DRAFT") {
    throw new AppError(409, "CONFLICT", "Pengaturan yang sudah aktif tidak dapat dihapus.");
  }
  await prisma.gradeReportPolicy.delete({ where: { id: current.id } });
  await record(prisma, auth, schoolId, "GRADE_POLICY_DELETED", current.id, meta, {
    status: "DRAFT",
  });
}
