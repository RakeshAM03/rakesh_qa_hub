import "server-only";

import type { CiSuite } from "@prisma/client";

import { jsonError } from "@/lib/api";
import { db } from "@/lib/db";
import { checkSuite, GitHubError, githubConnected } from "./github";
import { readDispatchInputs } from "./schema";

export function toSuiteDto(s: CiSuite) {
  return {
    id: s.id,
    name: s.name,
    repo: s.repo,
    workflowFile: s.workflowFile,
    color: s.color,
    dispatchInputs: readDispatchInputs(s.dispatchInputs),
    sortOrder: s.sortOrder,
  };
}

export async function findSuite(id: string) {
  return db.ciSuite.findUnique({ where: { id } });
}

/** When GitHub is connected, confirm the repo and workflow exist; returns an error response or null. */
export async function verifyOnGitHub(repo: string, workflowFile: string) {
  if (!githubConnected()) return null;
  try {
    await checkSuite(repo, workflowFile);
    return null;
  } catch (err) {
    if (err instanceof GitHubError) {
      return jsonError(
        400,
        err.status === 404
          ? `Couldn't find ${workflowFile} in ${repo} on GitHub. Check the repo, the workflow file name, and that the token can access the repo.`
          : err.message,
      );
    }
    throw err;
  }
}

export const suiteNotFound = () => jsonError(404, "That CI suite doesn't exist (it may have been deleted).");
