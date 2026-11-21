-- Status pengiriman nilai berpindah ke tiap komponen.
-- Baris GradeSubmission DRAFT tidak disalin: ketiadaan baris komponen tetap berarti DRAFT.
-- Baris SUBMITTED disalin ke seluruh komponen struktur penugasan agar nilai yang sudah terkunci tetap terkunci.
-- Baris REVISION_REQUESTED tidak disalin. Pemetaan ke satu komponen akan menebak.
-- Aplikasi tetap mengunci seluruh nilai penugasan itu sampai status lama diselesaikan.

CREATE TYPE "GradeComponentKind" AS ENUM ('FORMATIVE', 'SUMMATIVE', 'STS', 'SAS');

CREATE TYPE "GradeComponentField" AS ENUM ('UH', 'T1', 'T2', 'T3', 'REMEDIAL', 'SCORE', 'STS', 'SAS');

CREATE TABLE "GradeComponentSubmission" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "componentKey" VARCHAR(120) NOT NULL,
    "kind" "GradeComponentKind" NOT NULL,
    "field" "GradeComponentField" NOT NULL,
    "learningObjectiveId" TEXT,
    "materialScopeId" TEXT,
    "status" "AssessmentWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "recipientTeacherId" TEXT,
    "revisionReason" VARCHAR(500),
    "revisionRequestedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeComponentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GradeComponentSubmission_teachingAssignmentId_componentKey_key" ON "GradeComponentSubmission"("teachingAssignmentId", "componentKey");

CREATE INDEX "GradeComponentSubmission_schoolId_status_idx" ON "GradeComponentSubmission"("schoolId", "status");

CREATE INDEX "GradeComponentSubmission_recipientTeacherId_idx" ON "GradeComponentSubmission"("recipientTeacherId");

ALTER TABLE "GradeComponentSubmission" ADD CONSTRAINT "GradeComponentSubmission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GradeComponentSubmission" ADD CONSTRAINT "GradeComponentSubmission_teachingAssignmentId_fkey" FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GradeComponentSubmission" ADD CONSTRAINT "GradeComponentSubmission_recipientTeacherId_fkey" FOREIGN KEY ("recipientTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "GradeComponentSubmission" (
    "id", "schoolId", "teachingAssignmentId", "componentKey", "kind", "field", "learningObjectiveId", "status", "submittedAt", "submittedById", "createdAt", "updatedAt"
)
SELECT
    'g' || substr(md5(gs."teachingAssignmentId" || ':f:' || f.field || ':' || lo.id), 1, 24),
    gs."schoolId",
    gs."teachingAssignmentId",
    'f:' || f.field || ':' || lo.id,
    'FORMATIVE',
    f.field_enum::"GradeComponentField",
    lo.id,
    'SUBMITTED',
    gs."submittedAt",
    gs."submittedById",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GradeSubmission" gs
JOIN "LearningObjective" lo ON lo."teachingAssignmentId" = gs."teachingAssignmentId"
CROSS JOIN (VALUES
    ('uh', 'UH'),
    ('t1', 'T1'),
    ('t2', 'T2'),
    ('t3', 'T3'),
    ('remedial', 'REMEDIAL')
) AS f(field, field_enum)
WHERE gs.status = 'SUBMITTED';

INSERT INTO "GradeComponentSubmission" (
    "id", "schoolId", "teachingAssignmentId", "componentKey", "kind", "field", "materialScopeId", "status", "submittedAt", "submittedById", "createdAt", "updatedAt"
)
SELECT
    'g' || substr(md5(gs."teachingAssignmentId" || ':s:' || ms.id), 1, 24),
    gs."schoolId",
    gs."teachingAssignmentId",
    's:' || ms.id,
    'SUMMATIVE',
    'SCORE',
    ms.id,
    'SUBMITTED',
    gs."submittedAt",
    gs."submittedById",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GradeSubmission" gs
JOIN "MaterialScope" ms ON ms."teachingAssignmentId" = gs."teachingAssignmentId"
WHERE gs.status = 'SUBMITTED';

INSERT INTO "GradeComponentSubmission" (
    "id", "schoolId", "teachingAssignmentId", "componentKey", "kind", "field", "status", "submittedAt", "submittedById", "createdAt", "updatedAt"
)
SELECT
    'g' || substr(md5(gs."teachingAssignmentId" || ':' || exam.component_key), 1, 24),
    gs."schoolId",
    gs."teachingAssignmentId",
    exam.component_key,
    exam.kind::"GradeComponentKind",
    exam.field_enum::"GradeComponentField",
    'SUBMITTED',
    gs."submittedAt",
    gs."submittedById",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GradeSubmission" gs
CROSS JOIN (VALUES
    ('sts', 'STS', 'STS'),
    ('sas', 'SAS', 'SAS')
) AS exam(component_key, kind, field_enum)
WHERE gs.status = 'SUBMITTED';
