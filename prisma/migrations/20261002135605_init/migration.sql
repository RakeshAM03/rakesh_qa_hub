-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssueEventType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'MARKED_VALID', 'MARKED_INVALID', 'DELETED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FlagType" AS ENUM ('LOGIC_ERROR', 'REGRESSION_RISK', 'SECURITY', 'MISSING_ERROR_HANDLING', 'REQUIREMENT_FIDELITY');

-- CreateEnum
CREATE TYPE "FlagSource" AS ENUM ('CLAUDE_OUTPUT', 'MANUAL');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturePage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamId" TEXT,
    "sheetUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "featurePageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'P2',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "reporter" TEXT,
    "assignee" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueEvent" (
    "id" TEXT NOT NULL,
    "featurePageId" TEXT NOT NULL,
    "issueId" TEXT,
    "issueTitle" TEXT NOT NULL,
    "type" "IssueEventType" NOT NULL,
    "field" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLog" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "hours" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repo" TEXT NOT NULL,
    "prNumber" INTEGER,
    "filePath" TEXT,
    "line" INTEGER,
    "flagType" "FlagType" NOT NULL,
    "detail" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "suggestedFix" TEXT,
    "loggedBy" TEXT,
    "source" "FlagSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestPlanEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prReference" TEXT,
    "output" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestPlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "focusAreas" TEXT[],
    "steps" INTEGER[],
    "context" TEXT,
    "specRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CiSuite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "workflowFile" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "dispatchInputs" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CiSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RootCauseCache" (
    "runId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RootCauseCache_pkey" PRIMARY KEY ("runId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturePage_name_key" ON "FeaturePage"("name");

-- CreateIndex
CREATE INDEX "FeaturePage_teamId_idx" ON "FeaturePage"("teamId");

-- CreateIndex
CREATE INDEX "Issue_featurePageId_idx" ON "Issue"("featurePageId");

-- CreateIndex
CREATE INDEX "Issue_assignee_idx" ON "Issue"("assignee");

-- CreateIndex
CREATE INDEX "IssueEvent_createdAt_idx" ON "IssueEvent"("createdAt");

-- CreateIndex
CREATE INDEX "IssueEvent_featurePageId_idx" ON "IssueEvent"("featurePageId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_name_key" ON "Resource"("name");

-- CreateIndex
CREATE INDEX "TaskLog_resourceId_date_idx" ON "TaskLog"("resourceId", "date");

-- CreateIndex
CREATE INDEX "TaskLog_date_idx" ON "TaskLog"("date");

-- CreateIndex
CREATE INDEX "Flag_date_idx" ON "Flag"("date");

-- CreateIndex
CREATE INDEX "Flag_repo_idx" ON "Flag"("repo");

-- CreateIndex
CREATE INDEX "Flag_flagType_idx" ON "Flag"("flagType");

-- CreateIndex
CREATE INDEX "TestPlanEntry_createdAt_idx" ON "TestPlanEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTemplate_name_key" ON "SessionTemplate"("name");

-- AddForeignKey
ALTER TABLE "FeaturePage" ADD CONSTRAINT "FeaturePage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_featurePageId_fkey" FOREIGN KEY ("featurePageId") REFERENCES "FeaturePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvent" ADD CONSTRAINT "IssueEvent_featurePageId_fkey" FOREIGN KEY ("featurePageId") REFERENCES "FeaturePage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvent" ADD CONSTRAINT "IssueEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
