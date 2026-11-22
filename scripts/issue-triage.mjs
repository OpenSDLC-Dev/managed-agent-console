import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function github(...args) {
  return JSON.parse(
    execFileSync("gh", ["api", "--method", "GET", ...args], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "inherit"],
    }),
  );
}

export function issueEvidence(args) {
  const [number] = args;
  if (args.length !== 1 || !/^[1-9]\d*$/.test(number)) {
    throw new Error("Usage: node scripts/issue-triage.mjs ISSUE_NUMBER");
  }
  const endpoint = `repos/OpenSDLC-Dev/managed-agent-console/issues/${number}`;
  const issue = github(endpoint);
  if (issue.pull_request) throw new Error(`#${number} is a pull request`);
  const pages = github(
    "--paginate",
    "--slurp",
    endpoint + "/comments?per_page=100",
  );
  const comments = pages.flat().map(({ body, user, html_url }) => ({
    body,
    author: user?.login ?? null,
    url: html_url,
  }));
  return {
    number: issue.number,
    url: issue.html_url,
    title: issue.title,
    author: issue.user?.login ?? null,
    state: issue.state,
    type: issue.type?.name ?? null,
    body: issue.body,
    labels: issue.labels.map(({ name }) => name),
    comments,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(issueEvidence(process.argv.slice(2))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
