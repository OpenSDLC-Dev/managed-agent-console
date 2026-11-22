// Runs before package installation. Only Git and the repository's Node runtime are required.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { isDeepStrictEqual } from "node:util";

const hosts = ["claude", "codex", "antigravity"];
const cli = "node scripts/harness-doctor.mjs";
const registries = {
  claude: ".claude/settings.json",
  codex: ".codex/hooks.json",
  antigravity: ".agents/hooks.json",
};
const registriesFor = {
  claude: [".claude/rules", ".claude/agents", ".claude/skills"],
  codex: [".codex/agents", ".agents/skills"],
  antigravity: [".agents/rules", ".agents/agents", ".agents/skills"],
};
const restrictedRoles = ["issue-triage", "reviewer"];

function git(cwd, args) {
  const env = { ...process.env };
  // Git also runs our CLI from aliases and worktrees. The invoking checkout's
  // index and object directory may be different from those of this cwd.
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_PREFIX",
  ])
    delete env[key];
  return execFileSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const stat = (file) => lstatSync(file, { throwIfNoEntry: false });
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function requireThat(valid, message) {
  if (!valid) throw new Error(message);
}
function inside(root, key) {
  let path = root;
  for (const part of key.split("/")) {
    requireThat(
      part && part !== "." && part !== ".." && !/[\\:\0]/.test(part),
      "Invalid repository path " + key,
    );
    path = join(path, part);
    requireThat(!stat(path)?.isSymbolicLink(), "Linked harness path " + key);
  }
  return path;
}
function read(root, key) {
  const path = inside(root, key);
  requireThat(
    stat(path)?.isFile(),
    key + " is missing or is not a regular file.",
  );
  return readFileSync(path);
}
function json(bytes, key) {
  try {
    const result = JSON.parse(bytes.toString());
    requireThat(object(result), "expected an object");
    return result;
  } catch (error) {
    throw new Error(key + ": " + error.message);
  }
}
function fields(value, keys, label) {
  requireThat(
    object(value) &&
      isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()),
    label + " must declare exactly " + keys.join(", "),
  );
}
function list(root, directory) {
  const path = inside(root, directory);
  if (!stat(path)) return [];
  requireThat(stat(path).isDirectory(), directory + " must be a directory.");
  return readdirSync(path).sort();
}
function* files(root, directory) {
  for (const name of list(root, directory)) {
    const key = directory + "/" + name;
    const entry = stat(inside(root, key));
    if (entry.isDirectory()) yield* files(root, key);
    else {
      requireThat(entry.isFile(), key + " must be a regular file.");
      yield key;
    }
  }
}
function catalog(root) {
  const manifest = json(
    read(root, "harness/manifest.json"),
    "harness/manifest.json",
  );
  fields(manifest, ["skills", "rules", "agents"], "harness/manifest.json");
  for (const kind of ["skills", "rules", "agents"]) {
    requireThat(
      Array.isArray(manifest[kind]) && manifest[kind].length,
      "harness/manifest.json needs " + kind,
    );
    const names = manifest[kind].map((item) =>
      kind === "skills" ? item : item?.name,
    );
    requireThat(
      names.every(
        (n) => typeof n === "string" && /^[a-z0-9][a-z0-9-]*$/.test(n),
      ),
      "Invalid name in harness/manifest.json " + kind,
    );
    const expected = names
      .map((n) => (kind === "skills" ? n : n + ".md"))
      .sort();
    requireThat(
      isDeepStrictEqual(expected, list(root, "harness/" + kind)),
      "harness/" +
        kind +
        " entries disagree with harness/manifest.json: expected " +
        expected.join(", "),
    );
  }
  requireThat(
    restrictedRoles.every((name) =>
      manifest.agents.some((role) => role.name === name),
    ),
    "harness/manifest.json must register issue-triage and reviewer.",
  );
  for (const role of manifest.agents) {
    fields(
      role,
      ["name", "description", "claudeTools", "antigravityTools"],
      "harness/manifest.json agent " + role.name,
    );
    requireThat(
      typeof role.description === "string" && role.description.trim(),
      "Missing description for " + role.name,
    );
    requireThat(
      isDeepStrictEqual(role.claudeTools, ["Read", "Grep", "Glob"]) &&
        isDeepStrictEqual(role.antigravityTools, ["read_file"]),
      "harness/manifest.json " +
        role.name +
        " requires file-read/search-only capabilities.",
    );
  }
  for (const rule of manifest.rules) {
    fields(rule, ["name", "paths"], "harness/manifest.json rule " + rule.name);
    requireThat(
      Array.isArray(rule.paths) &&
        rule.paths.length &&
        rule.paths.every(
          (p) =>
            typeof p === "string" &&
            /^[\w./*?-]+$/.test(p) &&
            !p.startsWith("/") &&
            !p.split("/").some((s) => !s || s === ".." || s === "."),
        ),
      "Invalid repository-relative glob for harness/rules/" + rule.name + ".md",
    );
  }
  return manifest;
}

function verifyLinks(root, key, text) {
  for (const match of text.matchAll(
    /\[[^\]\n]*\]\((?:<([^>\n]+)>|([^)\s]+))\)/g,
  )) {
    const target = (match[1] ?? match[2]).split("#")[0];
    if (!target || /^[a-z][\w+-]*:/i.test(target)) continue;
    const rel = posix
      .normalize(posix.join(posix.dirname(key), target))
      .replace(/\/$/, "");
    requireThat(
      stat(inside(root, rel)),
      key + " links to a missing path: " + target,
    );
  }
}
function body(root, key) {
  const text = read(root, key).toString().replaceAll("\r\n", "\n");
  requireThat(text.trim(), key + " is empty.");
  verifyLinks(root, key, text);
  return text;
}
function guide(root, index) {
  const text = body(root, "AGENTS.md");
  const lines = text.endsWith("\n")
    ? text.split("\n").length - 1
    : text.split("\n").length;
  requireThat(
    lines <= 200,
    "AGENTS.md has " + lines + " physical lines (maximum 200).",
  );
  for (const marker of [
    "<!-- BEGIN:nextjs-agent-rules -->",
    "<!-- END:nextjs-agent-rules -->",
  ]) {
    requireThat(
      text.split(marker).length === 2,
      "AGENTS.md requires exactly one " + marker,
    );
  }
  requireThat(
    /<!-- BEGIN:nextjs-agent-rules -->[\s\S]*?node_modules\/next\/dist\/docs\/[\s\S]*?<!-- END:nextjs-agent-rules -->/.test(
      text,
    ),
    "AGENTS.md must retain the Next.js instructions inside their managed block.",
  );
  requireThat(
    text.includes(cli + " check") &&
      text.includes(cli + " rules") &&
      text.includes("SessionStart"),
    "AGENTS.md must direct sessions to the doctor receipt, check and path rules.",
  );
  for (const key of [
    "CLAUDE.md",
    ".claude/CLAUDE.md",
    ".claude/AGENTS.md",
    "AGENTS.override.md",
    "GEMINI.md",
    ".agents/GEMINI.md",
    ".agents/AGENTS.md",
  ]) {
    requireThat(
      !stat(inside(root, key)),
      key + " shadows or duplicates AGENTS.md.",
    );
  }
  requireThat(
    !index.has("CLAUDE.local.md"),
    "CLAUDE.local.md must stay personal and untracked.",
  );
}

function indexModes(root) {
  const rows = git(root, [
    "ls-files",
    "--stage",
    "-z",
    "--",
    "harness/skills",
    ".agents/skills",
    ".claude/skills",
    "CLAUDE.local.md",
  ]);
  const modes = new Map();
  for (const row of rows.split("\0").filter(Boolean)) {
    const tab = row.indexOf("\t");
    modes.set(row.slice(tab + 1), row.slice(0, 6) === "100755");
  }
  return modes;
}
function executable(root, key, index) {
  return process.platform === "win32"
    ? !!index.get(key)
    : Boolean(stat(inside(root, key)).mode & 0o111);
}
const bytes = (text) => Buffer.from(text);
function expected(root, manifest, selected, index) {
  const outputs = new Map();
  const add = (key, data, mode = false) =>
    outputs.set(key, {
      data: Buffer.isBuffer(data) ? data : bytes(data),
      mode,
    });
  const q = JSON.stringify;
  for (const name of manifest.skills) {
    const prefix = "harness/skills/" + name + "/";
    const source = body(root, prefix + "SKILL.md");
    const front = /^---\n([\s\S]+?)\n---\n/.exec(source)?.[1] ?? "";
    const metadata = front.split("\n");
    requireThat(
      metadata.length === 2 &&
        metadata.includes("name: " + name) &&
        metadata.some((s) => /^description: \S/.test(s)),
      prefix +
        "SKILL.md must declare its name and description without client-specific model or effort overrides.",
    );
    for (const key of files(root, prefix.slice(0, -1))) {
      const content = read(root, key);
      const mode = executable(root, key, index);
      const suffix = key.slice("harness/".length);
      if (selected.includes("claude")) add(".claude/" + suffix, content, mode);
      if (selected.includes("codex") || selected.includes("antigravity"))
        add(".agents/" + suffix, content, mode);
    }
  }
  for (const { name, paths } of manifest.rules) {
    const text = body(root, "harness/rules/" + name + ".md");
    if (selected.includes("claude"))
      add(
        ".claude/rules/" + name + ".md",
        "---\npaths:\n" +
          paths.map((p) => "  - " + q(p)).join("\n") +
          "\n---\n\n" +
          text,
      );
    if (selected.includes("antigravity"))
      add(
        ".agents/rules/" + name + ".md",
        "---\ntrigger: glob\nglobs: " +
          q(paths.map((p) => (p.startsWith("**/") ? p : "**/" + p)).join(",")) +
          "\n---\n\n" +
          text,
      );
  }
  for (const {
    name,
    description,
    claudeTools,
    antigravityTools,
  } of manifest.agents) {
    const text = body(root, "harness/agents/" + name + ".md");
    requireThat(
      !text.startsWith("---\n"),
      "harness/agents/" + name + ".md must contain only the role body.",
    );
    const header =
      "---\nname: " + name + "\ndescription: " + q(description) + "\n";
    if (selected.includes("claude"))
      add(
        ".claude/agents/" + name + ".md",
        header +
          "tools: " +
          claudeTools.join(", ") +
          "\nmodel: inherit\n---\n\n" +
          text,
      );
    if (selected.includes("antigravity"))
      add(
        ".agents/agents/" + name + ".md",
        header +
          "tools: " +
          q(antigravityTools) +
          "\nmainAgent: false\nsubagent: true\nmodel: inherit\n---\n\n" +
          text,
      );
    if (selected.includes("codex"))
      add(
        ".codex/agents/" + name + ".toml",
        "name = " +
          q(name) +
          "\ndescription = " +
          q(description) +
          "\ndeveloper_instructions = " +
          q(text) +
          "\n\n[features]\nshell_tool = false\napps = false\nplugins = false\nrequest_permissions_tool = false\n",
      );
  }
  return outputs;
}

function hookCommand(task, alias) {
  return (
    'git -c "alias.console-' + alias + "=!node " + task + '" console-' + alias
  );
}
// A group or handler can only occupy one slot in the registered event. Missing
// registrations are generated again, while extra copies and custom fields survive.
function registeredSubset(actual, registered, matches) {
  const remaining = [...registered];
  return actual.every((entry) => {
    const index = remaining.findIndex((candidate) => matches(entry, candidate));
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}
function checkHookEvents(events, policy, key) {
  requireThat(object(events), key + " has malformed hook events.");
  for (const [event, groups] of Object.entries(events)) {
    const known = policy[event];
    const message =
      key +
      " contains an unregistered " +
      event +
      " group, handler or field. Review it before syncing.";
    requireThat(Object.hasOwn(policy, event), message);
    if (!Array.isArray(known)) {
      requireThat(isDeepStrictEqual(groups, known), message);
      continue;
    }
    requireThat(
      Array.isArray(groups),
      key + " has malformed " + event + " hooks.",
    );
    requireThat(
      registeredSubset(groups, known, (group, candidate) => {
        if (isDeepStrictEqual(group, candidate)) return true;
        if (!Array.isArray(group?.hooks) || !Array.isArray(candidate?.hooks))
          return false;
        const { hooks, ...metadata } = group;
        const { hooks: registered, ...expected } = candidate;
        // Only a sole registered group with an existing string matcher can
        // unambiguously own matcher drift (including an older project matcher).
        if (
          known.length === 1 &&
          typeof expected.matcher === "string" &&
          typeof metadata.matcher === "string"
        )
          metadata.matcher = expected.matcher;
        return (
          isDeepStrictEqual(metadata, expected) &&
          registeredSubset(hooks, registered, isDeepStrictEqual)
        );
      }),
      message,
    );
  }
}
function trackedClaudeSettings(root, key) {
  const staged = git(root, ["ls-files", "--stage", "--", key]).trimEnd();
  if (staged) {
    const entry = /^100(?:644|755) ([a-f0-9]+) 0\t[^\n]+$/.exec(staged);
    requireThat(
      entry,
      key + " has no regular, resolved entry in this worktree's Git index.",
    );
    return git(root, ["cat-file", "blob", entry[1]]);
  }
  // A staged deletion removes the index entry. Recover the committed settings
  // of this worktree without staging the replacement. An unborn HEAD has no deletions.
  const deleted = git(root, [
    "diff",
    "--cached",
    "--no-renames",
    "--diff-filter=D",
    "--name-only",
    "--",
    key,
  ]);
  if (!deleted.trim()) return undefined;
  const tree = git(root, ["ls-tree", "HEAD", "--", key]).trimEnd();
  const entry = /^100(?:644|755) blob ([a-f0-9]+)\t[^\n]+$/.exec(tree);
  requireThat(entry, key + " has no regular entry in this worktree's HEAD.");
  return git(root, ["cat-file", "blob", entry[1]]);
}
function registry(root, host) {
  const key = registries[host],
    source = "harness/hooks/" + host + ".json";
  const native = json(read(root, source), source);
  if (host !== "antigravity") fields(native, ["hooks"], source);
  const command = hookCommand(
    "scripts/harness-doctor.mjs session-start " + host,
    "doctor",
  );
  const start =
    host === "antigravity"
      ? native["harness-doctor"]?.SessionStart
      : native.hooks?.SessionStart;
  const handlers = host === "antigravity" ? start : start?.[0]?.hooks;
  requireThat(
    start?.length === 1 &&
      handlers?.length === 1 &&
      handlers[0].type === "command" &&
      handlers[0].command === command &&
      (host === "antigravity"
        ? native["harness-doctor"].enabled !== false
        : start[0].matcher === "startup|clear|fork"),
    source + " must register the new-session doctor for " + host,
  );
  if (host === "claude") {
    for (const field of ["async", "asyncRewake"])
      requireThat(
        !Object.hasOwn(handlers[0], field) || handlers[0][field] === false,
        source +
          " must deliver the SessionStart receipt synchronously. Remove " +
          field +
          ".",
      );
  }
  if (host === "codex") {
    const before = native.hooks?.PreToolUse;
    requireThat(
      before?.length === 1 &&
        before[0].matcher === ".*" &&
        before[0].hooks?.length === 1 &&
        before[0].hooks[0].type === "command" &&
        before[0].hooks[0].command ===
          hookCommand("harness/hooks/codex-readonly.mjs", "readonly"),
      source + " must register the read-only role guard for every tool.",
    );
    read(root, "harness/hooks/codex-readonly.mjs");
  }
  const path = inside(root, key);
  const previous = stat(path) ? read(root, key) : undefined;
  const baseline =
    previous ??
    (host === "claude" ? trackedClaudeSettings(root, key) : undefined);
  if (baseline === undefined) return { previous, next: native };
  const actual = json(baseline, key);
  if (host === "claude") {
    requireThat(
      actual.disableAllHooks !== true,
      key +
        " sets disableAllHooks to true. Enable project hooks before checking again.",
    );
    for (const setting of [
      "CLAUDE_CODE_SUBAGENT_MODEL",
      "CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL",
    ]) {
      requireThat(
        !actual.env?.[setting],
        key +
          " forces a subagent model with " +
          setting +
          ". Remove the override from the project settings.",
      );
    }
    // FORCE makes the effective subagent model (possibly set by the user's
    // environment) outrank the registered role's explicit model: inherit.
    requireThat(
      !/^(?:1|true|yes|on)$/i.test(
        actual.env?.CLAUDE_CODE_SUBAGENT_MODEL_FORCE,
      ),
      key +
        " enables CLAUDE_CODE_SUBAGENT_MODEL_FORCE. Remove the child model override.",
    );
    requireThat(
      !/^(?:low|medium|high|xhigh|max)$/i.test(
        actual.env?.CLAUDE_CODE_SUBAGENT_EFFORT,
      ),
      key +
        " sets CLAUDE_CODE_SUBAGENT_EFFORT ahead of the inherited session effort. Remove the child effort override.",
    );
  }
  if (host === "antigravity") {
    for (const [name, events] of Object.entries(actual)) {
      requireThat(
        Object.hasOwn(native, name),
        key +
          " contains an unregistered hook " +
          name +
          ". Review it before syncing.",
      );
      checkHookEvents(events, native[name], key);
    }
    return { previous, next: native };
  }
  if (Object.hasOwn(actual, "hooks"))
    checkHookEvents(actual.hooks, native.hooks, key);
  if (host === "codex") {
    for (const field of Object.keys(actual))
      requireThat(
        Object.hasOwn(native, field),
        key +
          " contains an unregistered top-level key " +
          JSON.stringify(field) +
          ". Review it before syncing.",
      );
    return { previous, next: native };
  }
  return { previous, next: { ...actual, hooks: native.hooks } };
}
function write(root, key, content, previous, mode) {
  const path = inside(root, key);
  mkdirSync(dirname(path), { recursive: true });
  const observed = stat(path);
  const current = observed ? read(root, key) : undefined;
  requireThat(
    isDeepStrictEqual(current, previous),
    key + " changed during sync. Run check again.",
  );
  const tmp = path + "." + randomUUID() + ".tmp";
  try {
    writeFileSync(tmp, content, {
      flag: "wx",
      mode: observed ? observed.mode & 0o777 : 0o666,
    });
    if (process.platform !== "win32") {
      const permissions = observed
        ? observed.mode & 0o777
        : stat(tmp).mode & 0o777;
      chmodSync(
        tmp,
        mode
          ? permissions | ((permissions & 0o444) >> 2)
          : permissions & ~0o111,
      );
    }
    renameSync(tmp, path);
  } finally {
    rmSync(tmp, { force: true });
  }
}
// Split TOML statements or inline-table entries after masking strings and comments.
// Nested arrays and tables can contain either separator.
function* tomlParts(text, separator) {
  let start = 0,
    depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    else if (char === separator && depth === 0) {
      yield text.slice(start, i).trim();
      start = i + 1;
    }
  }
  yield text.slice(start).trim();
}
// A quoted TOML key can name a manifest role using a Unicode escape. Mask
// punctuation as before so it cannot turn a single literal key into a dotted path.
function maskTomlToken(token) {
  if (token.startsWith("#")) return "";
  const value =
    token[0] === '"'
      ? token
          .slice(1, -1)
          .replace(
            /\\(?:u([\da-fA-F]{4})|U([\da-fA-F]{8})|x([\da-fA-F]{2})|.)/g,
            (_, short, long, byte) => {
              const code = parseInt(short ?? long ?? byte, 16);
              return code < 128 ? String.fromCharCode(code) : "\0";
            },
          )
      : token.slice(1, -1);
  return /^[\w-]+$/.test(value) ? JSON.stringify(value) : '"_"';
}
function checkCodexConfig(root, agents) {
  const key = ".codex/config.toml";
  if (!stat(inside(root, key))) return;
  // Preserve quoted simple keys. A comment or string containing a sample hook
  // or model setting cannot introduce a project-level declaration.
  const text = read(root, key)
    .toString()
    .replace(
      /"""(?:\\[\s\S]|"(?!"")|[^"\\])*"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'[^'\n]*'|#[^\n]*/g,
      maskTomlToken,
    );
  const managed = new Set(agents.map((agent) => agent.name));
  function checkOwner(path) {
    const [section, name] = path.split(".");
    requireThat(
      section !== "agents" || !managed.has(name),
      key +
        " overrides managed role " +
        name +
        " in " +
        path +
        ". Edit harness/agents/" +
        name +
        ".md or harness/manifest.json instead.",
    );
  }
  const inlineHook = (path) => /^hooks\.[A-Z][\w]*(?:\.|$)/.test(path);
  const conflict = (path) =>
    key +
    " contains an unregistered project hook in " +
    path +
    ". Review it before syncing.";
  function checkField(parent, statement) {
    const field = /^([\w.'"\s-]+?)\s*=\s*([\s\S]*)$/.exec(statement);
    if (!field) return;
    const leaf = field[1].replace(/['"\s]/g, "");
    const path = parent ? parent + "." + leaf : leaf;
    const value = field[2].trim();
    checkOwner(path);
    requireThat(!inlineHook(path) || /^\[\s*\]$/.test(value), conflict(path));
    requireThat(
      !/^features\.(?:codex_hooks|hooks)$/.test(path) || value !== "false",
      key +
        " disables project hooks with " +
        path +
        ". Enable hooks before checking again.",
    );
    requireThat(
      !/^agents\.(?:default_subagent_(?:model|reasoning_effort)|model|model_reasoning_effort)$/.test(
        path,
      ),
      key +
        " overrides model inheritance in " +
        path +
        ". Remove the project subagent override.",
    );
    if (
      /^(?:hooks|features|agents)(?:\.|$)/.test(path) &&
      value.startsWith("{") &&
      value.endsWith("}")
    )
      for (const entry of tomlParts(value.slice(1, -1), ","))
        checkField(path, entry);
  }
  let table = "";
  for (const line of tomlParts(text, "\n")) {
    const header = /^\[\[?\s*([\w.'"\s-]+?)\s*\]\]?$/.exec(line);
    if (header) {
      table = header[1].replace(/['"\s]/g, "");
      checkOwner(table);
      requireThat(!inlineHook(table), conflict(table));
    } else checkField(table, line);
  }
}
function inspect(root, selected, sync) {
  const manifest = catalog(root),
    index = indexModes(root);
  guide(root, index);
  if (selected.includes("codex")) checkCodexConfig(root, manifest.agents);
  const outputs = expected(root, manifest, selected, index);
  const conflicts = [],
    changes = [],
    indexChanges = [];
  for (const dir of new Set(selected.flatMap((host) => registriesFor[host]))) {
    for (const file of files(root, dir))
      if (!outputs.has(file))
        conflicts.push(
          file + " is unregistered. Review the file before syncing.",
        );
  }
  for (const host of selected) {
    const { previous, next } = registry(root, host);
    const key = registries[host];
    if (!previous || !isDeepStrictEqual(json(previous, key), next))
      changes.push({
        key,
        previous,
        data: bytes(JSON.stringify(next, null, 2) + "\n"),
        mode: false,
      });
  }
  for (const [key, { data, mode }] of outputs) {
    const path = inside(root, key);
    const previous = stat(path) ? read(root, key) : undefined;
    const modeChanged = previous && executable(root, key, index) !== mode;
    if (!data.equals(previous ?? Buffer.alloc(0)) || !previous || modeChanged)
      changes.push({ key, previous, data, mode });
    if (process.platform === "win32" && !!index.get(key) !== mode)
      indexChanges.push(
        key + " needs git add --chmod=" + (mode ? "+x" : "-x") + " -- " + key,
      );
  }
  requireThat(!conflicts.length, conflicts.join("\n"));
  if (sync) {
    for (const { key, previous, data, mode } of changes)
      write(root, key, data, previous, mode);
    // Do not stage user files. Windows exposes the executable bit through the index.
    requireThat(!indexChanges.length, indexChanges.join("\n"));
  } else
    requireThat(
      !changes.length && !indexChanges.length,
      changes
        .map(
          (c) =>
            c.key + (c.previous ? " differs from its source." : " is missing."),
        )
        .concat(indexChanges)
        .join("\n"),
    );
}
function parseHost(host) {
  requireThat(hosts.includes(host), "Expected a host: " + hosts.join(", "));
  return host;
}
// Windows may hand the child an 8.3 cwd while Git reports the long spelling.
// Resolve the existing prefix even when the requested file is only planned.
function rulePath(root, input) {
  const full = resolve(process.cwd(), input.replace(/[\\/]/g, sep));
  let parent = full;
  while (!stat(parent) && parent !== dirname(parent)) parent = dirname(parent);
  const path = resolve(realpathSync.native(parent), relative(parent, full));
  const key = relative(root, path).split(sep).join("/");
  requireThat(
    key && key !== ".." && !key.startsWith("../") && !isAbsolute(key),
    "Path outside the worktree: " + input,
  );
  return key;
}
function receipt(host, message) {
  if (host === "antigravity")
    return { injectSteps: [{ systemMessage: { systemMessage: message } }] };
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: message,
    },
  };
}
const [command = "check", ...args] = process.argv.slice(2);
let root;
try {
  root = realpathSync.native(
    git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim(),
  );
  if (command === "rules") {
    requireThat(args.length, "rules requires at least one repository path.");
    const paths = args.map((input) => rulePath(root, input));
    for (const rule of catalog(root).rules)
      if (
        rule.paths.some((glob) => paths.some((p) => posix.matchesGlob(p, glob)))
      ) {
        const key = "harness/rules/" + rule.name + ".md";
        console.log(key + "\n" + body(root, key).trimEnd() + "\n");
      }
  } else {
    let selected = hosts;
    if (command === "session-start" && args.length === 1)
      selected = [parseHost(args[0])];
    else if (command === "check" && args.length === 2 && args[0] === "--host")
      selected = [parseHost(args[1])];
    else
      requireThat(
        !args.length && (command === "sync" || command === "check"),
        "Usage: " +
          cli +
          " check [--host HOST] | sync | rules PATH... | session-start HOST",
      );
    inspect(root, selected, command === "sync");
    let message =
      "harness-doctor: OK (" + selected.join(", ") + "; " + root + ")";
    if (command === "session-start" && args[0] === "claude")
      message +=
        " Read the worktree's AGENTS.md if ancestor or local Claude instructions hid it.";
    console.log(
      command === "session-start"
        ? JSON.stringify(receipt(args[0], message))
        : message,
    );
  }
} catch (error) {
  const message =
    "harness-doctor: FAIL" +
    (root ? " (" + root + ")" : "") +
    "\n" +
    error.message +
    "\nCheck the source, then run " +
    cli +
    " sync and " +
    cli +
    " check.";
  // Startup diagnostics must reach the model using the host's success-channel
  // event envelope. check returns nonzero for the same drift in CI.
  if (
    command === "session-start" &&
    args.length === 1 &&
    hosts.includes(args[0])
  )
    console.log(JSON.stringify(receipt(args[0], message)));
  else {
    console.error(message);
    process.exitCode = 1;
  }
}
