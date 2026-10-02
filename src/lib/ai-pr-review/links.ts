import { createHash } from "node:crypto";
import type { Flag } from "@prisma/client";

const OWNER_REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

/**
 * Link to the flagged file in the PR's "Files changed" view. GitHub anchors
 * each file as #diff-<sha256(path)>, with R<line> for a line on the new side.
 * Null when the repo isn't "owner/name" or there's no PR number.
 */
export function flagFileUrl(repo: string, prNumber: number | null, filePath: string | null, line: number | null) {
  if (!prNumber || !OWNER_REPO_RE.test(repo)) return null;
  const base = `https://github.com/${repo}/pull/${prNumber}/files`;
  if (!filePath) return base;
  const anchor = createHash("sha256").update(filePath).digest("hex");
  return `${base}#diff-${anchor}${line ? `R${line}` : ""}`;
}

export function withFileUrl(flag: Flag) {
  return { ...flag, fileUrl: flagFileUrl(flag.repo, flag.prNumber, flag.filePath, flag.line) };
}
