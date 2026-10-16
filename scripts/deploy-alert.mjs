#!/usr/bin/env node
/**
 * Keeps one issue open while the `deploy` workflow fails on `main`, and closes
 * it on the next run that deploys (#228). deploy-alert.yml runs it.
 *
 * A failed `ci` run blocks a merge. A failed `deploy` run happens after the
 * merge and tells no one: from 2026-09-02 every deploy failed for a month, and
 * staging kept an August revision until 2026-10-16.
 *
 * The rules below come from the platform's deploy-alert.yml (its #479), which
 * learned each of them from a real run. This is a script, not inline bash,
 * because `workflow_run` always runs the copy on `main`: no PR executes it. So
 * the whole reconcile runs under Vitest against a fake API instead.
 *
 *   GITHUB_TOKEN=… REPO=owner/name node scripts/deploy-alert.mjs
 */
import { pathToFileURL } from "node:url";

/** The couplings to deploy.yml. deploy-alert.test.mts checks they hold. */
export const DEPLOY_WORKFLOW = "deploy.yml";
export const APPLY_STEP = "Apply the manifests";
export const ROLLBACK_STEP = "Roll back the revision that failed the gate";

// Looked up by label, not title: anyone can edit a title.
export const LABEL = "cd-failure";
export const MISWIRED_LABEL = "cd-notifier-miswired";
export const TITLE = "CD: the deploy workflow is failing on main";
export const MISWIRED_TITLE =
  "CD: the deploy notifier can no longer tell deployed from parked";

// How many completed runs to look back for one that carries news. Parked weeks
// are why it is not 1: a parked run says nothing either way, and stopping at
// one would strand the failure before it.
const WINDOW = 12;

/**
 * What a finished run means, from its conclusion, the apply step's conclusion
 * (`absent` when no step has that name), and whether any step executed.
 */
export function outcome(conclusion, apply, ran) {
  switch (conclusion) {
    case "success":
      if (apply === "success") return "deployed";
      // The parked check skips every step after it: green, nothing deployed.
      if (apply === "skipped") return "parked";
      // The step this keys on was renamed or removed. Loud on purpose: as the
      // quiet arm, every real deploy would read as parked and no issue would
      // ever close again.
      return "miswired";
    // No job ran: nothing deployed and nothing broke.
    case "skipped":
      return "noop";
    // GitHub cancels the PENDING run of a concurrency group when a newer one
    // queues, so back-to-back merges cancel runs that did nothing. A run
    // cancelled mid-rollout is a real failure.
    case "cancelled":
      return ran ? "broken" : "superseded";
    default:
      return "broken";
  }
}

/** Which revision staging runs after a failed run, for the report. */
export function impact(apply, rollback) {
  if (apply === "skipped" || apply === "absent")
    return "Nothing was applied. Staging still runs the previous revision.";
  if (apply !== "success")
    return `\`${APPLY_STEP}\` ended **${apply}**, so staging may hold part of this commit. Check \`kubectl rollout history deployment/console\` before you assume which revision it runs.`;
  if (rollback === "success")
    return "This commit was applied, a later step failed, and the rollback succeeded. Staging runs the previous revision.";
  return `This commit was applied and a later step failed, but the rollback ended **${rollback}**. Check \`kubectl rollout history deployment/console\` before you assume which revision staging runs.`;
}

/**
 * Brings the tracking issues in line with the newest completed run that
 * carries news. Each call derives everything again, so a lost or repeated call
 * costs nothing.
 */
export async function reconcile(gh, repo, log = console.log) {
  const { workflow_runs } = await gh.get(
    `repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW}/runs?branch=main&status=completed&per_page=${WINDOW}`,
  );
  // Newest FINISHED first. The API lists by creation, and a re-run of an old
  // run keeps its place in that order.
  const runs = [...workflow_runs].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  for (const run of runs) {
    // An unknown shape must not become an outage report.
    if (!run.conclusion) continue;
    // Pinned to the attempt: the plain jobs endpoint answers for the latest
    // attempt, which may not be the one this conclusion belongs to.
    const { jobs } = await gh.get(
      `repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
    );
    const steps = jobs.flatMap((job) => job.steps ?? []);
    const conclusionOf = (name) =>
      steps.find((step) => step.name === name)?.conclusion ?? "absent";
    const apply = conclusionOf(APPLY_STEP);
    const ran = steps.some(
      (step) => step.conclusion === "success" || step.conclusion === "failure",
    );
    const result = outcome(run.conclusion, apply, ran);
    log(
      `run ${run.id} attempt ${run.run_attempt}: ${run.conclusion} / ${APPLY_STEP}=${apply} -> ${result}`,
    );
    if (result === "broken" || result === "deployed" || result === "miswired")
      return report(gh, repo, log, {
        run,
        result,
        apply,
        rollback: conclusionOf(ROLLBACK_STEP),
        failed: steps.find((step) => step.conclusion === "failure")?.name,
      });
  }
  log(`the newest ${runs.length} completed run(s) carry no news`);
}

async function report(gh, repo, log, { run, result, apply, rollback, failed }) {
  const sha = run.head_sha.slice(0, 7);
  await ensureLabel(gh, repo, LABEL, "The deploy workflow is failing on main");
  await ensureLabel(
    gh,
    repo,
    MISWIRED_LABEL,
    "deploy-alert can no longer find the deploy step it keys on",
  );

  if (result === "deployed") {
    // Closes the miswired issue too: a deploy is read off the very step whose
    // absence that issue reports.
    for (const label of [LABEL, MISWIRED_LABEL]) {
      const number = await openIssue(gh, repo, label);
      if (!number) continue;
      await gh.post(`repos/${repo}/issues/${number}/comments`, {
        body: `Deployed on \`${sha}\`: ${run.html_url}`,
      });
      await gh.patch(`repos/${repo}/issues/${number}`, {
        state: "closed",
        state_reason: "completed",
      });
      log(`closed #${number}`);
    }
    return;
  }

  const [label, title, body] =
    result === "miswired"
      ? [
          MISWIRED_LABEL,
          MISWIRED_TITLE,
          [
            `\`deploy\` succeeded on \`${sha}\`, but it has no step named **${APPLY_STEP}**.`,
            "",
            "That step's conclusion is how a deploy is told from a run skipped because staging is parked. Until the name matches again, no deploy closes a CD issue.",
            "",
            `Run: ${run.html_url}`,
          ],
        ]
      : [
          LABEL,
          TITLE,
          [
            `\`deploy\` finished **${run.conclusion}** on \`${sha}\`.`,
            "",
            `First failing step: **${failed ?? "none (the run was cancelled or never started)"}**`,
            "",
            `Run: ${run.html_url}`,
            "",
            impact(apply, rollback),
            "",
            "This issue closes on the next run that deploys. A run skipped because staging is parked does not close it.",
          ],
        ];
  // Keyed on the attempt too: two attempts of one run are two reports.
  const mark = `<!-- deploy-alert run:${run.id} attempt:${run.run_attempt} -->`;
  const text = `${body.join("\n")}\n\n${mark}`;

  const number = await openIssue(gh, repo, label);
  if (number) {
    // Never say the same thing twice. A report already made is the issue body
    // or, being the newest, on the last page of comments.
    const issue = await gh.get(`repos/${repo}/issues/${number}`);
    const page = Math.max(1, Math.ceil(issue.comments / 100));
    const comments = await gh.get(
      `repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`,
    );
    if (
      [issue.body, ...comments.map((c) => c.body)].some((b) =>
        b?.includes(mark),
      )
    ) {
      log(`already reported run ${run.id} on #${number}`);
      return;
    }
    await gh.post(`repos/${repo}/issues/${number}/comments`, { body: text });
    log(`commented on #${number}`);
    return;
  }
  const created = await gh.post(`repos/${repo}/issues`, {
    title,
    body: text,
    labels: [label],
  });
  log(`opened ${created.html_url}`);
  // Assigned, because the assignment is what notifies someone. A separate
  // call, so a login that cannot be assigned (a bot) costs the assignment and
  // not the issue.
  try {
    await gh.post(`repos/${repo}/issues/${created.number}/assignees`, {
      assignees: [run.actor.login],
    });
  } catch (error) {
    log(
      `::warning::opened #${created.number} but could not assign it to ${run.actor.login}: ${error.message}`,
    );
  }
}

async function ensureLabel(gh, repo, name, description) {
  try {
    await gh.post(`repos/${repo}/labels`, {
      name,
      color: "B60205",
      description,
    });
  } catch (error) {
    // 422: the label exists.
    if (error.status !== 422) throw error;
  }
}

async function openIssue(gh, repo, label) {
  const issues = await gh.get(
    `repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=10`,
  );
  // The issues endpoint lists pull requests too.
  return issues.find((issue) => !issue.pull_request)?.number;
}

/**
 * The REST client. Reads are tried three times, because a notifier that gives
 * up on one 502 says nothing on the day the API is having a bad hour, which is
 * often the day CD is red. Writes are tried once: retrying a create that in
 * fact succeeded files the outage twice.
 */
export function github(token, { fetch: fetchImpl = fetch, pause = 5000 } = {}) {
  async function call(method, path, body) {
    const response = await fetchImpl(`https://api.github.com/${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(body && { "content-type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
    if (!response.ok) {
      const error = new Error(
        `${method} ${path}: ${response.status} ${await response.text()}`,
      );
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    async get(path) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await call("GET", path);
        } catch (error) {
          // A 4xx answer will not change on a retry.
          if (attempt === 3 || (error.status && error.status < 500))
            throw error;
          await new Promise((resolve) => setTimeout(resolve, attempt * pause));
        }
      }
    },
    post: (path, body) => call("POST", path, body),
    patch: (path, body) => call("PATCH", path, body),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { GITHUB_TOKEN, REPO } = process.env;
  if (!GITHUB_TOKEN || !REPO) {
    console.error("deploy-alert.mjs needs GITHUB_TOKEN and REPO");
    process.exit(2);
  }
  try {
    await reconcile(github(GITHUB_TOKEN), REPO);
  } catch (error) {
    console.error(`deploy-alert.mjs failed — ${error.message}`);
    process.exit(1);
  }
}
