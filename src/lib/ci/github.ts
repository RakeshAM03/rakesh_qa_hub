import "server-only";

const API = "https://api.github.com";
const CACHE_TTL_MS = 20_000;

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const githubConnected = () => Boolean(process.env.GITHUB_TOKEN);

/** Short-lived cache for GET responses so polling clients stay under rate limits. */
const cache = new Map<string, { at: number; data: unknown }>();

async function gh<T>(path: string, init: RequestInit = {}, { cacheable = true } = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new GitHubError(503, "GitHub isn't connected (GITHUB_TOKEN is not set).");
  const method = init.method ?? "GET";
  const key = `${method} ${path}`;
  if (method === "GET" && cacheable) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rakesh-qa-hub",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      res.status === 404
        ? "Not found on GitHub — check the repo and workflow file, and that the token can see this repo."
        : res.status === 403 || res.status === 401
          ? "GitHub refused the request — the token may lack Actions access or be rate-limited."
          : (body.message ?? `GitHub returned ${res.status}.`);
    throw new GitHubError(res.status, message);
  }
  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  if (method === "GET" && cacheable) cache.set(key, { at: Date.now(), data });
  return data;
}

const enc = (s: string) => s.split("/").map(encodeURIComponent).join("/");

type RawRun = {
  id: number;
  run_number: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  event: string;
  run_started_at: string | null;
  created_at: string;
  updated_at: string;
  actor: { login: string; avatar_url: string } | null;
  head_branch: string | null;
};
type RawJob = { id: number; name: string; status: string; conclusion: string | null; html_url: string };

export type Run = {
  id: number;
  number: number;
  url: string;
  status: string;
  conclusion: string | null;
  event: string;
  branch: string | null;
  startedAt: string;
  durationSec: number | null;
  actor: { login: string; avatarUrl: string } | null;
  jobs: { passed: number; total: number; list: { id: number; name: string; status: string; conclusion: string | null; url: string }[] };
  reportUrl: string;
};

export async function listRuns(repo: string, workflowFile: string, page: number, perPage: number) {
  const data = await gh<{ total_count: number; workflow_runs: RawRun[] }>(
    `/repos/${enc(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=${perPage}&page=${page}`,
  );
  const runs: Run[] = await Promise.all(
    data.workflow_runs.map(async (r) => {
      const jobs = await gh<{ jobs: RawJob[] }>(`/repos/${enc(repo)}/actions/runs/${r.id}/jobs?per_page=100`).catch(
        () => ({ jobs: [] as RawJob[] }),
      );
      const started = r.run_started_at ?? r.created_at;
      const finished = r.status === "completed" ? r.updated_at : null;
      return {
        id: r.id,
        number: r.run_number,
        url: r.html_url,
        status: r.status,
        conclusion: r.conclusion,
        event: r.event,
        branch: r.head_branch,
        startedAt: started,
        durationSec: finished ? Math.max(0, Math.round((Date.parse(finished) - Date.parse(started)) / 1000)) : null,
        actor: r.actor ? { login: r.actor.login, avatarUrl: r.actor.avatar_url } : null,
        jobs: {
          passed: jobs.jobs.filter((j) => j.conclusion === "success").length,
          total: jobs.jobs.length,
          list: jobs.jobs.map((j) => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, url: j.html_url })),
        },
        // Published reports live in the run's artifacts unless a workflow publishes them elsewhere.
        reportUrl: `${r.html_url}#artifacts`,
      };
    }),
  );
  return { total: data.total_count, runs };
}

/** Confirms the repo and workflow exist; returns the repo's default branch. */
export async function checkSuite(repo: string, workflowFile: string) {
  const info = await gh<{ default_branch: string }>(`/repos/${enc(repo)}`, {}, { cacheable: false });
  await gh(`/repos/${enc(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}`, {}, { cacheable: false });
  return { defaultBranch: info.default_branch };
}

export async function dispatchWorkflow(repo: string, workflowFile: string, ref: string | undefined, inputs: Record<string, string>) {
  const branch = ref || (await checkSuite(repo, workflowFile)).defaultBranch;
  await gh(
    `/repos/${enc(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
    { method: "POST", body: JSON.stringify({ ref: branch, inputs }), headers: { "Content-Type": "application/json" } },
    { cacheable: false },
  );
  // New runs should show up on the next refresh.
  for (const key of cache.keys()) if (key.includes(`/repos/${enc(repo)}/`)) cache.delete(key);
  return { ref: branch };
}

/** Tail of each failed job's log, for root-cause analysis. */
export async function failedJobLogs(repo: string, runId: number, maxCharsPerJob = 12_000) {
  const { jobs } = await gh<{ jobs: RawJob[] }>(`/repos/${enc(repo)}/actions/runs/${runId}/jobs?per_page=100`);
  const failed = jobs.filter((j) => j.conclusion === "failure").slice(0, 3);
  const token = process.env.GITHUB_TOKEN!;
  return Promise.all(
    failed.map(async (job) => {
      const res = await fetch(`${API}/repos/${enc(repo)}/actions/jobs/${job.id}/logs`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "rakesh-qa-hub", Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      const text = res.ok ? await res.text() : "";
      return { name: job.name, log: text.slice(-maxCharsPerJob) };
    }),
  );
}

/**
 * Runs created on or after `since` (YYYY-MM-DD), without per-run job lookups —
 * for dashboards that only need dates, durations and conclusions. Capped at
 * `max` runs (100 per page).
 */
export async function listRunsSince(repo: string, workflowFile: string, since: string, max = 1000) {
  const out: { date: string; durationSec: number | null; conclusion: string | null; completed: boolean }[] = [];
  for (let page = 1; out.length < max && page <= Math.ceil(max / 100); page++) {
    const data = await gh<{ total_count: number; workflow_runs: RawRun[] }>(
      `/repos/${enc(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=100&page=${page}&created=${encodeURIComponent(`>=${since}`)}`,
    );
    for (const r of data.workflow_runs) {
      const started = r.run_started_at ?? r.created_at;
      const completed = r.status === "completed";
      out.push({
        date: started.slice(0, 10),
        durationSec: completed ? Math.max(0, Math.round((Date.parse(r.updated_at) - Date.parse(started)) / 1000)) : null,
        conclusion: r.conclusion,
        completed,
      });
    }
    if (data.workflow_runs.length < 100) break;
  }
  return out.slice(0, max);
}
