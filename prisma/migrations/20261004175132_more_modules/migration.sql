-- CreateEnum
CREATE TYPE "TcGenMode" AS ENUM ('AI', 'IMPORTED', 'CHECKLIST');

-- CreateTable
CREATE TABLE "DataSchema" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSchema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseGeneration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "apiInput" TEXT,
    "context" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "selectedTypes" TEXT[],
    "mode" "TcGenMode" NOT NULL,
    "summary" TEXT,
    "assumptions" TEXT[],
    "questions" TEXT[],
    "testCases" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCaseGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataSchema_name_key" ON "DataSchema"("name");

-- CreateIndex
CREATE INDEX "DataSchema_updatedAt_idx" ON "DataSchema"("updatedAt");

-- CreateIndex
CREATE INDEX "TestCaseGeneration_updatedAt_idx" ON "TestCaseGeneration"("updatedAt");
