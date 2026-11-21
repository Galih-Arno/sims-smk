export const ROLE_CODES = [
  "SYSTEM_OWNER",
  "ADMIN_SEKOLAH",
  "WAKAKUR",
  "KEPALA_SEKOLAH",
  "GURU_MAPEL",
  "WALI_KELAS",
  "TU",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export type RoleScope = "PLATFORM" | "SCHOOL";

export type RoleDefinition = {
  code: RoleCode;
  name: string;
  description: string;
  scope: RoleScope;
};

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    code: "SYSTEM_OWNER",
    name: "Pemilik Sistem",
    description: "Akses platform untuk seluruh sekolah",
    scope: "PLATFORM",
  },
  {
    code: "ADMIN_SEKOLAH",
    name: "Admin Sekolah",
    description: "Mengelola data operasional satu sekolah",
    scope: "SCHOOL",
  },
  {
    code: "WAKAKUR",
    name: "Wakil Kepala Kurikulum",
    description: "Wakil kepala sekolah bidang kurikulum",
    scope: "SCHOOL",
  },
  {
    code: "KEPALA_SEKOLAH",
    name: "Kepala Sekolah",
    description: "Pimpinan sekolah",
    scope: "SCHOOL",
  },
  {
    code: "GURU_MAPEL",
    name: "Guru Mata Pelajaran",
    description: "Pengajar mata pelajaran",
    scope: "SCHOOL",
  },
  {
    code: "WALI_KELAS",
    name: "Wali Kelas",
    description: "Wali kelas siswa",
    scope: "SCHOOL",
  },
  {
    code: "TU",
    name: "Tata Usaha",
    description: "Petugas tata usaha sekolah",
    scope: "SCHOOL",
  },
];

export const AUDIT_READER_ROLES = ["ADMIN_SEKOLAH", "KEPALA_SEKOLAH", "TU"] as const satisfies readonly RoleCode[];

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

export type AssignmentDto = {
  roleCode: RoleCode;
  roleName: string;
  scope: RoleScope;
  schoolId: string | null;
  schoolName: string | null;
};

export type AuthUserDto = {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  assignments: AssignmentDto[];
};

export type TeacherAccountResult = {
  item: TeacherDto;
  created: boolean;
  temporaryPassword: string | null;
};

export type LoginResponse = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  user: AuthUserDto;
};

export type SchoolAccessStatus = "AKTIF" | "NONAKTIF" | "DITANGGUHKAN";

export type SchoolDto = {
  id: string;
  name: string;
  npsn: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  website: string | null;
  accreditation: string | null;
  principalName: string | null;
  stsEnabled: boolean;
  sasEnabled: boolean;
  requireUh: boolean;
  requireT1: boolean;
  requireT2: boolean;
  requireT3: boolean;
  requireSummative: boolean;
  requireSts: boolean;
  requireSas: boolean;
  isActive: boolean;
  accessStatus: SchoolAccessStatus;
};

export type AcademicPeriodDto = {
  id: string;
  schoolId: string;
  academicYearId: string | null;
  academicYearName: string | null;
  name: string;
  semesterKind: "GANJIL" | "GENAP" | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type AcademicYearDto = {
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type ExpertiseFieldDto = {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type ExpertiseProgramDto = {
  id: string;
  schoolId: string;
  fieldId: string;
  fieldName: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type ExpertiseConcentrationDto = {
  id: string;
  schoolId: string;
  programId: string;
  programName: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type SchoolUserRoleDto = {
  code: RoleCode;
  name: string;
};

export type SchoolUserDto = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  teacherId: string | null;
  teacherName: string | null;
  roles: SchoolUserRoleDto[];
};

export type SchoolUserWriteResult = {
  item: SchoolUserDto;
  created: boolean;
  temporaryPassword: string | null;
};

export type LinkableTeacherDto = {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  userEmail: string | null;
};

export type TeacherDto = {
  id: string;
  schoolId: string;
  userId: string | null;
  userName: string | null;
  nip: string | null;
  nuptk: string | null;
  name: string;
  gender: "LAKI_LAKI" | "PEREMPUAN";
  email: string | null;
  phone: string | null;
  isActive: boolean;
  loginEmail: string | null;
  roleCodes: Array<"GURU_MAPEL" | "WALI_KELAS">;
};

export type SchoolClassDto = {
  id: string;
  schoolId: string;
  academicYearId: string;
  academicYearName: string;
  concentrationId: string | null;
  concentrationName: string | null;
  name: string;
  gradeLevel: number;
  capacity: number;
  isActive: boolean;
};

export type StudentDto = {
  id: string;
  schoolId: string;
  nisn: string;
  nis: string | null;
  name: string;
  gender: "LAKI_LAKI" | "PEREMPUAN";
  birthPlace: string | null;
  birthDate: string | null;
  email: string | null;
  phone: string | null;
  classId: string | null;
  className: string | null;
  concentrationId: string | null;
  concentrationName: string | null;
  isActive: boolean;
};

export type SubjectDto = {
  id: string;
  schoolId: string;
  code: string;
  name: string;
  category: "UMUM" | "KEJURUAN";
  isActive: boolean;
};

export type TeachingAssignmentDto = {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  academicPeriodId: string;
  periodName: string;
};

export type HomeroomAssignmentDto = {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  academicPeriodId: string;
  periodName: string;
};

export type CurriculumDto = {
  id: string;
  schoolId: string;
  academicYearId: string;
  academicYearName: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type GradeReportPolicyStatus = "DRAFT" | "ACTIVE";
export type FormativeWeightMode = "COMBINED" | "SEPARATE";
export type RemedialScorePolicy = "HIGHEST" | "LATEST" | "CAPPED";
export type GradeRoundingMode = "NONE" | "INTEGER" | "ONE_DECIMAL" | "TWO_DECIMALS";

export type GradeReportPolicyInput = {
  academicYearId: string;
  academicPeriodId: string;
  curriculumId: string;
  label: string | null;
  useFormative: boolean;
  useSummative: boolean;
  useSts: boolean;
  useSas: boolean;
  formativeMode: FormativeWeightMode;
  weightFormative: number | null;
  weightUh: number | null;
  weightT1: number | null;
  weightT2: number | null;
  weightT3: number | null;
  weightSummative: number | null;
  weightSts: number | null;
  weightSas: number | null;
  remedialPolicy: RemedialScorePolicy;
  remedialCap: number | null;
  emptyTreatment: "INCOMPLETE";
  roundingMode: GradeRoundingMode;
};

export type GradeReportPolicyDto = GradeReportPolicyInput & {
  id: string;
  schoolId: string;
  status: GradeReportPolicyStatus;
  academicYearName: string;
  periodName: string;
  curriculumName: string;
  activatedAt: string | null;
};

export type GradeReportPolicyPreviewDto = {
  valid: boolean;
  messages: string[];
  summary: string[];
  total: number | null;
};

export type CurriculumPlacementDto = {
  id: string;
  schoolId: string;
  curriculumId: string;
  curriculumName: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
};

export type PlanItemDto = {
  id: string;
  schoolId: string;
  teachingAssignmentId: string;
  curriculumId: string | null;
  code: string;
  description: string;
  sequence: number;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  academicPeriodId: string;
  periodName: string;
};

export type LearningObjectiveDto = PlanItemDto;
export type MaterialScopeDto = PlanItemDto;

export type PlanSlotDto = {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  academicPeriodId: string;
  periodName: string;
  teacherName: string;
  writable: boolean;
};

export type OptionItem = {
  id: string;
  label: string;
};

export type AcademicOptionsDto = {
  years: OptionItem[];
  periods: OptionItem[];
  fields: OptionItem[];
  programs: OptionItem[];
  concentrations: OptionItem[];
  teachers: OptionItem[];
  classes: OptionItem[];
  subjects: OptionItem[];
  members: OptionItem[];
  curricula: OptionItem[];
  planSlots: PlanSlotDto[];
};

export type ImportRowStatus = "VALID" | "DUPLIKAT" | "GAGAL";

export type ImportPreviewRow = {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  valid: boolean;
  status?: ImportRowStatus;
};

export type ImportPreviewDto = {
  rows: ImportPreviewRow[];
  validCount: number;
  invalidCount: number;
  totalCount?: number;
  duplicateCount?: number;
  failedCount?: number;
};

export type ImportCommitDto = {
  created: number;
  skipped: number;
  rows: ImportPreviewRow[];
  totalCount?: number;
  duplicateCount?: number;
  failedCount?: number;
};

export type GradeStatus = "DRAFT";

export type AssessmentWorkflowStatus = "DRAFT" | "SUBMITTED" | "REVISION_REQUESTED";

export type GradeCompletenessComponent = {
  key: string;
  label: string;
  filled: number;
  total: number;
  required: boolean;
  note: string | null;
};

export type GradeCompletenessDto = {
  policyConfigured: boolean;
  warning: string | null;
  missingRequired: number;
  filled: number;
  total: number;
  components: GradeCompletenessComponent[];
};

export type GradeComponentKind = "FORMATIVE" | "SUMMATIVE" | "STS" | "SAS";

export type GradeComponentField = "uh" | "t1" | "t2" | "t3" | "remedial" | "score" | "sts" | "sas";

export type GradeLegacyLockDto = {
  status: "SUBMITTED" | "REVISION_REQUESTED";
  reason: string | null;
};

export type GradeComponentStatusDto = {
  key: string;
  kind: GradeComponentKind;
  field: GradeComponentField;
  learningObjectiveId: string | null;
  materialScopeId: string | null;
  label: string;
  status: AssessmentWorkflowStatus;
  locked: boolean;
  filled: number;
  total: number;
  required: boolean;
  missingRequired: number;
  submittedAt: string | null;
  revisionReason: string | null;
  recipientName: string | null;
};

export type GradeWorkflowItemDto = {
  assignmentId: string;
  className: string;
  subjectName: string;
  periodName: string;
  teacherName: string;
  recipientName: string | null;
  submissionHold: string | null;
  legacyLock: GradeLegacyLockDto | null;
  canResolveLegacy: boolean;
  components: Array<GradeComponentStatusDto & { canDecide: boolean }>;
};

export type GradeWorkflowListDto = {
  homeroomMissing: boolean;
  message: string | null;
  policyConfigured: boolean;
  warning: string | null;
  items: GradeWorkflowItemDto[];
};

export type GradeStudentDto = {
  id: string;
  name: string;
  nis: string | null;
};

export type FormativeGradeCell = {
  studentId: string;
  uh: number | null;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  remedial: number | null;
  status: GradeStatus;
};

export type FormativeGradeColumn = {
  learningObjectiveId: string;
  code: string;
  description: string;
  sequence: number;
  cells: FormativeGradeCell[];
};

export type SummativeGradeCell = {
  studentId: string;
  score: number | null;
  remedial: number | null;
  status: GradeStatus;
};

export type SummativeGradeColumn = {
  materialScopeId: string;
  code: string;
  description: string;
  sequence: number;
  cells: SummativeGradeCell[];
};

export type TermExamCell = {
  studentId: string;
  sts: number | null;
  sas: number | null;
  status: GradeStatus;
};

export type GradeSheetDto = {
  assignmentId: string;
  className: string;
  subjectName: string;
  periodName: string;
  teacherName: string;
  stsEnabled: boolean;
  sasEnabled: boolean;
  students: GradeStudentDto[];
  formative: FormativeGradeColumn[];
  summative: SummativeGradeColumn[];
  termExams: TermExamCell[];
  submissionHold: string | null;
  recipientName: string | null;
  legacyLock: GradeLegacyLockDto | null;
  components: GradeComponentStatusDto[];
  completeness: GradeCompletenessDto;
};

export type AuditLogDto = {
  id: string;
  schoolId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
