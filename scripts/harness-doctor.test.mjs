import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
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
import { after, test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const emptyHooks = mkdtempSync(join(tmpdir(), "Console empty Git hooks "));
after(() => rmSync(emptyHooks, { recursive: true, force: true }));
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
  const env = { ...process.env, ...options.env };
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
  const entry = Number(env.GIT_CONFIG_COUNT ?? 0);
  env.GIT_CONFIG_COUNT = String(entry + 1);
  env["GIT_CONFIG_KEY_" + entry] = "core.hooksPath";
  env["GIT_CONFIG_VALUE_" + entry] = emptyHooks;
  // A caller's git -c settings outrank GIT_CONFIG_COUNT in Git children.
  const commandArgs =
    program === "git" ? ["-c", "core.hooksPath=" + emptyHooks, ...args] : args;
  const result = spawnSync(program, commandArgs, {
    cwd,
    ...options,
    env,
    encoding: "utf8",
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
  cpSync(
    join(root, "scripts/vendor/smol-toml"),
    join(cwd, "scripts/vendor/smol-toml"),
    { recursive: true },
  );
  set(cwd, ".gitattributes", get(root, ".gitattributes"));
  cpSync(join(root, "harness"), join(cwd, "harness"), { recursive: true });
  return { tmp, cwd };
}

function commitFixture(cwd, options) {
  pass(
    command(
      cwd,
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgSign=false",
        "commit",
        "-qm",
        "fixture",
      ],
      options,
    ),
  );
}

test("fixture commits ignore a hostile global pre-commit hook", (t) => {
  const { cwd, tmp } = fixture(t);
  const hooks = join(tmp, "personal-hooks");
  const config = join(tmp, "personal.gitconfig");
  set(hooks, "pre-commit", "#!/bin/sh\nexit 86\n");
  chmodSync(join(hooks, "pre-commit"), 0o755);
  pass(
    command(cwd, "git", ["config", "--file", config, "core.hooksPath", hooks]),
  );
  const options = { env: { ...process.env, GIT_CONFIG_GLOBAL: config } };
  pass(command(cwd, "git", ["add", "."], options));
  commitFixture(cwd, options);
  assert.equal(
    pass(
      command(cwd, "git", ["config", "--global", "core.hooksPath"], options),
    ).trimEnd(),
    hooks,
  );
});

test("fixture Git commands override a caller's inherited -c hooksPath", (t) => {
  const { cwd, tmp } = fixture(t);
  const personal = join(tmp, "caller-hooks");
  set(personal, "pre-commit", "#!/bin/sh\nexit 86\n");
  chmodSync(join(personal, "pre-commit"), 0o755);
  const forwarded = pass(
    command(
      cwd,
      "git",
      [
        "-c",
        "core.hooksPath=" + personal,
        "-c",
        "fixture.marker=preserved",
        "-c",
        "alias.fixture-parameters=!node -p process.env.GIT_CONFIG_PARAMETERS",
        "fixture-parameters",
      ],
      { env: { GIT_CONFIG_PARAMETERS: "" } },
    ),
  ).trimEnd();
  const options = { env: { GIT_CONFIG_PARAMETERS: forwarded } };
  assert.equal(
    pass(
      command(cwd, "git", ["config", "--get", "fixture.marker"], options),
    ).trimEnd(),
    "preserved",
  );
  pass(command(cwd, "git", ["add", "."], options));
  commitFixture(cwd, options);
  assert.equal(
    pass(
      command(cwd, "git", ["config", "--get", "core.hooksPath"], options),
    ).trimEnd(),
    emptyHooks,
  );
});

test("malformed JSON never discloses configuration excerpts in diagnostics", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = registries.claude;
  const contents = '{"env": {"X": PRIVATEKEY}}\r\n';
  set(cwd, key, contents);
  for (const args of [["check"], ["sync"], ["session-start", "claude"]]) {
    const result = run(cwd, ...args);
    const diagnostic =
      args[0] === "session-start"
        ? JSON.parse(pass(result)).hookSpecificOutput.additionalContext
        : result.text;
    if (args[0] !== "session-start") assert.notEqual(result.status, 0);
    assert.doesNotMatch(diagnostic, /PRIVATE/);
    assert.match(
      diagnostic,
      /FAIL[\s\S]*\.claude\/settings\.json.*invalid JSON/,
    );
    assert.equal(get(cwd, key), contents);
  }
});

test("regular-looking skill files with Git symlink mode fail on portable checkouts", (t) => {
  const { cwd } = fixture(t);
  pass(command(cwd, "git", ["config", "core.symlinks", "false"]));
  const suffix = "skills/review-branch/link.txt";
  const value = "relative-target";
  set(cwd, "harness/" + suffix, value);
  pass(run(cwd, "sync"));
  pass(run(cwd, "check"));
  const oid = pass(
    command(cwd, "git", ["hash-object", "-w", "--stdin"], { input: value }),
  ).trimEnd();
  for (const [prefix, host] of [
    [".claude/", "claude"],
    [".agents/", "codex"],
    ["harness/", "antigravity"],
  ]) {
    const key = prefix + suffix;
    pass(
      command(cwd, "git", [
        "update-index",
        "--add",
        "--cacheinfo",
        "120000," + oid + "," + key,
      ]),
    );
    pass(command(cwd, "git", ["checkout-index", "--force", "--", key]));
    assert.ok(lstatSync(join(cwd, key)).isFile());
    if (prefix === ".claude/") pass(run(cwd, "check", "--host", "codex"));
    for (const args of [["check", "--host", host], ["sync"]]) {
      const result = run(cwd, ...args);
      fail(result, /120000/);
      assert.ok(result.text.includes(key), result.text);
    }
    assert.equal(get(cwd, key), value);
    pass(
      command(cwd, "git", [
        "update-index",
        "--cacheinfo",
        "100644," + oid + "," + key,
      ]),
    );
  }
});

function startupHandler(settings, host) {
  return host === "antigravity"
    ? settings["harness-doctor"].SessionStart[0]
    : settings.hooks.SessionStart[0].hooks[0];
}

test("a prior committed hook policy can migrate without erasing a local handler", (t) => {
  const { cwd } = fixture(t);
  putJson(cwd, registries.claude, { enabledPlugins: { typescript: true } });
  pass(run(cwd, "sync"));
  pass(command(cwd, "git", ["add", "."]));
  commitFixture(cwd);
  for (const host of hosts) {
    const source = "harness/hooks/" + host + ".json";
    const policy = JSON.parse(get(cwd, source));
    startupHandler(policy, host).timeout = 30;
    putJson(cwd, source, policy);
    pass(command(cwd, "git", ["add", source]));
    const key = registries[host];
    const previous = get(cwd, key);
    const custom = JSON.parse(previous);
    startupHandler(custom, host).timeout = 99;
    putJson(cwd, key, custom);
    const saved = get(cwd, key);
    fail(run(cwd, "sync"), /unregistered/);
    assert.equal(get(cwd, key), saved);
    set(cwd, key, previous);
    fail(run(cwd, "check", "--host", host), /differs from its source/);
    pass(run(cwd, "sync"));
    assert.equal(startupHandler(JSON.parse(get(cwd, key)), host).timeout, 30);
  }
  assert.deepEqual(JSON.parse(get(cwd, registries.claude)).enabledPlugins, {
    typescript: true,
  });
  pass(run(cwd, "check"));
});

test("array-like objects cannot register canonical hook groups or handlers", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  function arrayLike(array) {
    return { ...array, length: array.length };
  }
  for (const [host, event, handlers] of [
    ["claude", "SessionStart", false],
    ["claude", "SessionStart", true],
    ["codex", "PreToolUse", false],
    ["codex", "PreToolUse", true],
    ["antigravity", "SessionStart", false],
    ["claude", "Stop", true],
    ["antigravity", "Stop", false],
  ]) {
    const source = "harness/hooks/" + host + ".json";
    const good = get(cwd, source);
    const policy = JSON.parse(good);
    const events =
      host === "antigravity" ? policy["harness-doctor"] : policy.hooks;
    if (event === "Stop") events.Stop = structuredClone(events.SessionStart);
    if (handlers) events[event][0].hooks = arrayLike(events[event][0].hooks);
    else events[event] = arrayLike(events[event]);
    putJson(cwd, source, policy);
    const dest = registries[host];
    rmSync(join(cwd, dest));
    for (const args of [["check", "--host", host], ["sync"]]) {
      const result = run(cwd, ...args);
      fail(result, /harness\/hooks\//);
      assert.ok(result.text.includes(source), result.text);
    }
    assert.equal(existsSync(join(cwd, dest)), false);
    set(cwd, source, good);
    pass(run(cwd, "sync"));
  }
});

test(
  "a worktree with a trailing space retains its identity beside another checkout",
  { skip: process.platform === "win32" },
  (t) => {
    const { cwd, tmp } = fixture(t);
    pass(run(cwd, "sync"));
    pass(command(cwd, "git", ["add", "."]));
    commitFixture(cwd);
    const spaced = join(tmp, "base ");
    pass(command(tmp, "git", ["clone", "-q", cwd, spaced]));
    const key = ".codex/agents/reviewer.toml";
    const good = get(cwd, key);
    set(cwd, key, "sibling drift\n");
    const diagnostic = pass(run(spaced, "check"));
    assert.ok(diagnostic.includes(realpathSync.native(spaced)), diagnostic);
    set(spaced, key, "target drift\n");
    pass(run(spaced, "sync"));
    assert.equal(get(spaced, key), good);
    assert.equal(get(cwd, key), "sibling drift\n");
  },
);

test("a clean clone discovers all three host configurations from subdirectories and linked worktrees", (t) => {
  const { tmp, cwd } = fixture(t);
  set(cwd, ".codex/config.toml", "[features]\nhooks = true\n");
  pass(run(cwd, "sync"));
  pass(command(cwd, "git", ["add", "."]));
  commitFixture(cwd);
  const clone = join(tmp, "clone"),
    linked = join(tmp, "linked");
  pass(command(tmp, "git", ["clone", "-q", cwd, clone]));
  assert.equal(existsSync(join(clone, "node_modules")), false);
  pass(command(clone, "git", ["worktree", "add", "--detach", linked, "HEAD"]));
  for (const host of hosts) {
    const entry = JSON.parse(get(linked, registries[host]));
    const native =
      host === "antigravity"
        ? entry["harness-doctor"].SessionStart[0]
        : entry.hooks.SessionStart[0].hooks[0];
    if (host === "claude" || host === "codex") {
      const matcher = new RegExp(
        "^(?:" + entry.hooks.SessionStart[0].matcher + ")$",
      );
      for (const reason of ["startup", "clear", "fork"])
        assert.ok(
          matcher.test(reason),
          host + " SessionStart must cover " + reason,
        );
    }
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

test("Codex project settings cannot disable or duplicate registered hooks", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = ".codex/config.toml";
  for (const [settings, diagnostic] of [
    ["[features]\nhooks = false # disabled", /disables project hooks/],
    ["features.codex_hooks = false", /disables project hooks/],
    ['features = { "hooks" = false }', /disables project hooks/],
    [
      '[[hooks.SessionStart]]\nmatcher = "startup"\n[[hooks.SessionStart.hooks]]\ntype = "command"\ncommand = "private"',
      /unregistered.*hooks.SessionStart/,
    ],
    [
      '[hooks]\nStop = [{ hooks = [{ type = "command", command = "private" }] }]',
      /unregistered.*hooks.Stop/,
    ],
    [
      'hooks = { PreToolUse = [{ hooks = [{ type = "command", command = "private" }] }] }',
      /unregistered.*hooks.PreToolUse/,
    ],
  ]) {
    set(cwd, key, settings);
    fail(run(cwd, "check", "--host", "codex"), diagnostic);
    fail(run(cwd, "sync"), diagnostic);
    assert.equal(get(cwd, key), settings);
  }
  set(cwd, key, "[features]\nhooks = true\n[hooks]\nStop = []\n");
  pass(run(cwd, "check", "--host", "codex"));
  set(
    cwd,
    key,
    'developer_instructions = """\n[features]\nhooks = false\n[[hooks.SessionStart]]\n"""',
  );
  pass(run(cwd, "check", "--host", "codex"));
  const policy = JSON.parse(get(cwd, "harness/hooks/codex.json"));
  policy.hooks.SessionStart[0].matcher = "startup|fork";
  putJson(cwd, "harness/hooks/codex.json", policy);
  putJson(cwd, registries.codex, policy);
  fail(run(cwd, "check"), /harness\/hooks\/codex.json/);
});

function preservesConflict(cwd, host, key, content, pattern) {
  const original = Buffer.isBuffer(content)
    ? content
    : Buffer.from(content.replaceAll("\n", "\r\n") + "\r\n");
  set(cwd, key, original);
  fail(run(cwd, "check", "--host", host), pattern);
  const envelope = JSON.parse(pass(run(cwd, "session-start", host)));
  const receipt =
    host === "antigravity"
      ? envelope.injectSteps[0].systemMessage.systemMessage
      : envelope.hookSpecificOutput.additionalContext;
  assert.match(receipt, /harness-doctor: FAIL/);
  assert.match(receipt, pattern);
  fail(run(cwd, "sync"), pattern);
  assert.deepEqual(readFileSync(join(cwd, key)), original);
}

test("malformed Codex project declarations fail without changing their bytes", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = ".codex/config.toml";
  for (const broken of [
    "[agents.reviewer",
    "agents = { reviewer = {",
    "features = [true}",
    "features = false]",
    'developer_instructions = "unterminated',
    "notes = '''truncated multiline\n[features]",
    "[features]\nhooks",
    "[features]\nhooks = # a missing value",
    "features = { hooks false }",
    "features..hooks = true",
    "features = = true",
    "features.hooks = true = false",
    "features = { hooks = false } trailing",
    'model = "developer" trailing',
    "example = 2023-02-29",
    Buffer.from("example = 2024-01-01T00:00:00+0000"),
    "[[a.b.c]]\n[a.b]\n[a]\nb.extra = 1",
  ])
    preservesConflict(
      cwd,
      "codex",
      key,
      broken,
      /\.codex\/config\.toml.*invalid TOML/,
    );

  const valid = [
    'notes = """[unbalanced } and "\\\"" inside a multiline string',
    "# still in the string",
    'with a final quoted word: "text""""',
    "literal = '''[brackets} and ends with a quote''''",
    'labels = [ "comma, braces} and bracket]", # ] is a comment',
    "  { name = 'a.b', values = [1, 2] },",
    "]",
    '["projects"."a.b #{[]"]',
    '"" = "quoted empty key"',
    "value = 1979-05-27 07:32:00Z",
    "leap = 2024-02-29",
    "offset = 2024-01-01T00:00:00+00:00",
    "[[a.b.c]]",
    "[a.b]",
    "extra = 1",
    "[a]",
    "other.extra = 1",
    "[features]",
    "hooks = true",
  ].join("\n");
  set(cwd, key, valid);
  pass(run(cwd, "check", "--host", "codex"));
  pass(run(cwd, "sync"));
  assert.equal(get(cwd, key), valid);
});

test("Codex rejects invalid TOML values and duplicate declarations before syncing any file", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = ".codex/config.toml";
  for (const input of [
    "[features]\nhooks = flase",
    'allowed_permissions = ["one" "two"]',
    'model = "mis\\qprint"',
    "[features]\nhooks = true\nhooks = false",
    Buffer.concat([
      Buffer.from('model = "'),
      Buffer.from([0xff]),
      Buffer.from('"\r\n'),
    ]),
  ]) {
    preservesConflict(
      cwd,
      "codex",
      key,
      input,
      /\.codex\/config\.toml.*invalid TOML/,
    );
  }
  set(cwd, key, 'private_option = "keep-this-private"\nmodel = "bad\\q"\n');
  const failure = run(cwd, "check", "--host", "codex");
  fail(failure, /invalid TOML at line 2, column \d+/);
  assert.doesNotMatch(failure.text, /keep-this-private/);
  const receipt = JSON.parse(pass(run(cwd, "session-start", "codex")))
    .hookSpecificOutput.additionalContext;
  assert.match(receipt, /invalid TOML at line 2/);
  assert.doesNotMatch(receipt, /keep-this-private/);
});

test("Codex preserves unknown top-level fields in its dedicated hook registry and reports the conflict", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = registries.codex;
  const managed = JSON.parse(get(cwd, key));
  for (const [field, value] of [
    ["disableAllHooks", true],
    ["SessionStart", [{ type: "command", command: "private" }]],
    ["extra", "private Ω"],
  ]) {
    const settings = field === "extra" ? {} : managed;
    preservesConflict(
      cwd,
      "codex",
      key,
      JSON.stringify({ ...settings, [field]: value }, null, 4),
      new RegExp("unregistered.*" + field),
    );
  }
  putJson(cwd, key, {});
  pass(run(cwd, "sync"));
  assert.deepEqual(JSON.parse(get(cwd, key)), managed);
});

test("Codex registrations cannot substitute or widen any role owned by the manifest", (t) => {
  const { cwd } = fixture(t);
  const source = "harness/manifest.json";
  const manifest = JSON.parse(get(cwd, source));
  manifest.agents.push({ ...manifest.agents[0], name: "audit-team" });
  set(
    cwd,
    "harness/agents/audit-team.md",
    get(cwd, "harness/agents/reviewer.md"),
  );
  putJson(cwd, source, manifest);
  pass(run(cwd, "sync"));
  const key = ".codex/config.toml";
  for (const [role, settings] of [
    ["reviewer", '[agents.reviewer]\nconfig_file = "./private.toml"'],
    ["issue-triage", '[agents."issue-triage".features]\nshell_tool = true'],
    [
      "audit-team",
      '"agents".\'audit-team\'.developer_instructions = "replacement"',
    ],
    [
      "reviewer",
      "agents = { reviewer = { features = { shell_tool = true } } }",
    ],
    [
      "reviewer",
      '[agents]\n"revi\\u0065wer" = { config_file = "private.toml" }',
    ],
  ]) {
    preservesConflict(
      cwd,
      "codex",
      key,
      settings,
      new RegExp("managed role " + role),
    );
  }
  const independent =
    '[agents.personal]\nconfig_file = "personal.toml"\nmodel = "private"\n[agents.personal.features]\nshell_tool = true\n';
  set(cwd, key, independent);
  pass(run(cwd, "check", "--host", "codex"));
  pass(run(cwd, "sync"));
  assert.equal(get(cwd, key), independent);
});

test("Codex diagnoses explicit subagent disablement with native V2 precedence", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = ".codex/config.toml";
  for (const disabled of [
    "[features]\nmulti_agent = false",
    "agents.enabled = false",
    "features = { multi_agent = false, multi_agent_v2 = { enabled = false } }",
  ]) {
    preservesConflict(
      cwd,
      "codex",
      key,
      disabled,
      /\.codex\/config\.toml disables required subagents/,
    );
  }
  for (const enabled of [
    "features.multi_agent = true",
    "features.multi_agent_v2 = false",
    "[features]\nmulti_agent = false\nmulti_agent_v2 = true",
    "[agents]\nenabled = false\n[features.multi_agent_v2]\nenabled = true",
  ]) {
    set(cwd, key, enabled);
    pass(run(cwd, "check", "--host", "codex"));
    assert.equal(get(cwd, key), enabled);
  }
});

test("Claude guards child-only model and effort switches while preserving shared session settings", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = registries.claude;
  const managed = JSON.parse(get(cwd, key));
  for (const [setting, value] of [
    ["CLAUDE_CODE_SUBAGENT_MODEL_FORCE", "Yes"],
    ["CLAUDE_CODE_SUBAGENT_EFFORT", "low"],
  ]) {
    preservesConflict(
      cwd,
      "claude",
      key,
      JSON.stringify({ ...managed, env: { [setting]: value } }, null, 4),
      new RegExp(setting),
    );
  }
  const shared = {
    ...managed,
    model: "developer-model",
    effortLevel: "high",
    maxEffortLevel: "high",
    env: {
      CLAUDE_CODE_EFFORT_LEVEL: "high",
      CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "off",
    },
  };
  putJson(cwd, key, shared);
  const before = get(cwd, key);
  pass(run(cwd, "check", "--host", "claude"));
  pass(run(cwd, "sync"));
  assert.equal(get(cwd, key), before);
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
  pass(run(cwd, "sync"));
  for (const rule of JSON.parse(get(cwd, "harness/manifest.json")).rules) {
    const native = get(cwd, ".agents/rules/" + rule.name + ".md");
    const glob = JSON.parse(/^globs: (.+)$/m.exec(native)[1]);
    assert.deepEqual(glob.split(","), rule.paths);
  }
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
  assert.equal(pass(run(cwd, "rules", "examples/nested/src/app/page.ts")), "");
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

test("missing tracked Claude settings recover independent settings from this worktree's index", (t) => {
  const { cwd } = fixture(t);
  const key = registries.claude;
  const staged = {
    enabledPlugins: { "typescript-lsp@claude-plugins-official": true },
    permissions: { deny: ["private"] },
    env: { LOCAL_PROJECT_OPTION: "staged" },
  };
  putJson(cwd, key, staged);
  pass(command(cwd, "git", ["add", "--", key]));
  rmSync(join(cwd, key));
  fail(run(cwd, "check"), /\.claude\/settings.json is missing/);
  assert.ok(!existsSync(join(cwd, key)));
  pass(run(cwd, "sync"));
  const policy = JSON.parse(get(cwd, "harness/hooks/claude.json"));
  assert.deepEqual(JSON.parse(get(cwd, key)), {
    ...staged,
    hooks: policy.hooks,
  });
  assert.deepEqual(
    JSON.parse(pass(command(cwd, "git", ["show", ":" + key]))),
    staged,
  );
  pass(run(cwd, "check"));
});

test("a staged deletion recovers Claude settings from HEAD and preserves both the index and unknown hooks", (t) => {
  const { cwd } = fixture(t);
  const key = registries.claude;
  pass(run(cwd, "sync"));
  const settings = {
    ...JSON.parse(get(cwd, key)),
    enabledPlugins: { "typescript-lsp@claude-plugins-official": true },
    permissions: { deny: ["private"] },
  };
  for (const custom of [false, true]) {
    if (custom)
      settings.hooks.Stop = [
        { hooks: [{ type: "command", command: "private" }] },
      ];
    putJson(cwd, key, settings);
    pass(command(cwd, "git", ["add", "--", key]));
    commitFixture(cwd);
    pass(command(cwd, "git", ["rm", "--", key]));
    const staged = () =>
      pass(
        command(cwd, "git", ["diff", "--cached", "--name-status", "--", key]),
      );
    const before = staged();
    assert.match(before, /^D\s+\.claude\/settings.json/);
    if (custom) {
      fail(run(cwd, "sync"), /unregistered Stop/);
      assert.ok(!existsSync(join(cwd, key)));
    } else {
      fail(run(cwd, "check"), /\.claude\/settings.json is missing/);
      pass(run(cwd, "sync"));
      assert.deepEqual(JSON.parse(get(cwd, key)), settings);
      pass(run(cwd, "check"));
    }
    assert.equal(staged(), before);
  }
});

test("disabling Claude hooks is a read-only diagnostic in check, sync and startup", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const key = registries.claude;
  putJson(cwd, key, { ...JSON.parse(get(cwd, key)), disableAllHooks: true });
  const original = get(cwd, key);
  for (const action of ["check", "sync"])
    fail(run(cwd, action), /\.claude\/settings.json.*disableAllHooks/);
  const receipt = JSON.parse(pass(run(cwd, "session-start", "claude")));
  assert.match(
    receipt.hookSpecificOutput.additionalContext,
    /FAIL[\s\S]*disableAllHooks/,
  );
  assert.equal(get(cwd, key), original);
});

test("the canonical Claude startup hook always delivers context synchronously on clear", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const source = "harness/hooks/claude.json";
  const baseline = get(cwd, source);
  for (const option of ["async", "asyncRewake", "missing-clear"]) {
    const policy = JSON.parse(baseline);
    const group = policy.hooks.SessionStart[0];
    if (option === "missing-clear") group.matcher = "startup|fork";
    else group.hooks[0][option] = true;
    putJson(cwd, source, policy);
    putJson(cwd, registries.claude, policy);
    fail(run(cwd, "check"), /harness\/hooks\/claude\.json/);
  }
});

test("Antigravity validates the enabled flag on required and optional named hooks", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const host = "antigravity";
  const source = "harness/hooks/antigravity.json";
  const base = JSON.parse(get(cwd, source));
  for (const [name, enabled] of [
    ["harness-doctor", "false"],
    ["harness-doctor", null],
    ["harness-doctor", false],
    ["optional", 0],
  ]) {
    const policy = structuredClone(base);
    policy[name] = { ...policy["harness-doctor"], enabled };
    putJson(cwd, registries[host], policy);
    const original = get(cwd, registries[host]);
    preservesConflict(
      cwd,
      host,
      source,
      JSON.stringify(policy),
      /harness\/hooks\/antigravity\.json/,
    );
    assert.equal(get(cwd, registries[host]), original);
  }
  for (const enabled of [true, false]) {
    const policy = structuredClone(base);
    policy["harness-doctor"].enabled = true;
    policy.optional = { enabled, Stop: [] };
    putJson(cwd, source, policy);
    putJson(cwd, registries[host], policy);
    pass(run(cwd, "check", "--host", host));
  }
});

test("required Codex handlers use the synchronous portable command on Windows and other hosts", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const source = "harness/hooks/codex.json";
  const base = JSON.parse(get(cwd, source));
  for (const event of ["SessionStart", "PreToolUse"]) {
    for (const override of [
      { async: true },
      { async: "false" },
      { async: null },
      { commandWindows: "echo private-command" },
      { command_windows: "echo private-command" },
      { commandWindows: "" },
      { commandWindows: "same", command_windows: "same" },
    ]) {
      const policy = structuredClone(base);
      const handler = policy.hooks[event][0].hooks[0];
      for (const [field, value] of Object.entries(override))
        handler[field] = value === "same" ? handler.command : value;
      putJson(cwd, registries.codex, policy);
      const original = get(cwd, registries.codex);
      preservesConflict(
        cwd,
        "codex",
        source,
        JSON.stringify(policy),
        new RegExp("harness/hooks/codex\\.json.*" + event),
      );
      assert.equal(get(cwd, registries.codex), original);
    }
    for (const windows of [
      {},
      { commandWindows: null },
      { commandWindows: "same" },
      { command_windows: "same" },
    ]) {
      const policy = structuredClone(base);
      const handler = policy.hooks[event][0].hooks[0];
      handler.async = false;
      for (const [field, value] of Object.entries(windows))
        handler[field] = value === "same" ? handler.command : value;
      putJson(cwd, source, policy);
      putJson(cwd, registries.codex, policy);
      pass(run(cwd, "check", "--host", "codex"));
    }
  }
});

test("all registered Codex command handlers preserve the native registry and integer tokens", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const source = "harness/hooks/codex.json";
  const base = JSON.parse(get(cwd, source));
  const optional = { type: "command", command: "echo progress" };
  function policyWith(handler) {
    const policy = structuredClone(base);
    policy.hooks.UserPromptSubmit = [{ matcher: null, hooks: [handler] }];
    return policy;
  }
  for (const [overrides, field] of [
    [{ command: false }, "command"],
    [{ command: " " }, "command"],
    [{ async: "false" }, "async"],
    [{ command_windows: false }, "command"],
    [{ commandWindows: " ", command_windows: null }, "command"],
    [{ timeout: -1 }, "timeout"],
    [{ timeout: JSON.rawJSON("1.0") }, "timeout"],
    [{ timeout: JSON.rawJSON("1e0") }, "timeout"],
    [{ timeout: JSON.rawJSON("18446744073709551616") }, "timeout"],
    [{ timeout: JSON.rawJSON("9223372036854775808") }, "timeout"],
    [{ additionalContextLimit: false }, "additionalContextLimit"],
    [{ additionalContextLimit: 2.5 }, "additionalContextLimit"],
    [
      { additionalContextLimit: JSON.rawJSON("9223372036854775808") },
      "additionalContextLimit",
    ],
    [{ statusMessage: false }, "statusMessage"],
  ]) {
    const policy = policyWith({ ...optional, ...overrides });
    putJson(cwd, registries.codex, policy);
    const original = get(cwd, registries.codex);
    preservesConflict(
      cwd,
      "codex",
      source,
      JSON.stringify(policy),
      new RegExp("harness/hooks/codex\\.json.*UserPromptSubmit.*" + field, "i"),
    );
    assert.equal(get(cwd, registries.codex), original);
  }
  const projected = policyWith({
    ...optional,
    async: true,
    command_windows: "echo Windows",
    statusMessage: "Working",
    timeout: JSON.rawJSON("9007199254740993"),
    additionalContextLimit: JSON.rawJSON("9223372036854775807"),
  });
  for (const event of ["SessionEnd", "Interrupt"])
    projected.hooks[event] = [
      {
        hooks: [
          {
            ...optional,
            timeout: JSON.rawJSON("18446744073709551615"),
            additionalContextLimit: JSON.rawJSON("18446744073709551615"),
          },
        ],
      },
    ];
  projected.hooks.UserPromptSubmit[0].hooks.push({
    ...optional,
    commandWindows: null,
    timeout: null,
    statusMessage: null,
    additionalContextLimit: null,
  });
  projected.hooks.SessionStart[0].hooks.unshift({
    ...optional,
    async: true,
    commandWindows: "echo Windows",
  });
  projected.hooks.PreToolUse.push({
    matcher: "Read",
    hooks: [{ ...optional, async: true }],
  });
  putJson(cwd, source, projected);
  rmSync(join(cwd, registries.codex));
  pass(run(cwd, "sync"));
  assert.equal(get(cwd, registries.codex), get(cwd, source));
  pass(run(cwd, "check", "--host", "codex"));
  pass(run(cwd, "sync"));
  assert.equal(get(cwd, registries.codex), get(cwd, source));
});

test("the complete Codex handler registry rejects invalid tagged variants and preserves native defaults", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const source = "harness/hooks/codex.json";
  const dest = registries.codex;
  const base = JSON.parse(get(cwd, source));
  const tool = { type: "mcp_tool", server: "workspace", tool: "status" };
  function withGroups(groups) {
    return { ...base, hooks: { ...base.hooks, UserPromptSubmit: groups } };
  }
  for (const [handler, diagnostic] of [
    [{}, /\.type/],
    [{ type: 8 }, /\.type/],
    [{ type: "unrecognized" }, /\.type/],
    [{ type: "mcp_tool", tool: "status" }, /\.server/],
    [{ ...tool, tool: false }, /\.tool/],
    [{ ...tool, input: null }, /\.input/],
    [{ ...tool, input: [] }, /\.input/],
    [{ ...tool, input: { nested: [{ value: null }] } }, /\.input/],
    [{ ...tool, timeout: 1.5 }, /\.timeout/],
    [{ ...tool, statusMessage: false }, /\.statusMessage/],
    [["prompt", "unexpected"], /too many positional/],
  ]) {
    const raw = JSON.stringify(withGroups([{ hooks: [handler] }]));
    set(cwd, dest, raw);
    preservesConflict(cwd, "codex", source, raw, diagnostic);
    assert.equal(get(cwd, dest), raw);
  }
  for (const [groups, diagnostic] of [
    [null, /array.*groups/],
    [[{ hooks: null }], /\.hooks must be an array/],
    [[{ matcher: 0, hooks: [] }], /\.matcher/],
    [[[null, [], false]], /too many positional/],
  ]) {
    const raw = JSON.stringify(withGroups(groups));
    preservesConflict(cwd, "codex", source, raw, diagnostic);
  }
  const valid = withGroups([
    {},
    {
      matcher: null,
      hooks: [
        {
          ...tool,
          input: {
            id: JSON.rawJSON("9007199254740993"),
            upper: JSON.rawJSON("18446744073709551615"),
            mixed: [true, 'quoted "key":', 1.25, {}],
          },
          timeout: 0,
          statusMessage: null,
          async: "ignored by MCP",
        },
        { ...tool, server: "", input: {} },
        { type: "prompt", prompt: 0 },
        { type: "agent", command: false },
      ],
    },
  ]);
  valid.description = "Project hooks";
  valid.hooks.UserPromptSubmit.push([
    null,
    [
      ["mcp_tool", "workspace", "status", {}],
      ["command", "echo portable", "echo Windows", 30, true, "status", 3],
      ["agent"],
    ],
  ]);
  valid.hooks.FutureEvent = { arbitrary: [{ type: "unknown" }] };
  putJson(cwd, source, valid);
  rmSync(join(cwd, dest));
  pass(run(cwd, "sync"));
  const projected = get(cwd, dest);
  assert.equal(projected, get(cwd, source));
  pass(run(cwd, "check"));
  const validText = JSON.stringify(valid);
  for (const [needle, replacement, diagnostic] of [
    ['"hooks":{', '"hooks":{},"hooks":{', /repeats.*hooks/],
    [
      '"SessionStart":[',
      '"SessionStart":[],"SessionStart":[',
      /repeats.*SessionStart/,
    ],
    ['"matcher":null', '"matcher":"x","matcher":null', /repeats.*matcher/],
    [
      '"type":"mcp_tool"',
      '"type":"mcp_tool","t\\u0079pe":"mcp_tool"',
      /repeats.*type/,
    ],
    ['"tool":"status"', '"tool":"previous","tool":"status"', /repeats.*tool/],
    ['"command":', '"command":"previous","command":', /repeats.*command/],
  ]) {
    const bad = validText.replace(needle, replacement);
    assert.notEqual(bad, validText);
    preservesConflict(cwd, "codex", dest, bad, diagnostic);
    assert.equal(get(cwd, source), projected);
  }
  // Duplicate unknown fields and map entries use their native last value.
  set(
    cwd,
    dest,
    validText
      .replace('"tool":"status"', '"meta":1,"meta":2,"tool":"status"')
      .replace('"mixed":[', '"mixed":null,"mixed":['),
  );
  set(
    cwd,
    source,
    validText.replace('"tool":"status"', '"meta":2,"tool":"status"'),
  );
  pass(run(cwd, "check"));
  const incomplete = structuredClone(base);
  delete incomplete.hooks.PreToolUse[0].hooks;
  putJson(cwd, source, base);
  putJson(cwd, dest, incomplete);
  pass(run(cwd, "sync"));
  assert.deepEqual(JSON.parse(get(cwd, dest)), base);
  const positional = structuredClone(base);
  for (const event of ["SessionStart", "PreToolUse"]) {
    const { matcher, hooks } = base.hooks[event][0];
    positional.hooks[event] = [[matcher, [["command", hooks[0].command]]]];
  }
  putJson(cwd, source, positional);
  pass(run(cwd, "sync"));
  assert.deepEqual(JSON.parse(get(cwd, dest)), positional);
  pass(run(cwd, "check"));
});

test("reuse of a recognized command cannot erase an unregistered hook, group, field or duplicate", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  for (const host of hosts) {
    const key = registries[host];
    const original = get(cwd, key);
    for (const variation of [
      "event",
      "extraGroup",
      "handlerField",
      "duplicateHandler",
      "groupField",
    ]) {
      const settings = JSON.parse(original);
      const policy =
        host === "antigravity" ? settings["harness-doctor"] : settings.hooks;
      const group = policy.SessionStart[0];
      const handlers =
        host === "antigravity" ? policy.SessionStart : group.hooks;
      if (variation === "event") policy.Stop = [structuredClone(group)];
      if (variation === "extraGroup")
        policy.SessionStart.push({ ...group, matcher: "private" });
      if (variation === "handlerField") handlers[0].once = true;
      if (variation === "duplicateHandler")
        handlers.push(structuredClone(handlers[0]));
      if (variation === "groupField") group.extra = true;
      putJson(cwd, key, settings);
      const saved = get(cwd, key);
      fail(run(cwd, "sync"), /unregistered/);
      assert.equal(get(cwd, key), saved, host + " " + variation);
    }
    set(cwd, key, original);
  }
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

test("Codex denies mutating and shell tools only in the restricted roles", (t) => {
  const { cwd } = fixture(t);
  pass(run(cwd, "sync"));
  const guard = join(cwd, "harness/hooks/codex-readonly.mjs");
  function invoke(event) {
    return pass(
      command(cwd, process.execPath, [guard], {
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
  const manifest = JSON.parse(get(cwd, "harness/manifest.json"));
  manifest.agents = [];
  putJson(cwd, "harness/manifest.json", manifest);
  set(cwd, ".codex/agents/orphan-audit.toml", 'name = "orphan-audit"\n');
  rmSync(join(cwd, ".codex/agents/reviewer.toml"));
  for (const agent_type of ["orphan-audit", "issue-triage", "reviewer"]) {
    const refusal = JSON.parse(
      invoke({ agent_type, agent_id: "child", tool_name: "apply_patch" }),
    );
    assert.equal(
      refusal.hookSpecificOutput.permissionDecision,
      "deny",
      agent_type,
    );
    assert.equal(invoke({ agent_type, tool_name: "read_file" }), "");
  }
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
  const malformed = JSON.parse(
    pass(
      command(cwd, process.execPath, [guard], {
        input: '{"tool": PRIVATEKEY}',
      }),
    ),
  );
  assert.equal(malformed.hookSpecificOutput.permissionDecision, "deny");
  assert.doesNotMatch(
    malformed.hookSpecificOutput.permissionDecisionReason,
    /PRIVATE/,
  );
});
