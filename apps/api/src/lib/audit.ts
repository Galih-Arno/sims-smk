import type { Prisma, PrismaClient } from "@prisma/client";

export type AuditWriter = PrismaClient | Prisma.TransactionClient;

export type AuditInput = {
  schoolId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(db: AuditWriter, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      schoolId: input.schoolId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
