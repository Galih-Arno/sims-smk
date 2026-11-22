import type { PrismaClient } from "@prisma/client";
import { writeAudit } from "../../lib/audit.ts";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import {
  calculateDistanceMeters,
  currentWibMinutes,
  getCached,
  invalidateCachePrefix,
  parseHhMmToMinutes,
  setCached,
  toWibDateOnly,
} from "../../lib/resilience.ts";
import { assertSchoolAccess, assertSchoolRole, type RequestMeta } from "../../lib/tenant.ts";

const SETTING_TTL_MS = 5 * 60 * 1000;

export async function getOrCreateAttendanceSetting(prisma: PrismaClient, schoolId: string) {
  const cacheKey = `att-setting:${schoolId}`;
  const cached = getCached<Awaited<ReturnType<typeof prisma.schoolAttendanceSetting.upsert>>>(cacheKey);
  if (cached) return cached;

  const setting = await prisma.schoolAttendanceSetting.upsert({
    where: { schoolId },
    update: {},
    create: { schoolId },
  });
  setCached(cacheKey, setting, SETTING_TTL_MS);
  return setting;
}

export async function getAttendanceSetting(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const setting = await getOrCreateAttendanceSetting(prisma, schoolId);
  return { setting };
}

export async function updateAttendanceSetting(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
    workStartTime: string;
    lateToleranceMin: number;
    workEndTime: string;
    requireLiveness: boolean;
  },
  meta: RequestMeta,
) {
  await assertSchoolRole(prisma, auth, schoolId, ["ADMIN_SEKOLAH", "KEPALA_SEKOLAH", "TU"], meta);
  const setting = await prisma.schoolAttendanceSetting.upsert({
    where: { schoolId },
    update: input,
    create: { schoolId, ...input },
  });
  invalidateCachePrefix(`att-setting:${schoolId}`);
  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "STAFF_ATTENDANCE_SETTING_UPDATED",
    entityType: "SchoolAttendanceSetting",
    entityId: setting.id,
    metadata: input,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return { setting };
}

export async function getTodayStaffAttendance(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const setting = await getOrCreateAttendanceSetting(prisma, schoolId);
  const workDate = toWibDateOnly();
  const record = await prisma.staffAttendance.findUnique({
    where: {
      schoolId_userId_workDate: {
        schoolId,
        userId: auth.userId,
        workDate,
      },
    },
  });
  return { setting, workDate: workDate.toISOString().slice(0, 10), record };
}

export async function checkInStaff(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    photoUrl?: string;
    isOutsideDuty?: boolean;
    note?: string;
    idempotencyKey?: string;
  },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);

  if (input.idempotencyKey) {
    const existingByKey = await prisma.staffAttendance.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingByKey) {
      return { record: existingByKey, deduplicated: true };
    }
  }

  const setting = await getOrCreateAttendanceSetting(prisma, schoolId);
  if (setting.requireLiveness && !input.photoUrl && !input.isOutsideDuty) {
    throw new AppError(400, "LIVENESS_REQUIRED", "Verifikasi foto wajah wajib dilampirkan saat absensi masuk.");
  }

  const distanceM = calculateDistanceMeters(setting.latitude, setting.longitude, input.latitude, input.longitude);
  if (!input.isOutsideDuty && distanceM > setting.radiusMeters) {
    throw new AppError(
      400,
      "OUT_OF_GEOFENCE",
      `Lokasi Anda berada ${distanceM} meter dari sekolah (batas maksimal ${setting.radiusMeters} meter). Aktifkan mode Dinas Luar jika sedang bertugas di luar sekolah.`,
      { distanceM, radiusMeters: setting.radiusMeters },
    );
  }

  const now = new Date();
  const workDate = toWibDateOnly(now);
  const currentMin = currentWibMinutes(now);
  const deadlineMin = parseHhMmToMinutes(setting.workStartTime) + setting.lateToleranceMin;
  const status = input.isOutsideDuty
    ? "DINAS_LUAR"
    : currentMin > deadlineMin
      ? "TERLAMBAT"
      : "TEPAT_WAKTU";

  const existing = await prisma.staffAttendance.findUnique({
    where: { schoolId_userId_workDate: { schoolId, userId: auth.userId, workDate } },
  });
  if (existing?.checkInAt) {
    return { record: existing, deduplicated: true };
  }

  const record = await prisma.staffAttendance.upsert({
    where: { schoolId_userId_workDate: { schoolId, userId: auth.userId, workDate } },
    update: {
      checkInAt: now,
      checkInLat: input.latitude,
      checkInLng: input.longitude,
      checkInDistanceM: distanceM,
      checkInPhotoUrl: input.photoUrl ?? null,
      status,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
    create: {
      schoolId,
      userId: auth.userId,
      workDate,
      checkInAt: now,
      checkInLat: input.latitude,
      checkInLng: input.longitude,
      checkInDistanceM: distanceM,
      checkInPhotoUrl: input.photoUrl ?? null,
      status,
      note: input.note ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });

  return { record, deduplicated: false };
}

export async function checkOutStaff(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: {
    latitude: number;
    longitude: number;
    photoUrl?: string;
    isOutsideDuty?: boolean;
    note?: string;
  },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const setting = await getOrCreateAttendanceSetting(prisma, schoolId);
  const now = new Date();
  const workDate = toWibDateOnly(now);

  const existing = await prisma.staffAttendance.findUnique({
    where: { schoolId_userId_workDate: { schoolId, userId: auth.userId, workDate } },
  });
  if (!existing?.checkInAt) {
    throw new AppError(400, "NOT_CHECKED_IN", "Anda belum melakukan absensi masuk hari ini.");
  }
  if (existing.checkOutAt) {
    return { record: existing, deduplicated: true };
  }

  const distanceM = calculateDistanceMeters(setting.latitude, setting.longitude, input.latitude, input.longitude);
  if (!input.isOutsideDuty && distanceM > setting.radiusMeters) {
    throw new AppError(
      400,
      "OUT_OF_GEOFENCE",
      `Lokasi pulang berada ${distanceM} meter dari sekolah (maksimal ${setting.radiusMeters} meter).`,
      { distanceM, radiusMeters: setting.radiusMeters },
    );
  }

  const record = await prisma.staffAttendance.update({
    where: { id: existing.id },
    data: {
      checkOutAt: now,
      checkOutLat: input.latitude,
      checkOutLng: input.longitude,
      checkOutDistanceM: distanceM,
      checkOutPhotoUrl: input.photoUrl ?? null,
      note: input.note ? [existing.note, input.note].filter(Boolean).join(" | ") : existing.note,
    },
  });

  return { record, deduplicated: false };
}

export async function listStaffAttendanceRecap(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  dateStr: string | undefined,
  meta: RequestMeta,
) {
  await assertSchoolRole(prisma, auth, schoolId, ["ADMIN_SEKOLAH", "KEPALA_SEKOLAH", "WAKAKUR", "TU"], meta);
  const workDate = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : toWibDateOnly();

  const records = await prisma.staffAttendance.findMany({
    where: { schoolId, workDate },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ checkInAt: "asc" }],
  });

  return { workDate: workDate.toISOString().slice(0, 10), records };
}
