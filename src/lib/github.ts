/** https://github.com/<owner>/<repo>/pull/<number>, optionally followed by /files, ?query or #hash. */
const PR_URL_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})\/pull\/(\d+)(?:\/[\w/-]*)?(?:[?#]\S*)?$/;

export type PrRef = { owner: string; repo: string; number: number; url: string };

export function parsePrUrl(value: string): PrRef | null {
  const url = value.trim();
  const m = url.match(PR_URL_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]), url };
}

export function isGithubPrUrl(value: string) {
  return parsePrUrl(value) !== null;
}

/** Splits comma- or newline-separated text into trimmed, non-empty entries. */
export function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
