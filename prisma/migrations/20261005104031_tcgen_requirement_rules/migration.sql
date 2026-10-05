-- AlterTable
ALTER TABLE "TestCaseGeneration" ADD COLUMN     "requirementRules" TEXT[] DEFAULT ARRAY[]::TEXT[];
