// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { issueEvidence } from "./issue-triage.mjs";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
const gh = vi.mocked(execFileSync);
const endpoint = "repos/OpenSDLC-Dev/managed-agent-console/issues/42";
const issue = {
  number: 42,
  title: "Review scope",
  user: { login: "reporter" },
  state: "open",
  type: { name: "Bug" },
  body: "First report",
  html_url: "issue/42",
  labels: [{ name: "medium" }, { name: "p1" }],
};
beforeEach(() => gh.mockReset());

it("hands the reviewer the issue and the complete discussion using only GitHub reads", () => {
  const comments = [
    [{ body: "Initial scope", user: { login: "one" }, html_url: "comment/1" }],
    [
      {
        body: "Updated decision\nwith evidence",
        user: null,
        html_url: "comment/101",
      },
    ],
  ];
  gh.mockReturnValueOnce(JSON.stringify(issue)).mockReturnValueOnce(
    JSON.stringify(comments),
  );
  expect(issueEvidence(["42"])).toEqual({
    number: 42,
    url: "issue/42",
    title: issue.title,
    author: "reporter",
    state: "open",
    type: "Bug",
    body: issue.body,
    labels: ["medium", "p1"],
    comments: [
      { body: "Initial scope", author: "one", url: "comment/1" },
      {
        body: "Updated decision\nwith evidence",
        author: null,
        url: "comment/101",
      },
    ],
  });
  expect(gh.mock.calls.map(([name, args]) => [name, args])).toEqual([
    ["gh", ["api", "--method", "GET", endpoint]],
    [
      "gh",
      [
        "api",
        "--method",
        "GET",
        "--paginate",
        "--slurp",
        endpoint + "/comments?per_page=100",
      ],
    ],
  ]);
});

it("allows an issue without comments or a type", () => {
  gh.mockReturnValueOnce(
    JSON.stringify({ ...issue, type: null }),
  ).mockReturnValueOnce("[[]]");
  expect(issueEvidence(["42"])).toMatchObject({ type: null, comments: [] });
});

it("fails on an incomplete discussion instead of returning a partial handoff", () => {
  gh.mockReturnValueOnce(JSON.stringify(issue)).mockImplementationOnce(() => {
    throw new Error("Could not read page 2");
  });
  expect(() => issueEvidence(["42"])).toThrow(/Could not read page 2/);
});

it("rejects PRs and accepts only a single issue number", () => {
  for (const args of [[], ["--help"], ["0"], ["42", "--write"]]) {
    expect(() => issueEvidence(args)).toThrow(/usage/i);
  }
  expect(gh).not.toHaveBeenCalled();
  gh.mockReturnValueOnce(
    JSON.stringify({ ...issue, pull_request: { url: "pr/42" } }),
  );
  expect(() => issueEvidence(["42"])).toThrow(/pull request/i);
  expect(gh).toHaveBeenCalledTimes(1);
});

it("connects the start-of-work instructions to a reviewer with only file reading and search", () => {
  const guide = readFileSync("CLAUDE.md", "utf8");
  expect(guide).toContain("node scripts/issue-triage.mjs NUMBER");
  const rolePath = ".claude/agents/issue-triage.md";
  expect(guide).toContain(`(./${rolePath})`);
  const role = readFileSync(rolePath, "utf8");
  const meta = parse(role.split(/^---\s*$/m)[1]);
  expect(meta).toEqual({
    name: "issue-triage",
    description: expect.any(String),
    tools: "Read, Grep, Glob",
  });
});
