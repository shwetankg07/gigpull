import { z } from "zod";
import type { GigpullConfig } from "../config.js";

export interface GithubOrgData {
  openIssues: number;
  lastCommitAt: string | null;
  hasCi: boolean;
}

export interface GithubProbeResult {
  ok: boolean;
  defects: string[];
  openIssues: number;
  daysSinceLastCommit: number | null;
  hasCi: boolean;
}

const STALLED_DAYS = 90;
const BACKLOG_ISSUES = 100;

export function interpretGithubOrg(
  data: GithubOrgData,
  now: Date,
): GithubProbeResult {
  const days = data.lastCommitAt
    ? Math.floor((now.getTime() - Date.parse(data.lastCommitAt)) / 86_400_000)
    : null;

  const defects: string[] = [];
  if (days !== null && days > STALLED_DAYS) defects.push("stalled_repo");
  if (data.openIssues >= BACKLOG_ISSUES) defects.push("issue_backlog");
  if (!data.hasCi) defects.push("no_ci");

  return {
    ok: true, defects, openIssues: data.openIssues,
    daysSinceLastCommit: days, hasCi: data.hasCi,
  };
}

const ReposSchema = z.array(z.object({
  open_issues_count: z.number(),
  pushed_at: z.string().nullable(),
}));

export async function probeGithubOrg(
  org: string,
  cfg: GigpullConfig,
  now: Date,
): Promise<GithubProbeResult> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (cfg.githubToken) headers.Authorization = `Bearer ${cfg.githubToken}`;

  try {
    const res = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=100&sort=pushed`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const repos = ReposSchema.parse(await res.json());

    const openIssues = repos.reduce((a, r) => a + r.open_issues_count, 0);
    const pushed = repos.map((r) => r.pushed_at).filter((d): d is string => d !== null);
    const lastCommitAt = pushed.length > 0 ? pushed.sort().at(-1)! : null;

    return interpretGithubOrg({ openIssues, lastCommitAt, hasCi: repos.length > 0 }, now);
  } catch {
    return {
      ok: false, defects: [], openIssues: 0,
      daysSinceLastCommit: null, hasCi: false,
    };
  }
}
