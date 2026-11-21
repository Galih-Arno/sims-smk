import type { PrismaClient } from "@prisma/client";
import type { AuthState } from "../../lib/auth-state.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError } from "../../lib/errors.ts";
import type { RequestMeta } from "../../lib/tenant.ts";
import { parseDateOnly, rethrowKnown, toDateOnly } from "./common.ts";

type CalendarKind = "PEMBELAJARAN" | "LIBUR" | "TIDAK_WAJIB";

export type AttendanceCalendarInput = {
  days: Array<{ date: string; kind: CalendarKind; note?: string | null }>;
};

type StoredDay = { date: Date; kind: CalendarKind; note: string | null };

const daySelect = { date: true, kind: true, note: true } as const;

export async function getAttendanceCompleteness(prisma: PrismaClient, schoolId: string) {
  const period = await activePeriod(prisma, schoolId);
  if (!period) return { period: null, rule: null };
  const rule = await prisma.attendanceCompletenessRule.findFirst({
    where: { schoolId, academicPeriodId: period.id },
    select: { id: true, status: true, days: { select: daySelect } },
  });
  return present(period, rule);
}

export async function saveAttendanceCompleteness(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: AttendanceCalendarInput,
  meta: RequestMeta,
) {
  const period = await requireActivePeriod(prisma, schoolId);
  const days = normalizeDays(input.days, toDateOnly(period.startDate), toDateOnly(period.endDate));
  const current = await prisma.attendanceCompletenessRule.findFirst({
    where: { schoolId, academicPeriodId: period.id },
    select: { id: true, status: true, days: { select: daySelect } },
  });
  if (current?.status === "ACTIVE") {
    assertWakakur(auth, schoolId, "Aturan kelengkapan absensi yang sudah aktif hanya dapat diubah oleh Wakasek Kurikulum.");
    if (!days.some((day) => day.kind === "PEMBELAJARAN")) {
      throw new AppError(400, "VALIDATION_ERROR", "Aturan aktif harus tetap memiliki minimal satu hari pembelajaran.");
    }
  }
  if (current && sameCalendar(current.days, days)) return present(period, current);

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const rule = current
        ? current
        : await tx.attendanceCompletenessRule.create({
            data: { schoolId, academicPeriodId: period.id, status: "DRAFT" },
            select: { id: true, status: true },
          });
      if (current) await tx.attendanceCalendarDay.deleteMany({ where: { ruleId: rule.id } });
      if (days.length > 0) {
        await tx.attendanceCalendarDay.createMany({
          data: days.map((day) => ({
            schoolId,
            ruleId: rule.id,
            date: parseDateOnly(day.date),
            kind: day.kind,
            note: day.note,
          })),
        });
      }
      const storedStatus = current?.status ?? "DRAFT";
      await writeAudit(tx, {
        schoolId,
        actorId: auth.userId,
        action: storedStatus === "ACTIVE" ? "ATTENDANCE_COMPLETENESS_UPDATED" : "ATTENDANCE_COMPLETENESS_SAVED",
        entityType: "AttendanceCompletenessRule",
        entityId: rule.id,
        metadata: {
          academicPeriodId: period.id,
          status: storedStatus,
          previousRequiredDates: requiredDates(current?.days ?? []),
          nextRequiredDates: requiredDates(days),
          affectsReport: storedStatus === "ACTIVE",
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return tx.attendanceCompletenessRule.findFirstOrThrow({
        where: { id: rule.id },
        select: { id: true, status: true, days: { select: daySelect } },
      });
    });
    return present(period, saved);
  } catch (error) {
    rethrowKnown(error, "Aturan kelengkapan absensi untuk semester ini sudah ada.");
  }
}

export async function activateAttendanceCompleteness(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
) {
  assertWakakur(auth, schoolId, "Aturan kelengkapan absensi hanya dapat diaktifkan oleh Wakasek Kurikulum.");
  const period = await requireActivePeriod(prisma, schoolId);
  const current = await prisma.attendanceCompletenessRule.findFirst({
    where: { schoolId, academicPeriodId: period.id },
    select: { id: true, status: true, days: { select: daySelect } },
  });
  if (!current || !current.days.some((day) => day.kind === "PEMBELAJARAN")) {
    throw new AppError(400, "VALIDATION_ERROR", "Aktifkan aturan setelah menetapkan minimal satu hari pembelajaran.");
  }
  if (current.status === "ACTIVE") {
    throw new AppError(409, "CONFLICT", "Aturan kelengkapan absensi semester ini sudah aktif.");
  }
  const saved = await prisma.attendanceCompletenessRule.update({
    where: { id: current.id },
    data: { status: "ACTIVE", activatedAt: new Date(), activatedById: auth.userId },
    select: { id: true, status: true, days: { select: daySelect } },
  });
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "ATTENDANCE_COMPLETENESS_ACTIVATED",
    entityType: "AttendanceCompletenessRule",
    entityId: saved.id,
    metadata: {
      academicPeriodId: period.id,
      previousStatus: "DRAFT",
      status: "ACTIVE",
      requiredDates: requiredDates(saved.days),
      affectsReport: true,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return present(period, saved);
}

function assertWakakur(auth: AuthState, schoolId: string, message: string): void {
  const allowed =
    auth.isSystemOwner ||
    auth.assignments.some((item) => item.schoolId === schoolId && item.roleCode === "WAKAKUR");
  if (!allowed) throw new AppError(403, "FORBIDDEN", message);
}

async function activePeriod(prisma: PrismaClient, schoolId: string) {
  return prisma.academicPeriod.findFirst({
    where: { schoolId, isActive: true },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
}

async function requireActivePeriod(prisma: PrismaClient, schoolId: string) {
  const period = await activePeriod(prisma, schoolId);
  if (!period) throw new AppError(400, "VALIDATION_ERROR", "Tidak ada periode akademik aktif.");
  return period;
}

function normalizeDays(
  days: AttendanceCalendarInput["days"],
  start: string,
  end: string,
): Array<{ date: string; kind: CalendarKind; note: string | null }> {
  const seen = new Set<string>();
  return days.map((day) => {
    if (day.date < start || day.date > end) {
      throw new AppError(400, "VALIDATION_ERROR", "Tanggal di luar periode akademik aktif.");
    }
    if (seen.has(day.date)) throw new AppError(400, "VALIDATION_ERROR", "Tanggal kalender tidak boleh ganda.");
    seen.add(day.date);
    const note = day.note?.trim() ?? "";
    return { date: day.date, kind: day.kind, note: note || null };
  });
}

function requiredDates(days: Array<{ date: Date | string; kind: CalendarKind }>): string[] {
  return days
    .filter((day) => day.kind === "PEMBELAJARAN")
    .map((day) => (day.date instanceof Date ? toDateOnly(day.date) : day.date))
    .sort();
}

function sameCalendar(stored: StoredDay[], next: Array<{ date: string; kind: CalendarKind; note: string | null }>): boolean {
  const left = stored
    .map((day) => `${toDateOnly(day.date)}|${day.kind}|${day.note ?? ""}`)
    .sort();
  const right = next.map((day) => `${day.date}|${day.kind}|${day.note ?? ""}`).sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function present(
  period: { id: string; name: string; startDate: Date; endDate: Date },
  rule: { id: string; status: "DRAFT" | "ACTIVE"; days: StoredDay[] } | null,
) {
  const days = (rule?.days ?? [])
    .map((day) => ({ date: toDateOnly(day.date), kind: day.kind, note: day.note }))
    .sort((left, right) => left.date.localeCompare(right.date));
  return {
    period: {
      id: period.id,
      name: period.name,
      startDate: toDateOnly(period.startDate),
      endDate: toDateOnly(period.endDate),
    },
    rule: rule
      ? {
          id: rule.id,
          status: rule.status,
          requiredDays: days.filter((day) => day.kind === "PEMBELAJARAN").length,
          holidayDays: days.filter((day) => day.kind === "LIBUR").length,
          exemptDays: days.filter((day) => day.kind === "TIDAK_WAJIB").length,
          days,
        }
      : null,
  };
}
