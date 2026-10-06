-- CreateEnum
CREATE TYPE "ListKind" AS ENUM ('PRODUCT', 'DISPOSITION', 'RCA_CATEGORY', 'RCA_SUBCATEGORY', 'CAUGHT_AT', 'WHY_ESCAPED', 'DETECTED_BY', 'SCOPE', 'IMPACT', 'OWNER_TEAM');

-- CreateEnum
CREATE TYPE "Catchable" AS ENUM ('YES', 'NO', 'PARTIAL');

-- CreateEnum
CREATE TYPE "IssueSource" AS ENUM ('JIRA', 'CSV', 'MANUAL');

-- CreateEnum
CREATE TYPE "CustomerIssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PreventionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "AutomationState" AS ENUM ('NO', 'PLANNED', 'YES');

-- CreateEnum
CREATE TYPE "RegressionRunStatus" AS ENUM ('IN_PROGRESS', 'BLOCKED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "RunResult" AS ENUM ('PENDING', 'PASS', 'FAIL', 'BLOCKED', 'NA');

-- AlterEnum
ALTER TYPE "GateType" ADD VALUE 'CUSTOMER_REGRESSION';

-- CreateTable
CREATE TABLE "ListItem" (
    "id" TEXT NOT NULL,
    "list" "ListKind" NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "defaultCatchable" "Catchable",
    "defaultOwnerId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "jql" TEXT NOT NULL DEFAULT '',
    "productMapping" JSONB NOT NULL DEFAULT '[]',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "writeBackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraSyncLog" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "added" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "JiraSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerIssue" (
    "id" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "issueUrl" TEXT,
    "source" "IssueSource" NOT NULL DEFAULT 'MANUAL',
    "lastSyncedAt" TIMESTAMP(3),
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "status" "CustomerIssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdDate" DATE NOT NULL,
    "resolvedDate" DATE,
    "fixVersion" TEXT,
    "releasedInDate" DATE,
    "priority" TEXT,
    "reporter" TEXT,
    "assignee" TEXT,
    "components" TEXT[],
    "labels" TEXT[],
    "productId" TEXT,
    "module" TEXT,
    "releasedIn" TEXT,
    "severity" TEXT,
    "dispositionId" TEXT,
    "dispositionNote" TEXT,
    "linkedIssueKey" TEXT,
    "rcaCategoryId" TEXT,
    "rcaSubcategoryId" TEXT,
    "caughtAtId" TEXT,
    "catchable" "Catchable",
    "whyEscapedId" TEXT,
    "detectedById" TEXT,
    "scopeId" TEXT,
    "impactId" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "ownerTeamId" TEXT,
    "rca" TEXT,
    "prevention" TEXT,
    "preventionStatus" "PreventionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "qaOwner" TEXT,
    "comments" TEXT,
    "regressionRequired" BOOLEAN NOT NULL DEFAULT true,
    "rcaComplete" BOOLEAN NOT NULL DEFAULT false,
    "rcaCompletedAt" TIMESTAMP(3),
    "writeBackHash" TEXT,
    "tcLibraryEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionCase" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "preconditions" TEXT NOT NULL DEFAULT '',
    "steps" TEXT[],
    "testData" TEXT NOT NULL DEFAULT '',
    "expectedResult" TEXT NOT NULL DEFAULT '',
    "productId" TEXT,
    "module" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "automated" "AutomationState" NOT NULL DEFAULT 'NO',
    "automationRef" TEXT,
    "retired" BOOLEAN NOT NULL DEFAULT false,
    "retiredReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegressionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productIds" TEXT[],
    "environment" TEXT,
    "build" TEXT,
    "releaseId" TEXT,
    "status" "RegressionRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegressionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegressionRunResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "regressionCaseId" TEXT,
    "caseSnapshot" JSONB NOT NULL,
    "result" "RunResult" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "notes" TEXT,
    "evidenceUrl" TEXT,
    "executedBy" TEXT,
    "executedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RegressionRunResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListItem_list_sortOrder_idx" ON "ListItem"("list", "sortOrder");

-- CreateIndex
CREATE INDEX "ListItem_parentId_idx" ON "ListItem"("parentId");

-- CreateIndex
CREATE INDEX "JiraSyncLog_startedAt_idx" ON "JiraSyncLog"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIssue_issueKey_key" ON "CustomerIssue"("issueKey");

-- CreateIndex
CREATE INDEX "CustomerIssue_createdDate_idx" ON "CustomerIssue"("createdDate");

-- CreateIndex
CREATE INDEX "CustomerIssue_productId_idx" ON "CustomerIssue"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "RegressionCase_caseId_key" ON "RegressionCase"("caseId");

-- CreateIndex
CREATE INDEX "RegressionCase_issueId_sortOrder_idx" ON "RegressionCase"("issueId", "sortOrder");

-- CreateIndex
CREATE INDEX "RegressionRun_releaseId_idx" ON "RegressionRun"("releaseId");

-- CreateIndex
CREATE INDEX "RegressionRun_createdAt_idx" ON "RegressionRun"("createdAt");

-- CreateIndex
CREATE INDEX "RegressionRunResult_runId_sortOrder_idx" ON "RegressionRunResult"("runId", "sortOrder");

-- AddForeignKey
ALTER TABLE "RegressionCase" ADD CONSTRAINT "RegressionCase_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "CustomerIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegressionRunResult" ADD CONSTRAINT "RegressionRunResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RegressionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default classification lists (generic; editable in Settings → Lists). Products are user-managed.
INSERT INTO "ListItem" ("id", "list", "key", "name", "description", "parentId", "defaultCatchable", "defaultOwnerId", "sortOrder", "active", "createdAt", "updatedAt") VALUES
('ci_owner_qa', 'OWNER_TEAM', NULL, 'QA', NULL, NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_dev', 'OWNER_TEAM', NULL, 'Dev', NULL, NULL, NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_devops', 'OWNER_TEAM', NULL, 'DevOps', NULL, NULL, NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_po_ba', 'OWNER_TEAM', NULL, 'PO / BA', NULL, NULL, NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_design', 'OWNER_TEAM', NULL, 'Design', NULL, NULL, NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_support', 'OWNER_TEAM', NULL, 'Support', NULL, NULL, NULL, NULL, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_qa_pm', 'OWNER_TEAM', NULL, 'QA + PM', NULL, NULL, NULL, NULL, 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_dev_devops', 'OWNER_TEAM', NULL, 'Dev + DevOps', NULL, NULL, NULL, NULL, 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_dev_support', 'OWNER_TEAM', NULL, 'Dev + Support', NULL, NULL, NULL, NULL, 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_dev_qa', 'OWNER_TEAM', NULL, 'Dev + QA', NULL, NULL, NULL, NULL, 9, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_owner_design_qa', 'OWNER_TEAM', NULL, 'Design + QA', NULL, NULL, NULL, NULL, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_disp_valid_bug', 'DISPOSITION', 'VALID_BUG', 'Valid Bug', 'Real defect — RCA required.', NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_disp_duplicate', 'DISPOSITION', 'DUPLICATE', 'Duplicate', 'Same as another issue — link the issue key.', NULL, NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_disp_known_issue', 'DISPOSITION', 'KNOWN_ISSUE', 'Known Issue', 'Already reported or accepted — link the issue key.', NULL, NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_disp_not_a_bug', 'DISPOSITION', 'NOT_A_BUG', 'Not a Bug / Works as Designed', 'Expected behaviour — add a note.', NULL, NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_disp_cant_reproduce', 'DISPOSITION', 'CANT_REPRODUCE', 'Can''t Reproduce', 'Could not be confirmed — add a note.', NULL, NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_disp_user_error', 'DISPOSITION', 'USER_ERROR', 'User Error / Training', 'Customer misuse; may need a docs or UX change — add a note.', NULL, NULL, NULL, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss', 'RCA_CATEGORY', NULL, 'QA Miss', 'A test existed or was in scope, but QA didn''t catch it.', NULL, 'YES', 'ci_owner_qa', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss__test_case_missing', 'RCA_SUBCATEGORY', NULL, 'Test case missing', NULL, 'ci_cat_qa_miss', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss__test_case_existed_but_not_executed', 'RCA_SUBCATEGORY', NULL, 'Test case existed but not executed', NULL, 'ci_cat_qa_miss', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss__edge_case_not_covered', 'RCA_SUBCATEGORY', NULL, 'Edge case not covered', NULL, 'ci_cat_qa_miss', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss__wrong_insufficient_test_data', 'RCA_SUBCATEGORY', NULL, 'Wrong/insufficient test data', NULL, 'ci_cat_qa_miss', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss__negative_scenario_missed', 'RCA_SUBCATEGORY', NULL, 'Negative scenario missed', NULL, 'ci_cat_qa_miss', NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss__cross_browser_device_not_tested', 'RCA_SUBCATEGORY', NULL, 'Cross-browser/device not tested', NULL, 'ci_cat_qa_miss', NULL, NULL, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_miss__regression_not_run_on_impacted_area', 'RCA_SUBCATEGORY', NULL, 'Regression not run on impacted area', NULL, 'ci_cat_qa_miss', NULL, NULL, 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_skip', 'RCA_CATEGORY', NULL, 'QA Skip', 'Testing was knowingly skipped or reduced.', NULL, 'YES', 'ci_owner_qa_pm', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_skip__time_pressure', 'RCA_SUBCATEGORY', NULL, 'Time pressure', NULL, 'ci_cat_qa_skip', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_skip__hotfix_without_full_qa', 'RCA_SUBCATEGORY', NULL, 'Hotfix without full QA', NULL, 'ci_cat_qa_skip', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_skip__descoped_by_decision', 'RCA_SUBCATEGORY', NULL, 'Descoped by decision', NULL, 'ci_cat_qa_skip', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_qa_skip__environment_build_not_available_for_testing', 'RCA_SUBCATEGORY', NULL, 'Environment/build not available for testing', NULL, 'ci_cat_qa_skip', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_defect', 'RCA_CATEGORY', NULL, 'Code Defect', 'Logic bug in new or changed code.', NULL, 'YES', 'ci_owner_dev', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_defect__logic_error', 'RCA_SUBCATEGORY', NULL, 'Logic error', NULL, 'ci_cat_code_defect', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_defect__missing_null_validation_check', 'RCA_SUBCATEGORY', NULL, 'Missing null/validation check', NULL, 'ci_cat_code_defect', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_defect__error_handling_missing', 'RCA_SUBCATEGORY', NULL, 'Error handling missing', NULL, 'ci_cat_code_defect', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_defect__performance_timeout_in_code', 'RCA_SUBCATEGORY', NULL, 'Performance/timeout in code', NULL, 'ci_cat_code_defect', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_defect__concurrency_race_condition', 'RCA_SUBCATEGORY', NULL, 'Concurrency/race condition', NULL, 'ci_cat_code_defect', NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_defect__backward_compatibility_break', 'RCA_SUBCATEGORY', NULL, 'Backward-compatibility break', NULL, 'ci_cat_code_defect', NULL, NULL, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_sync_release', 'RCA_CATEGORY', NULL, 'Code Sync / Release', 'Merge, branch or release packaging problem.', NULL, 'PARTIAL', 'ci_owner_dev_devops', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_sync_release__fix_missing_from_release_branch', 'RCA_SUBCATEGORY', NULL, 'Fix missing from release branch', NULL, 'ci_cat_code_sync_release', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_sync_release__merge_conflict_overwrote_a_change', 'RCA_SUBCATEGORY', NULL, 'Merge conflict overwrote a change', NULL, 'ci_cat_code_sync_release', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_sync_release__wrong_build_deployed', 'RCA_SUBCATEGORY', NULL, 'Wrong build deployed', NULL, 'ci_cat_code_sync_release', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_code_sync_release__feature_flag_misconfigured', 'RCA_SUBCATEGORY', NULL, 'Feature flag misconfigured', NULL, 'ci_cat_code_sync_release', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_config_data', 'RCA_CATEGORY', NULL, 'Config / Data', 'Configuration or data caused the issue.', NULL, 'PARTIAL', 'ci_owner_dev_support', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_config_data__shared_config_affected_another_client', 'RCA_SUBCATEGORY', NULL, 'Shared config affected another client', NULL, 'ci_cat_config_data', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_config_data__client_specific_setting_wrong', 'RCA_SUBCATEGORY', NULL, 'Client-specific setting wrong', NULL, 'ci_cat_config_data', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_config_data__data_migration_issue', 'RCA_SUBCATEGORY', NULL, 'Data migration issue', NULL, 'ci_cat_config_data', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_config_data__bad_duplicate_data_in_production', 'RCA_SUBCATEGORY', NULL, 'Bad/duplicate data in production', NULL, 'ci_cat_config_data', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_config_data__default_values_changed', 'RCA_SUBCATEGORY', NULL, 'Default values changed', NULL, 'ci_cat_config_data', NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_infra_deployment', 'RCA_CATEGORY', NULL, 'Infra / Deployment', 'Servers, deployment, caching, networking.', NULL, 'NO', 'ci_owner_devops', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_infra_deployment__static_asset_cache_issue', 'RCA_SUBCATEGORY', NULL, 'Static asset/cache issue', NULL, 'ci_cat_infra_deployment', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_infra_deployment__server_db_down_or_slow', 'RCA_SUBCATEGORY', NULL, 'Server/DB down or slow', NULL, 'ci_cat_infra_deployment', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_infra_deployment__cdn_dns', 'RCA_SUBCATEGORY', NULL, 'CDN/DNS', NULL, 'ci_cat_infra_deployment', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_infra_deployment__scaling_load', 'RCA_SUBCATEGORY', NULL, 'Scaling/load', NULL, 'ci_cat_infra_deployment', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_infra_deployment__deployment_script_failure', 'RCA_SUBCATEGORY', NULL, 'Deployment script failure', NULL, 'ci_cat_infra_deployment', NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_infra_deployment__third_party_outage', 'RCA_SUBCATEGORY', NULL, 'Third-party outage', NULL, 'ci_cat_infra_deployment', NULL, NULL, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_integration_third_party', 'RCA_CATEGORY', NULL, 'Integration / Third-party', 'External system behaviour.', NULL, 'PARTIAL', 'ci_owner_dev_qa', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_integration_third_party__partner_api_behaviour_changed', 'RCA_SUBCATEGORY', NULL, 'Partner API behaviour changed', NULL, 'ci_cat_integration_third_party', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_integration_third_party__partner_returned_unexpected_empty_data', 'RCA_SUBCATEGORY', NULL, 'Partner returned unexpected/empty data', NULL, 'ci_cat_integration_third_party', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_integration_third_party__auth_token_expiry', 'RCA_SUBCATEGORY', NULL, 'Auth/token expiry', NULL, 'ci_cat_integration_third_party', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_integration_third_party__rate_limit_from_partner', 'RCA_SUBCATEGORY', NULL, 'Rate limit from partner', NULL, 'ci_cat_integration_third_party', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_integration_third_party__webhook_sync_failure', 'RCA_SUBCATEGORY', NULL, 'Webhook/sync failure', NULL, 'ci_cat_integration_third_party', NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_requirement_gap', 'RCA_CATEGORY', NULL, 'Requirement Gap', 'Requirement missing or unclear; built as specified but wrong for the customer.', NULL, 'NO', 'ci_owner_po_ba', 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_requirement_gap__requirement_missing', 'RCA_SUBCATEGORY', NULL, 'Requirement missing', NULL, 'ci_cat_requirement_gap', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_requirement_gap__ambiguous_acceptance_criteria', 'RCA_SUBCATEGORY', NULL, 'Ambiguous acceptance criteria', NULL, 'ci_cat_requirement_gap', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_requirement_gap__client_specific_need_not_captured', 'RCA_SUBCATEGORY', NULL, 'Client-specific need not captured', NULL, 'ci_cat_requirement_gap', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_requirement_gap__change_request_not_communicated', 'RCA_SUBCATEGORY', NULL, 'Change request not communicated', NULL, 'ci_cat_requirement_gap', NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_design_ux', 'RCA_CATEGORY', NULL, 'Design / UX', 'Design or usability problem.', NULL, 'PARTIAL', 'ci_owner_design_qa', 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_design_ux__confusing_flow', 'RCA_SUBCATEGORY', NULL, 'Confusing flow', NULL, 'ci_cat_design_ux', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_design_ux__missing_validation_message', 'RCA_SUBCATEGORY', NULL, 'Missing validation message', NULL, 'ci_cat_design_ux', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_design_ux__accessibility_issue', 'RCA_SUBCATEGORY', NULL, 'Accessibility issue', NULL, 'ci_cat_design_ux', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_security', 'RCA_CATEGORY', NULL, 'Security', 'Security weakness.', NULL, 'YES', 'ci_owner_dev_qa', 9, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_security__access_permission_leak', 'RCA_SUBCATEGORY', NULL, 'Access/permission leak', NULL, 'ci_cat_security', NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_security__data_exposure', 'RCA_SUBCATEGORY', NULL, 'Data exposure', NULL, 'ci_cat_security', NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_security__injection_xss', 'RCA_SUBCATEGORY', NULL, 'Injection/XSS', NULL, 'ci_cat_security', NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_cat_others', 'RCA_CATEGORY', 'OTHERS', 'Others', 'Only when nothing else fits — a comment explaining why is required.', NULL, NULL, NULL, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_requirement_review', 'CAUGHT_AT', NULL, 'Requirement review', 'e.g. ambiguous acceptance criteria', NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_design_review', 'CAUGHT_AT', NULL, 'Design review', 'e.g. missing validation in the design', NULL, NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_code_review_unit_tests', 'CAUGHT_AT', NULL, 'Code review / unit tests', 'e.g. missing null-check', NULL, NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_qa_functional_testing', 'CAUGHT_AT', NULL, 'QA functional testing', 'e.g. edge case not tested', NULL, NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_regression_testing', 'CAUGHT_AT', NULL, 'Regression testing', 'e.g. impacted area not re-tested', NULL, NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_uat', 'CAUGHT_AT', NULL, 'UAT', 'e.g. client-specific flow', NULL, NULL, NULL, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_deployment_release_checklist', 'CAUGHT_AT', NULL, 'Deployment / release checklist', 'e.g. wrong build, cache not cleared', NULL, NULL, NULL, 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_monitoring_alerting', 'CAUGHT_AT', NULL, 'Monitoring / alerting', 'e.g. production errors not alerted', NULL, NULL, NULL, 7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_stage_not_catchable_before_release', 'CAUGHT_AT', NULL, 'Not catchable before release', 'e.g. genuine third-party outage', NULL, NULL, NULL, 8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_why_missing_test_case', 'WHY_ESCAPED', NULL, 'Missing test case', NULL, NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_why_missing_test_data', 'WHY_ESCAPED', NULL, 'Missing test data', NULL, NULL, NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_why_environment_gap', 'WHY_ESCAPED', NULL, 'Environment gap', NULL, NULL, NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_why_not_in_scope', 'WHY_ESCAPED', NULL, 'Not in scope', NULL, NULL, NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_why_time_pressure', 'WHY_ESCAPED', NULL, 'Time pressure', NULL, NULL, NULL, NULL, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_why_not_reproducible_pre_release', 'WHY_ESCAPED', NULL, 'Not reproducible pre-release', NULL, NULL, NULL, NULL, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_why_other', 'WHY_ESCAPED', NULL, 'Other', NULL, NULL, NULL, NULL, 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_detected_customer', 'DETECTED_BY', 'CUSTOMER', 'Customer', NULL, NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_detected_support', 'DETECTED_BY', NULL, 'Support', NULL, NULL, NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_detected_monitoring', 'DETECTED_BY', NULL, 'Monitoring', NULL, NULL, NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_detected_internal_team', 'DETECTED_BY', NULL, 'Internal team', NULL, NULL, NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_scope_single_client', 'SCOPE', NULL, 'Single client', NULL, NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_scope_multiple_clients', 'SCOPE', NULL, 'Multiple clients', NULL, NULL, NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_scope_all_clients', 'SCOPE', NULL, 'All clients', NULL, NULL, NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_impact_blocker', 'IMPACT', NULL, 'Blocker', NULL, NULL, NULL, NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_impact_major', 'IMPACT', NULL, 'Major', NULL, NULL, NULL, NULL, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_impact_minor', 'IMPACT', NULL, 'Minor', NULL, NULL, NULL, NULL, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ci_impact_cosmetic', 'IMPACT', NULL, 'Cosmetic', NULL, NULL, NULL, NULL, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Jira settings row (empty JQL; credentials are environment variables only).
INSERT INTO "JiraSettings" ("id", "jql", "productMapping", "scheduleEnabled", "writeBackEnabled", "updatedAt")
VALUES ('default', '', '[]'::jsonb, false, false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Add the regression-pack gate to the built-in "Standard release" template (first section), only
-- if that template still exists and doesn't have the gate yet. Existing releases are unchanged.
UPDATE "ChecklistTemplate"
SET "sections" = jsonb_set("sections", '{0,gates}', ("sections"->0->'gates') || '{"title":"Customer issue regression pack passed","type":"CUSTOMER_REGRESSION","isBlocker":true,"weight":1}'::jsonb), "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'builtin_standard_release'
  AND jsonb_typeof("sections") = 'array' AND jsonb_array_length("sections") > 0
  AND NOT ("sections"::text LIKE '%CUSTOMER_REGRESSION%');
