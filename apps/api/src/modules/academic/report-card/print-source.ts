import type { PrismaClient } from "@prisma/client";

export type PrintIntent = "DRAFT_BROWSER" | "OFFICIAL_BROWSER" | "OFFICIAL_PDF" | "BULK_OFFICIAL";

export async function readOfficialPrintSnapshot(prisma: PrismaClient, schoolId: string, studentId: string, academicPeriodId: string) {
  const workflow = await prisma.reportCardWorkflow.findFirst({
    where: { schoolId, studentId, academicPeriodId, status: "DISAHKAN", activeSnapshotId: { not: null } },
    select: { activeSnapshot: { select: { id: true, version: true, fingerprint: true, payload: true, endorsedAt: true } } },
  });
  return workflow?.activeSnapshot ?? null;
}

export async function listOfficialPrintSnapshots(prisma: PrismaClient, schoolId: string, academicPeriodId: string, studentIds: string[]) {
  if (studentIds.length === 0) return [];
  const workflows = await prisma.reportCardWorkflow.findMany({
    where: { schoolId, academicPeriodId, status: "DISAHKAN", studentId: { in: studentIds }, activeSnapshotId: { not: null } },
    select: { studentId: true, activeSnapshot: { select: { id: true, version: true, payload: true } } },
    orderBy: { student: { name: "asc" } },
  });
  return workflows.flatMap((item) => item.activeSnapshot ? [{ studentId: item.studentId, snapshot: item.activeSnapshot }] : []);
}

export function printNotReadyMessage(intent: PrintIntent): string {
  if (intent === "DRAFT_BROWSER") return "Cetak draf belum tersedia. Pratinjau tetap dapat dibuka.";
  if (intent === "BULK_OFFICIAL") return "Cetak massal hanya mencakup snapshot rapor yang berstatus DISAHKAN.";
  return "Cetak resmi hanya dapat menggunakan snapshot rapor yang berstatus DISAHKAN.";
}
