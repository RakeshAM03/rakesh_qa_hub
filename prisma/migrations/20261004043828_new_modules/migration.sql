-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('PLANNED', 'IN_TESTING', 'GO', 'NO_GO', 'GO_WITH_ISSUES', 'RELEASED');

-- CreateEnum
CREATE TYPE "GateType" AS ENUM ('MANUAL', 'CI_GREEN', 'NO_P0', 'NO_P1', 'VALID_RATE', 'NO_P0_FLAGS');

-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('PENDING', 'PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "SignoffDecision" AS ENUM ('PENDING', 'APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "ReleaseDecisionType" AS ENUM ('GO', 'NO_GO', 'GO_WITH_ISSUES');

-- CreateEnum
CREATE TYPE "ChangeSize" AS ENUM ('NONE', 'SMALL', 'MEDIUM', 'LARGE', 'NEW_FEATURE');

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "targetDate" DATE,
    "releasedAt" DATE,
    "owner" TEXT,
    "description" TEXT,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'PLANNED',
    "linkedCiSuiteIds" TEXT[],
    "linkedFeaturePageIds" TEXT[],
    "linkedRepos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseGate" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "GateType" NOT NULL DEFAULT 'MANUAL',
    "config" JSONB,
    "status" "GateStatus" NOT NULL DEFAULT 'PENDING',
    "isBlocker" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "owner" TEXT,
    "evidenceUrl" TEXT,
    "note" TEXT,
    "override" JSONB,
    "autoResult" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseSignoff" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "decision" "SignoffDecision" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "signedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReleaseSignoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseDecision" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "decision" "ReleaseDecisionType" NOT NULL,
    "comment" TEXT NOT NULL,
    "knownIssues" TEXT[],
    "snapshot" JSONB NOT NULL,
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseEvent" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "availableHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "testers" INTEGER,
    "notes" TEXT,
    "releaseId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskArea" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "featurePageId" TEXT,
    "changeSize" "ChangeSize" NOT NULL DEFAULT 'MEDIUM',
    "complexity" INTEGER NOT NULL DEFAULT 3,
    "defectHistory" INTEGER NOT NULL DEFAULT 3,
    "dependencies" INTEGER NOT NULL DEFAULT 3,
    "businessImpact" INTEGER NOT NULL DEFAULT 3,
    "usageFrequency" INTEGER NOT NULL DEFAULT 3,
    "depthOverride" TEXT,
    "hoursOverride" DOUBLE PRECISION,
    "deferred" BOOLEAN NOT NULL DEFAULT false,
    "deferReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureAnalysis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "totalFailures" INTEGER NOT NULL,
    "passed" INTEGER,
    "skipped" INTEGER,
    "categoryCounts" JSONB NOT NULL,
    "clusters" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FailureAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownIssue" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExplanationCache" (
    "signature" TEXT NOT NULL,
    "explanation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExplanationCache_pkey" PRIMARY KEY ("signature")
);

-- CreateTable
CREATE TABLE "ApiCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRequest" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '[]',
    "headers" JSONB NOT NULL DEFAULT '[]',
    "auth" JSONB NOT NULL DEFAULT '{}',
    "body" JSONB NOT NULL DEFAULT '{}',
    "assertions" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiEnvironment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ciSuiteId" TEXT,
    "totalTests" INTEGER NOT NULL,
    "automatedTests" INTEGER NOT NULL,
    "manualMinutesPerTest" DOUBLE PRECISION NOT NULL,
    "automatedSecondsPerTest" DOUBLE PRECISION,
    "runsPerMonth" DOUBLE PRECISION,
    "buildHours" DOUBLE PRECISION NOT NULL,
    "maintenanceHoursPerMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalTests" INTEGER NOT NULL,
    "automatedTests" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Release_createdAt_idx" ON "Release"("createdAt");

-- CreateIndex
CREATE INDEX "ReleaseGate_releaseId_sortOrder_idx" ON "ReleaseGate"("releaseId", "sortOrder");

-- CreateIndex
CREATE INDEX "ReleaseSignoff_releaseId_idx" ON "ReleaseSignoff"("releaseId");

-- CreateIndex
CREATE INDEX "ReleaseDecision_releaseId_createdAt_idx" ON "ReleaseDecision"("releaseId", "createdAt");

-- CreateIndex
CREATE INDEX "ReleaseEvent_releaseId_createdAt_idx" ON "ReleaseEvent"("releaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_name_key" ON "ChecklistTemplate"("name");

-- CreateIndex
CREATE INDEX "RiskPlan_createdAt_idx" ON "RiskPlan"("createdAt");

-- CreateIndex
CREATE INDEX "RiskArea_planId_sortOrder_idx" ON "RiskArea"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "FailureAnalysis_createdAt_idx" ON "FailureAnalysis"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnownIssue_signature_key" ON "KnownIssue"("signature");

-- CreateIndex
CREATE INDEX "ApiRequest_collectionId_sortOrder_idx" ON "ApiRequest"("collectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ApiEnvironment_name_key" ON "ApiEnvironment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationProject_name_key" ON "AutomationProject"("name");

-- CreateIndex
CREATE INDEX "CoverageSnapshot_projectId_date_idx" ON "CoverageSnapshot"("projectId", "date");

-- AddForeignKey
ALTER TABLE "ReleaseGate" ADD CONSTRAINT "ReleaseGate_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseSignoff" ADD CONSTRAINT "ReleaseSignoff_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseDecision" ADD CONSTRAINT "ReleaseDecision_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseEvent" ADD CONSTRAINT "ReleaseEvent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskPlan" ADD CONSTRAINT "RiskPlan_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskArea" ADD CONSTRAINT "RiskArea_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RiskPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRequest" ADD CONSTRAINT "ApiRequest_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ApiCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageSnapshot" ADD CONSTRAINT "CoverageSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AutomationProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Built-in generic checklist template (process content, not data). Inserted once.
INSERT INTO "ChecklistTemplate" ("id", "name", "sections", "createdAt", "updatedAt")
VALUES ('builtin_standard_release', 'Standard release', '[{"name":"Testing","gates":[{"title":"Smoke test passed","type":"MANUAL","isBlocker":false,"weight":1},{"title":"Regression suite passed","type":"CI_GREEN","isBlocker":false,"weight":1},{"title":"New features tested against acceptance criteria","type":"MANUAL","isBlocker":false,"weight":1},{"title":"Cross-browser / responsive checks done","type":"MANUAL","isBlocker":false,"weight":1}]},{"name":"Defects","gates":[{"title":"No open P0 bugs","type":"NO_P0","isBlocker":true,"weight":1},{"title":"No open P1 bugs","type":"NO_P1","isBlocker":false,"weight":1,"config":{"maxAllowed":0}},{"title":"Known issues documented","type":"MANUAL","isBlocker":false,"weight":1}]},{"name":"Code & review","gates":[{"title":"No unresolved P0 review flags","type":"NO_P0_FLAGS","isBlocker":false,"weight":1,"config":{"days":14}},{"title":"Release notes reviewed","type":"MANUAL","isBlocker":false,"weight":1}]},{"name":"Deployment","gates":[{"title":"Staging matches production config","type":"MANUAL","isBlocker":false,"weight":1},{"title":"Rollback plan documented","type":"MANUAL","isBlocker":false,"weight":1},{"title":"Monitoring/alerts in place","type":"MANUAL","isBlocker":false,"weight":1}]}]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
