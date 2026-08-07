#!/usr/bin/env node
/**
 * The probe ratchet (plan 04 slice 2, decision 7).
 *
 * Adversarial input reaches this console at two seams — SSE/seed
 * reconciliation and wire parsing — plus the surface that renders whatever
 * they produce. A suite of only happy-path assertions passes just as loudly
 * when one of those is broken as when it works, and the drift is silent:
 * nobody deletes coverage on purpose, it erodes one refactor at a time. This
 * script makes that erosion loud.
 *
 * **Convention:** an adversarial test is named `probe: …`. Adding one is the
 * whole cost of keeping a seam honest.
 *
 * It asks Vitest for the tests it actually **collects** rather than grepping
 * source, because source text is not evidence that anything runs (review
 * finding, PR #35). Verified against `vitest list`: a commented-out block, an
 * `it.skip`, and a `describe("probe: …")` whose children were removed all
 * vanish from collection, while a live probe appears. A regex over the file
 * would have counted all four.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Seams, and the source modules within them that adversarial input reaches.
 * A module is covered when some collected `probe:` test lives in a file whose
 * name starts with it — `store.violations.test.ts` and `store.edge.test.ts`
 * both cover `store`, so probes can be reorganized without editing this list.
 */
const SEAMS = [
  {
    dir: "src/lib/session-trace",
    why: "SSE / seed reconciliation — a stream may drop, reorder, or duplicate anything",
    // `store` reconciles the stream; `summary` and `timing` read wire fields
    // off whatever it produced, which is where a missing one becomes a wrong
    // rendered value. `sse`/`use-*` are transport and clock — covered, but not
    // where malformed *content* lands.
    modules: ["store", "summary", "timing"],
  },
  {
    dir: "src/lib/platform",
    why: "wire parsing — the shapes a platform actually renders",
    modules: ["schemas"],
  },
  {
    dir: "src/app/(console)/sessions/[id]",
    why: "the trace surface — renders whatever the two seams above produce",
    modules: ["page"],
  },
];

const PROBE = /(^|> )probe:/;

async function collectTests() {
  const cli = path.join(root, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(cli)) {
    throw new Error(`vitest CLI not found at ${cli} — run \`pnpm install\`.`);
  }
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [cli, "list", "--json"],
    { cwd: root, maxBuffer: 64 * 1024 * 1024 },
  );
  // Vite prints config warnings before the payload.
  const start = stdout.indexOf("[");
  if (start === -1) throw new Error(`no JSON in \`vitest list\` output`);
  return JSON.parse(stdout.slice(start));
}

const tests = await collectTests();
if (tests.length === 0) {
  console.error("probe ratchet: `vitest list` collected no tests at all.");
  process.exit(1);
}

const probes = tests.filter((test) => PROBE.test(test.name));
const failures = [];

for (const seam of SEAMS) {
  const seamDir = path.join(root, seam.dir);
  for (const target of seam.modules) {
    const covering = probes.filter((test) => {
      const file = path.resolve(test.file);
      if (path.dirname(file) !== seamDir) return false;
      return path.basename(file).split(".")[0] === target;
    });
    if (covering.length === 0) {
      failures.push(
        `${seam.dir}/${target}\n` +
          `    no live "probe:" test is collected for this module.\n` +
          `    ${seam.why}.\n` +
          `    This seam takes input the console did not author, so happy-path\n` +
          `    coverage alone cannot tell a working surface from a broken one.\n` +
          `    Add a test named "probe: …" asserting honest degradation — and note\n` +
          `    that commenting it out or marking it .skip will not satisfy this check.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    `probe ratchet: ${failures.length} seam module(s) lost probe coverage\n\n  ` +
      failures.join("\n\n  ") +
      "\n",
  );
  process.exit(1);
}

const total = SEAMS.reduce((n, seam) => n + seam.modules.length, 0);
console.log(
  `probe ratchet: ${probes.length} live probe tests cover ${total} seam modules ` +
    `across ${SEAMS.length} seams.`,
);
