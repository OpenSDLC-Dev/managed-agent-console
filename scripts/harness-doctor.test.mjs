import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const doctor = "scripts/harness-doctor.mjs";
const hosts = ["claude", "codex", "antigravity"];
const registries = {
  claude: ".claude/settings.json",
  codex: ".codex/hooks.json",
  antigravity: ".agents/hooks.json",
};
const guide = [
  "# Temporary project",
  "SessionStart runs the doctor. Use node scripts/harness-doctor.mjs check and node scripts/harness-doctor.mjs rules <path>.",
  "<!-- BEGIN:nextjs-agent-rules -->",
  "Read node_modules/next/dist/docs/.",
  "<!-- END:nextjs-agent-rules -->",
  "",
].join("\n");
function command(cwd, program, args, options = {}) {
  const env = { ...process.env };
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_PREFIX",
  ])
    delete env[key];
  const result = spawnSync(program, args, {
    cwd,
    env,
    encoding: "utf8",
    ...options,
  });
  assert.ifError(result.error);
  return {
    status: result.status,
    text: (result.stdout ?? "") + (result.stderr ?? ""),
  };
}
function pass(result) {
  assert.equal(result.status, 0, result.text);
  return result.text;
}
function fail(result, pattern) {
  assert.notEqual(result.status, 0, result.text);
  assert.match(result.text, pattern);
}
function set(cwd, path, text) {
  const dest = join(cwd, path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text);
}
function putJson(cwd, key, value) {
  set(cwd, key, JSON.stringify(value, null, 2) + "\n");
}
function get(cwd, key) {
  return readFileSync(join(cwd, key), "utf8");
}
function run(cwd, ...args) {
  return command(cwd, process.execPath, [join(cwd, doctor), ...args]);
}
function fixture(t) {
  const tmp = mkdtempSync(join(tmpdir(), "Console harness spaces "));
  t.after(() =>
    rmSync(tmp, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    }),
  );
  const cwd = join(tmp, "base");
  mkdirSync(cwd);
  pass(command(cwd, "git", ["init", "-q"]));
  set(cwd, "AGENTS.md", guide);
  set(cwd, doctor, get(root, doctor));
  set(cwd, ".gitattributes", get(root, ".gitattributes"));
  cpSync(join(root, "harness"), join(cwd, "harness"), { recursive: true });
  return { tmp, cwd };
}

test("a clean clone discovers all three host configurations from subdirectories and linked worktrees", (t) => {
  const { tmp, cwd } = fixture(t);
  pass(run(cwd, "sync"));
  pass(command(cwd, "git", ["add", "."]));
  pass(
    command(cwd, "git", [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "-qm",
      "fixture",
    ]),
  );
  const clone = join(tmp, "clone"),
    linked = join(tmp, "linked");
  pass(command(tmp, "git", ["clone", "-q", cwd, clone]));
  pass(command(clone, "git", ["worktree", "add", "--detach", linked, "HEAD"]));
  for (const host of hosts) {
    const entry = JSON.parse(get(linked, registries[host]));
    const native =
      host === "antigravity"
        ? entry["harness-doctor"].SessionStart[0]
        : entry.hooks.SessionStart[0].hooks[0];
    const [, alias, body] = /^git -c "alias\.([\w-]+)=!([^"]+)" [\w-]+$/.exec(
      native.command,
    );
    const raw = pass(
      command(join(linked, "harness", "rules"), "git", [
        "-c",
        "alias." + alias + "=!" + body,
        alias,
      ]),
    );
    const reply = JSON.parse(raw);
    const message =
      host === "antigravity"
        ? reply.injectSteps[0].systemMessage.systemMessage
        : reply.hookSpecificOutput.additionalContext;
    assert.match(message, /harness-doctor: OK/);
    assert.ok(message.includes(realpathSync.native(linked)), message);
    pass(run(clone, "check", "--host", host));
  }
  pass(run(linked, "sync"));
  pass(run(linked, "sync"));
  assert.equal(pass(command(linked, "git", ["status", "--porcelain"])), "");
});

test("startup names only the current host's drift and leaves the changed role intact", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = ".codex/agents/reviewer.toml";
  const original = get(cwd, key);
  set(cwd, key, 'model = "pinned"\n' + original);
  pass(run(cwd, "check", "--host", "claude"));
  const response = JSON.parse(pass(run(cwd, "session-start", "codex")));
  assert.match(
    response.hookSpecificOutput.additionalContext,
    /FAIL[\s\S]*\.codex\/agents\/reviewer\.toml/,
  );
  fail(run(cwd, "check"), /\.codex\/agents\/reviewer\.toml/);
  assert.notEqual(get(cwd, key), original);
  pass(run(cwd, "sync"));
  assert.equal(get(cwd, key), original);
  const config = ".codex/config.toml";
  const override = '[agents]\ndefault_subagent_reasoning_effort = "low"\n';
  set(cwd, config, override);
  fail(
    run(cwd, "check", "--host", "codex"),
    /\.codex\/config\.toml overrides model inheritance/,
  );
  pass(run(cwd, "check", "--host", "claude"));
  fail(run(cwd, "sync"), /model inheritance/);
  assert.equal(get(cwd, config), override);
  set(cwd, config, 'agents = { default_subagent_model = "pinned" }\n');
  fail(run(cwd, "check", "--host", "codex"), /model inheritance/);
  set(cwd, config, 'model = "developer-selection"\n');
  pass(run(cwd, "check", "--host", "codex"));
  const claudeKey = registries.claude;
  const claudeSettings = JSON.parse(get(cwd, claudeKey));
  putJson(cwd, claudeKey, {
    ...claudeSettings,
    env: { CLAUDE_CODE_SUBAGENT_MODEL: "pinned" },
  });
  fail(
    run(cwd, "check", "--host", "claude"),
    /\.claude\/settings\.json forces a subagent model/,
  );
  putJson(cwd, claudeKey, claudeSettings);
  let manifest = JSON.parse(get(cwd, "harness/manifest.json"));
  manifest.agents[0].effort = "medium";
  putJson(cwd, "harness/manifest.json", manifest);
  fail(run(cwd, "check"), /harness\/manifest.json agent/);
  delete manifest.agents[0].effort;
  manifest.agents[0].antigravityTools.push("run_command");
  putJson(cwd, "harness/manifest.json", manifest);
  fail(run(cwd, "check"), /file-read\/search-only/);
});

test("skill attachments retain arbitrary bytes and executable mode", (t) => {
  const { cwd } = fixture(t);
  const suffix = "skills/review-branch/bin/probe";
  const input = "harness/" + suffix;
  const data = Buffer.from([0, 233, 255, 10]);
  set(cwd, input, data);
  if (process.platform !== "win32") chmodSync(join(cwd, input), 0o750);
  else pass(command(cwd, "git", ["add", "--chmod=+x", "--", input]));
  const first = run(cwd, "sync");
  if (process.platform === "win32") fail(first, /git add --chmod=\+x/);
  else pass(first);
  for (const dir of [".claude", ".agents"]) {
    const target = join(cwd, dir, suffix);
    assert.deepEqual(readFileSync(target), data);
    if (process.platform !== "win32") assert.ok(statSync(target).mode & 0o100);
    else
      pass(
        command(cwd, "git", ["add", "--chmod=+x", "--", dir + "/" + suffix]),
      );
  }
  pass(run(cwd, "check"));
  rmSync(join(cwd, ".agents", suffix));
  fail(
    run(cwd, "check"),
    /\.agents\/skills\/review-branch\/bin\/probe is missing/,
  );
  pass(run(cwd, "sync"));
  pass(run(cwd, "check"));
});

test("rules returns the complete union for planned paths relative to the caller", (t) => {
  const { cwd } = fixture(t);
  const paths = pass(
    command(join(cwd, "harness"), process.execPath, [
      join(cwd, doctor),
      "rules",
      "../src/app/callback/route.ts",
      "../src/components/name.tsx",
      "../test/a",
    ]),
  );
  for (const name of ["platform-contract", "ui-evidence"]) {
    const key = "harness/rules/" + name + ".md";
    assert.ok(paths.includes(key + "\n" + get(cwd, key).trimEnd()));
    assert.equal(paths.split(key).length, 2, "one copy for overlapping inputs");
  }
  assert.equal(pass(run(cwd, "rules", "LICENSE")), "");
  fail(run(cwd, "rules", "../other/file"), /outside the worktree/);
  const source = "harness/rules/ui-evidence.md";
  set(cwd, source, get(cwd, source) + "\n[missing](./gone.md)\n");
  fail(run(cwd, "check"), /missing path: \.\/gone.md/);
});

test("registered hook drift is repairable and custom hooks, malformed files and unrelated settings survive", (t) => {
  const { cwd } = fixture(t);
  putJson(cwd, registries.claude, {
    enabledPlugins: { typescript: true },
    permissions: { deny: ["private"] },
  });
  pass(run(cwd, "sync"));
  const settings = JSON.parse(get(cwd, registries.claude));
  assert.deepEqual(settings.permissions, { deny: ["private"] });
  const original = get(cwd, registries.claude);
  settings.hooks.SessionStart[0].matcher = "resume";
  putJson(cwd, registries.claude, settings);
  fail(run(cwd, "check"), /\.claude\/settings.json differs/);
  pass(run(cwd, "sync"));
  assert.equal(get(cwd, registries.claude), original);
  for (const host of hosts) {
    const key = registries[host],
      good = get(cwd, key),
      custom = JSON.parse(good);
    if (host === "antigravity")
      custom.private = {
        SessionStart: [{ type: "command", command: "private" }],
      };
    else
      custom.hooks.SessionStart[0].hooks.push({
        type: "command",
        command: "private",
      });
    putJson(cwd, key, custom);
    const saved = get(cwd, key);
    fail(run(cwd, "sync"), /unregistered/);
    assert.equal(get(cwd, key), saved);
    set(cwd, key, "{");
    fail(run(cwd, "sync"), /JSON/);
    assert.equal(get(cwd, key), "{");
    set(cwd, key, good);
  }
  set(cwd, ".claude/agents/unregistered.md", "personal");
  fail(run(cwd, "sync"), /unregistered.md/);
  assert.equal(get(cwd, ".claude/agents/unregistered.md"), "personal");
});

test("checks the 200 physical lines, alternate instructions, and hook policy from source", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  set(cwd, "AGENTS.md", guide + "\n".repeat(201));
  fail(run(cwd, "check"), /physical lines/);
  set(
    cwd,
    "AGENTS.md",
    guide.replace("node_modules/next/dist/docs/", "elsewhere"),
  );
  fail(run(cwd, "check"), /Next.js instructions/);
  set(cwd, "AGENTS.md", guide);
  set(cwd, "AGENTS.override.md", "shadow");
  fail(run(cwd, "check"), /shadows/);
  rmSync(join(cwd, "AGENTS.override.md"));
  let policy = JSON.parse(get(cwd, "harness/hooks/codex.json"));
  policy.hooks.PreToolUse[0].matcher = "Bash";
  putJson(cwd, "harness/hooks/codex.json", policy);
  fail(run(cwd, "check"), /for every tool/);
  assert.ok(existsSync(join(cwd, ".codex/hooks.json")));
});

test("Codex denies mutating and shell tools only in the restricted roles", () => {
  const guard = join(root, "harness/hooks/codex-readonly.mjs");
  function invoke(event) {
    return pass(
      command(root, process.execPath, [guard], {
        input: JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          ...event,
        }),
      }),
    );
  }
  for (const agent_type of ["issue-triage", "reviewer"]) {
    for (const tool_name of [
      "Bash",
      "apply_patch",
      "spawn_agent",
      "mcp__someapp__update",
    ]) {
      const output = JSON.parse(
        invoke({ agent_type, agent_id: "child", tool_name }),
      );
      assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
    }
    assert.equal(invoke({ agent_type, tool_name: "read_file" }), "");
  }
  assert.equal(invoke({}), "");
  assert.equal(
    invoke({
      agent_type: "other",
      agent_id: "child",
      tool_name: "apply_patch",
    }),
    "",
  );
  assert.equal(
    JSON.parse(invoke({ agent_id: "child" })).hookSpecificOutput
      .permissionDecision,
    "deny",
  );
  assert.equal(
    JSON.parse(invoke({ hook_event_name: "PostToolUse" })).hookSpecificOutput
      .permissionDecision,
    "deny",
  );
});
