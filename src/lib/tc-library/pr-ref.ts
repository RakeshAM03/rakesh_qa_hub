import { parsePrUrl } from "@/lib/github";

// "repo #42", "owner/repo #42", "owner/repo#42"
const REPO_NUMBER_RE = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/)?([A-Za-z0-9._-]{1,100})\s*#(\d+)$/;

export function isPrReference(value: string) {
  return parsePrUrl(value) !== null || REPO_NUMBER_RE.test(value.trim());
}

/**
 * Where a PR reference links to: the PR itself for URLs and `owner/repo #n`,
 * a GitHub pull request search for a bare `repo #n` (the owner is unknown).
 */
export function prReferenceHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const pr = parsePrUrl(value);
  if (pr) return pr.url;
  const m = value.trim().match(REPO_NUMBER_RE);
  if (!m) return null;
  const [, owner, repo, number] = m;
  if (owner) return `https://github.com/${owner}${repo}/pull/${number}`;
  return `https://github.com/search?type=pullrequests&q=${encodeURIComponent(`${repo} ${number}`)}`;
}
