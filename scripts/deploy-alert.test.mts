import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  APPLY_STEP,
  DEPLOY_WORKFLOW,
  LABEL,
  MISWIRED_LABEL,
  MISWIRED_TITLE,
  ROLLBACK_STEP,
  TITLE,
  github,
  impact,
  outcome,
  reconcile,
} from "./deploy-alert.mjs";

const REPO = "o/r";

type Step = { name: string; conclusion: string };

/** A deploy run's steps, as the jobs API reports them. */
function stepsOf(conclusions: Record<string, string>): Step[] {
  return Object.entries(conclusions).map(([name, conclusion]) => ({
    name,
    conclusion,
  }));
}

const DEPLOYED = stepsOf({
  "Set up job": "success",
  [APPLY_STEP]: "success",
  "Assert the public address is gated": "success",
  [ROLLBACK_STEP]: "skipped",
});
const PARKED = stepsOf({
  "Set up job": "success",
  "A parked cluster is skipped rather than failed": "success",
  [APPLY_STEP]: "skipped",
  [ROLLBACK_STEP]: "skipped",
});
const FAILED_GATE = stepsOf({
  "Set up job": "success",
  [APPLY_STEP]: "success",
  "Assert the public address is gated": "failure",
  [ROLLBACK_STEP]: "success",
});

interface Run {
  id: number;
  conclusion: string | null;
  steps: Step[];
}

interface Issue {
  number: number;
  label: string;
  body: string;
  comments?: { body: string }[];
}

/**
 * A fake of the REST calls deploy-alert.mjs makes. Runs are given newest
 * first; their `updated_at` is derived so the script's sort agrees. Labels
 * always exist, so creating one answers 422 as GitHub does.
 */
function fakeGitHub(runs: Run[], issues: Issue[] = []) {
  const writes: [string, string, unknown][] = [];
  const reads: string[] = [];
  const assign = vi.fn<(path: string, body: unknown) => Promise<object>>(
    async () => ({}),
  );
  const gh = {
    async get(path: string) {
      reads.push(path);
      if (path.includes(`/actions/workflows/${DEPLOY_WORKFLOW}/runs?`))
        return {
          workflow_runs: runs.map((run, i) => ({
            id: run.id,
            run_attempt: 1,
            conclusion: run.conclusion,
            updated_at: `2026-10-${String(20 - i).padStart(2, "0")}T00:00:00Z`,
            head_sha: "abcdef0123456789",
            html_url: `https://github.com/o/r/actions/runs/${run.id}`,
            actor: { login: "holo" },
          })),
        };
      let m = path.match(/actions\/runs\/(\d+)\/attempts\/1\/jobs$/);
      if (m)
        return {
          jobs: [{ steps: runs.find((r) => r.id === Number(m![1]))!.steps }],
        };
      m = path.match(/issues\?state=open&labels=([^&]+)/);
      if (m) {
        const label = decodeURIComponent(m[1]);
        return [
          { number: 500, pull_request: {}, labels: [label] },
          ...issues.filter((issue) => issue.label === label),
        ];
      }
      m = path.match(/issues\/(\d+)$/);
      if (m) {
        const issue = issues.find((i) => i.number === Number(m![1]))!;
        return { body: issue.body, comments: issue.comments?.length ?? 0 };
      }
      m = path.match(/issues\/(\d+)\/comments\?per_page=100&page=(\d+)$/);
      if (m) {
        const issue = issues.find((i) => i.number === Number(m![1]))!;
        const page = Number(m[2]);
        return (issue.comments ?? []).slice((page - 1) * 100, page * 100);
      }
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path: string, body: unknown) {
      if (path.endsWith("/labels"))
        throw Object.assign(new Error("exists"), { status: 422 });
      if (path.endsWith("/assignees")) return assign(path, body);
      writes.push(["POST", path, body]);
      if (path === `repos/${REPO}/issues`)
        return { number: 99, html_url: "https://github.com/o/r/issues/99" };
      return {};
    },
    async patch(path: string, body: unknown) {
      writes.push(["PATCH", path, body]);
      return {};
    },
  };
  return { gh, writes, reads, assign };
}

const quiet = () => {};

describe("outcome", () => {
  it.each([
    ["success", "success", true, "deployed"],
    ["success", "skipped", true, "parked"],
    ["success", "absent", true, "miswired"],
    ["skipped", "absent", false, "noop"],
    ["cancelled", "absent", false, "superseded"],
    ["cancelled", "success", true, "broken"],
    ["failure", "success", true, "broken"],
    ["timed_out", "success", true, "broken"],
  ])("%s with the apply step %s (ran: %s) is %s", (run, apply, ran, want) => {
    expect(outcome(run, apply, ran)).toBe(want);
  });
});

describe("impact", () => {
  it.each([
    ["absent", "absent", /Nothing was applied/],
    ["skipped", "skipped", /Nothing was applied/],
    ["failure", "skipped", /may hold part of this commit/],
    ["success", "success", /rollback succeeded\. Staging runs the previous/],
    ["success", "failure", /rollback ended \*\*failure\*\*/],
  ])("apply %s, rollback %s", (apply, rollback, want) => {
    expect(impact(apply, rollback)).toMatch(want);
  });
});

describe("the couplings to deploy.yml", () => {
  const deploy = readFileSync(`.github/workflows/${DEPLOY_WORKFLOW}`, "utf8");
  const alert = readFileSync(".github/workflows/deploy-alert.yml", "utf8");
  const steps = [...deploy.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1]);

  it("names steps deploy.yml has", () => {
    expect(steps).toContain(APPLY_STEP);
    expect(steps).toContain(ROLLBACK_STEP);
  });

  // `parked` is read off the apply step being skipped, so it is the parked
  // check that must skip it.
  it("keys on a step that a parked cluster skips", () => {
    const block = deploy
      .split(`- name: ${APPLY_STEP}\n`)[1]
      .split(/\n {6}- name:/)[0];
    expect(block).toMatch(/^\s+if: env\.POWERED_OFF != 'true'$/m);
  });

  it("listens to the workflow deploy.yml names itself", () => {
    const name = deploy.match(/^name: (.+)$/m)![1];
    expect(alert).toContain(`workflows: [${name}]`);
  });
});

describe("reconcile", () => {
  it("opens an assigned issue when the newest run failed after the apply", async () => {
    const { gh, writes, assign } = fakeGitHub([
      { id: 3, conclusion: "failure", steps: FAILED_GATE },
    ]);
    await reconcile(gh, REPO, quiet);

    expect(writes).toHaveLength(1);
    const [method, path, body] = writes[0] as [
      string,
      string,
      { title: string; body: string; labels: string[] },
    ];
    expect([method, path]).toEqual(["POST", `repos/${REPO}/issues`]);
    expect(body.title).toBe(TITLE);
    expect(body.labels).toEqual([LABEL]);
    expect(body.body).toContain("finished **failure** on `abcdef0`");
    expect(body.body).toContain(
      "First failing step: **Assert the public address is gated**",
    );
    expect(body.body).toContain("rollback succeeded");
    expect(body.body).toContain("<!-- deploy-alert run:3 attempt:1 -->");
    expect(assign).toHaveBeenCalledWith(`repos/${REPO}/issues/99/assignees`, {
      assignees: ["holo"],
    });
  });

  it("walks back past parked and superseded runs to the failure they follow", async () => {
    const { gh, writes } = fakeGitHub([
      { id: 5, conclusion: "success", steps: PARKED },
      { id: 4, conclusion: "cancelled", steps: [] },
      { id: 3, conclusion: "failure", steps: FAILED_GATE },
      { id: 2, conclusion: "success", steps: DEPLOYED },
    ]);
    await reconcile(gh, REPO, quiet);
    expect(JSON.stringify(writes[0][2])).toContain("run:3 attempt:1");
  });

  it("comments on the open issue instead of opening another", async () => {
    const { gh, writes } = fakeGitHub(
      [{ id: 3, conclusion: "failure", steps: FAILED_GATE }],
      [
        {
          number: 7,
          label: LABEL,
          body: "<!-- deploy-alert run:1 attempt:1 -->",
        },
      ],
    );
    await reconcile(gh, REPO, quiet);
    expect(writes).toEqual([
      [
        "POST",
        `repos/${REPO}/issues/7/comments`,
        { body: expect.stringContaining("run:3 attempt:1") },
      ],
    ]);
  });

  it("does not report a run twice, whether in the body or the last comment", async () => {
    const mark = "<!-- deploy-alert run:3 attempt:1 -->";
    const run = { id: 3, conclusion: "failure", steps: FAILED_GATE };

    const inBody = fakeGitHub([run], [{ number: 7, label: LABEL, body: mark }]);
    await reconcile(inBody.gh, REPO, quiet);
    expect(inBody.writes).toEqual([]);

    const comments = [
      ...Array.from({ length: 149 }, () => ({ body: "older" })),
      { body: mark },
    ];
    const inComment = fakeGitHub(
      [run],
      [{ number: 7, label: LABEL, body: "first report", comments }],
    );
    await reconcile(inComment.gh, REPO, quiet);
    expect(inComment.reads).toContain(
      `repos/${REPO}/issues/7/comments?per_page=100&page=2`,
    );
    expect(inComment.writes).toEqual([]);
  });

  it("closes every open CD issue on a deploy", async () => {
    const { gh, writes } = fakeGitHub(
      [
        { id: 6, conclusion: "success", steps: DEPLOYED },
        { id: 3, conclusion: "failure", steps: FAILED_GATE },
      ],
      [
        { number: 7, label: LABEL, body: "" },
        { number: 8, label: MISWIRED_LABEL, body: "" },
      ],
    );
    await reconcile(gh, REPO, quiet);
    expect(writes).toEqual([
      [
        "POST",
        `repos/${REPO}/issues/7/comments`,
        { body: expect.stringContaining("Deployed on `abcdef0`") },
      ],
      [
        "PATCH",
        `repos/${REPO}/issues/7`,
        { state: "closed", state_reason: "completed" },
      ],
      ["POST", `repos/${REPO}/issues/8/comments`, expect.anything()],
      [
        "PATCH",
        `repos/${REPO}/issues/8`,
        { state: "closed", state_reason: "completed" },
      ],
    ]);
  });

  it("leaves the issue alone while every run is parked", async () => {
    const { gh, writes } = fakeGitHub(
      [
        { id: 5, conclusion: "success", steps: PARKED },
        { id: 4, conclusion: "success", steps: PARKED },
      ],
      [{ number: 7, label: LABEL, body: "" }],
    );
    await reconcile(gh, REPO, quiet);
    expect(writes).toEqual([]);
  });

  it("reports a green run without the apply step as miswired, not parked", async () => {
    const { gh, writes } = fakeGitHub([
      {
        id: 6,
        conclusion: "success",
        steps: stepsOf({ "Set up job": "success" }),
      },
    ]);
    await reconcile(gh, REPO, quiet);
    expect(writes[0][2]).toMatchObject({
      title: MISWIRED_TITLE,
      labels: [MISWIRED_LABEL],
    });
  });

  it("reports a run cancelled mid-rollout", async () => {
    const { gh, writes } = fakeGitHub([
      {
        id: 6,
        conclusion: "cancelled",
        steps: stepsOf({
          [APPLY_STEP]: "success",
          "Wait for the rollout": "cancelled",
        }),
      },
    ]);
    await reconcile(gh, REPO, quiet);
    const body = (writes[0][2] as { body: string }).body;
    expect(body).toContain("finished **cancelled**");
    expect(body).toContain("First failing step: **none");
  });

  it("keeps the issue when its assignee cannot be assigned", async () => {
    const { gh, writes, assign } = fakeGitHub([
      { id: 3, conclusion: "failure", steps: FAILED_GATE },
    ]);
    assign.mockRejectedValueOnce(new Error("422"));
    const log = vi.fn();
    await reconcile(gh, REPO, log);
    expect(writes).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("could not assign it to holo"),
    );
  });
});

describe("github", () => {
  const respond = (status: number, body: unknown = {}) =>
    new Response(JSON.stringify(body), { status });

  it("tries a read three times through 5xx answers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(502))
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(respond(200, { ok: 1 }));
    await expect(github("t", { fetch, pause: 0 }).get("x")).resolves.toEqual({
      ok: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx read or any write", async () => {
    const fetch = vi.fn().mockResolvedValue(respond(404));
    await expect(
      github("t", { fetch, pause: 0 }).get("x"),
    ).rejects.toMatchObject({
      status: 404,
    });
    fetch.mockResolvedValue(respond(502));
    await expect(
      github("t", { fetch, pause: 0 }).post("x", {}),
    ).rejects.toMatchObject({
      status: 502,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
