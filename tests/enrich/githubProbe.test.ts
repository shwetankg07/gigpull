import { describe, it, expect } from "vitest";
import { interpretGithubOrg } from "../../src/enrich/githubProbe.js";

const now = new Date("2026-08-16T00:00:00Z");

describe("interpretGithubOrg", () => {
  it("flags a stalled repo with a long-idle last commit", () => {
    const r = interpretGithubOrg({
      openIssues: 12, lastCommitAt: "2026-02-01T00:00:00Z", hasCi: true,
    }, now);
    expect(r.defects).toContain("stalled_repo");
    expect(r.daysSinceLastCommit).toBeGreaterThan(180);
  });

  it("flags a large open-issue backlog", () => {
    const r = interpretGithubOrg({
      openIssues: 150, lastCommitAt: "2026-08-15T00:00:00Z", hasCi: true,
    }, now);
    expect(r.defects).toContain("issue_backlog");
  });

  it("flags a missing CI setup", () => {
    const r = interpretGithubOrg({
      openIssues: 2, lastCommitAt: "2026-08-15T00:00:00Z", hasCi: false,
    }, now);
    expect(r.defects).toContain("no_ci");
  });

  it("reports no defects for a healthy org", () => {
    const r = interpretGithubOrg({
      openIssues: 3, lastCommitAt: "2026-08-15T00:00:00Z", hasCi: true,
    }, now);
    expect(r.ok).toBe(true);
    expect(r.defects).toEqual([]);
  });

  it("does not treat an unknown last-commit date as a defect", () => {
    const r = interpretGithubOrg({ openIssues: 3, lastCommitAt: null, hasCi: true }, now);
    expect(r.daysSinceLastCommit).toBeNull();
    expect(r.defects).not.toContain("stalled_repo");
  });
});
