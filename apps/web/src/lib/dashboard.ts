export type AttendanceSummary = {
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  total: number;
};

export type ReportSummary = {
  draf: number;
  diajukan: number;
  disetujui: number;
  dikembalikan: number;
  disahkan: number;
};

export type DashboardPayload =
  | {
      view: "owner";
      schools: number;
      active: number;
      inactive: number;
      suspended: number;
      users: number;
      teachers: number;
      students: number;
    }
  | {
      view: "admin";
      periodName: string | null;
      teachers: number;
      students: number;
      classes: number;
      subjects: number;
      studentsWithoutClass: number;
      teachersWithoutAccount: number;
      classesWithoutHomeroom: number | null;
    }
  | {
      view: "kepala";
      periodName: string | null;
      teachers: number;
      students: number;
      classes: number;
      gradeSubmitted: number;
      gradeTotal: number;
      reportsPending: number;
      reportsApproved: number;
      attendance: AttendanceSummary;
    }
  | {
      view: "wakakur";
      periodName: string | null;
      classes: { name: string; submitted: number; total: number }[];
      pendingTeachers: { name: string; pending: number }[];
      curricula: number;
      classesWithoutCurriculum: number;
      reportsPending: number;
    }
  | {
      view: "guru";
      periodName: string | null;
      linked: boolean;
      items: { id: string; className: string; subjectName: string; status: "NONE" | "DRAFT" | "SUBMITTED" | "REVISION_REQUESTED" }[];
      submitted: number;
      total: number;
      draft: number;
      revision: number;
    }
  | {
      view: "wali";
      periodName: string | null;
      classes: { name: string; students: number }[];
      students: number;
      gradeSubmitted: number;
      gradeTotal: number;
      attendance: AttendanceSummary;
      reports: ReportSummary;
    };

export type SchoolDashboardView = Exclude<DashboardPayload["view"], "owner">;
