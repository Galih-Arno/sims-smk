import type { PrismaClient } from "@prisma/client";
import { writeAudit } from "../../lib/audit.ts";
import type { AuthState } from "../../lib/auth-state.ts";
import { AppError } from "../../lib/errors.ts";
import { assertSchoolAccess, assertSchoolRole, type RequestMeta } from "../../lib/tenant.ts";

const APPROVER_ROLES = ["ADMIN_SEKOLAH", "KEPALA_SEKOLAH", "WAKAKUR", "TU"] as const;

export async function listLeaveRequests(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const canReviewAll =
    auth.isSystemOwner ||
    auth.assignments.some((a) => a.schoolId === schoolId && APPROVER_ROLES.includes(a.roleCode as (typeof APPROVER_ROLES)[number]));

  const requests = await prisma.staffLeaveRequest.findMany({
    where: {
      schoolId,
      ...(canReviewAll ? {} : { userId: auth.userId }),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return { requests, canReviewAll };
}

export async function createLeaveRequest(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  input: {
    leaveType: "CUTI" | "IZIN" | "SAKIT" | "DINAS_LUAR_SPD";
    startDate: string;
    endDate: string;
    reason: string;
    attachmentUrl?: string | null;
  },
  meta: RequestMeta,
) {
  await assertSchoolAccess(prisma, auth, schoolId, meta);
  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T00:00:00.000Z`);
  if (end < start) {
    throw new AppError(400, "INVALID_DATE_RANGE", "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
  }

  const request = await prisma.staffLeaveRequest.create({
    data: {
      schoolId,
      userId: auth.userId,
      leaveType: input.leaveType,
      startDate: start,
      endDate: end,
      reason: input.reason.trim(),
      attachmentUrl: input.attachmentUrl ?? null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "STAFF_LEAVE_REQUEST_CREATED",
    entityType: "StaffLeaveRequest",
    entityId: request.id,
    metadata: { leaveType: input.leaveType, startDate: input.startDate, endDate: input.endDate },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { request };
}

export async function reviewLeaveRequest(
  prisma: PrismaClient,
  auth: AuthState,
  schoolId: string,
  id: string,
  input: { status: "DISETUJUI" | "DITOLAK"; reviewNote?: string | null },
  meta: RequestMeta,
) {
  await assertSchoolRole(prisma, auth, schoolId, APPROVER_ROLES, meta);

  const existing = await prisma.staffLeaveRequest.findFirst({
    where: { id, schoolId },
  });
  if (!existing) {
    throw new AppError(404, "LEAVE_REQUEST_NOT_FOUND", "Pengajuan cuti/izin/SPD tidak ditemukan.");
  }

  const request = await prisma.staffLeaveRequest.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      reviewedById: auth.userId,
      reviewNote: input.reviewNote?.trim() || null,
      reviewedAt: new Date(),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  await writeAudit(prisma, {
    schoolId,
    actorId: auth.userId,
    action: "STAFF_LEAVE_REQUEST_REVIEWED",
    entityType: "StaffLeaveRequest",
    entityId: request.id,
    metadata: { status: input.status },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { request };
}
