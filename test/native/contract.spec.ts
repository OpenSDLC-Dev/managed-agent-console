import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { test, expect, type Page, type Request } from "@playwright/test";
import type { QueryClient } from "@tanstack/react-query";
import { credentialHeaders } from "./credential-headers";
const org = "/api/console/organizations/default";
const password = "native-test-password-123";
type StreamReceipt = {
  id: number;
  port: number;
  path: string;
  openedAt: string;
  closedAt: string | null;
};
function receipt() {
  return JSON.parse(
    readFileSync(
      join(process.env.NATIVE_EVIDENCE_DIR!, "task6-native-receipt.json"),
      "utf8",
    ),
  );
}
function code(mode = "password") {
  return readFileSync(join(receipt().dir, `${mode}-setup-code`), "utf8");
}
async function write(page: Page, url: string, body?: unknown, method = "POST") {
  return page.evaluate(
    async ({ url, body, method }) => {
      const session = await (await fetch("/api/auth/session")).json();
      const response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          "X-CSRF-Token": session.csrf_token,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    { url, body, method },
  );
}
async function login(page: Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("Login name").fill(name);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// Inspect the actual provider rather than claiming that a window marker proves
// Query cache disposal. This test-only traversal adds no production debug hook.
async function privateCache(page: Page, sid: string, seed = false) {
  return page.getByTestId("signed-in-as").evaluate(
    (element, { sid, seed }) => {
      type Fiber = { memoizedProps?: { client?: QueryClient }; return?: Fiber };
      const key = Object.keys(element).find((key) =>
        key.startsWith("__reactFiber$"),
      );
      let fiber: Fiber | undefined = key
        ? (element as unknown as Record<string, Fiber>)[key]
        : undefined;
      while (fiber && !fiber.memoizedProps?.client?.getQueryData)
        fiber = fiber.return;
      const client = fiber?.memoizedProps?.client;
      if (!client)
        throw new Error("The real QueryClient provider was not found");
      if (seed) {
        client.setQueryData(["members", "principal-boundary"], {
          email: "old-private@example.test",
        });
        Object.assign(window, { __nativePrincipalDocument: client });
      }
      return {
        oldWindow: "__nativePrincipalDocument" in window,
        oldPrivate:
          client.getQueryData(["members", "principal-boundary"]) !== undefined,
        oldResource: client.getQueryData(["session", sid]) !== undefined,
      };
    },
    { sid, seed },
  );
}

for (const [name, relativeSource] of [
  ["plain", false],
  ["plain", true],
  ["source with spaces", false],
  ["source with spaces", true],
  ...(process.platform === "win32"
    ? []
    : [
        ['source"quote', false],
        ["source\\backslash", false],
      ]),
] as [string, boolean][]) {
  test(`real offline runtime replacement resolves ${name} (relative=${relativeSource})`, () => {
    const evidence = process.env.NATIVE_EVIDENCE_DIR;
    expect(evidence, "NATIVE_EVIDENCE_DIR is required").toBeTruthy();
    const dir = mkdtempSync(join(evidence!, "np-"));
    try {
      const root = process.cwd();
      const platform = join(dir, name);
      mkdirSync(platform);
      writeFileSync(
        join(platform, "go.mod"),
        "module github.com/OpenSDLC-Dev/managed-agent-platform\n\ngo 1.18\n",
      );
      writeFileSync(join(platform, "go.sum"), "");
      writeFileSync(
        join(platform, "probe.go"),
        "package platform\nconst Present = true\n",
      );
      const preload = join(dir, "commands.mjs");
      // Stop at the build boundary. Only the later go list is real; every Docker
      // command is event-only, with the same original-receipt cleanup contract.
      writeFileSync(
        preload,
        `
import cp from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { writeFileSync } from "node:fs";
const id = "1".padStart(64, "0");
cp.spawn = (command, args) => {
  if (command !== "docker" && command !== "go") throw Error("unexpected spawn " + command);
  if (command === "docker" && args[0] === "create") writeFileSync(args[args.indexOf("--cidfile") + 1], id);
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.exitCode = command === "go" ? 1 : 0; child.signalCode = null;
  const stdout = args[0] === "inspect" ? "[]" : args[0] === "rm" ? id : args[0] === "port" ? "127.0.0.1:54321" : "";
  queueMicrotask(() => {
    child.stdout.end(stdout); child.stderr.end(command === "go" ? "path captured" : "");
    child.emit("close", child.exitCode, null);
  });
  return child;
};
syncBuiltinESMExports();
`,
      );
      const env = {
        NODE_ENV: "test" as const,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        SystemRoot: process.env.SystemRoot,
        NATIVE_EVIDENCE_DIR: dir,
        NATIVE_PLATFORM_SOURCE: relativeSource
          ? relative(root, platform)
          : platform,
      };
      const captured = spawnSync(
        process.execPath,
        [
          "--import",
          pathToFileURL(preload).href,
          join(root, "test/native/runtime.mjs"),
        ],
        { cwd: root, env, encoding: "utf8", timeout: 12_000 },
      );
      expect(captured.status, captured.stderr).toBe(1);
      const unsupported = process.platform !== "win32" && name.includes("\\");
      let goModule: string;
      if (unsupported) {
        expect(captured.stderr).toContain("literal backslash");
        // Real Go separately proves why this path must fail before resources.
        goModule = join(dir, "offline-module");
        mkdirSync(goModule);
        writeFileSync(
          join(goModule, "go.mod"),
          `module offline-probe\n\ngo 1.18\nrequire github.com/OpenSDLC-Dev/managed-agent-platform v0.0.0\nreplace github.com/OpenSDLC-Dev/managed-agent-platform => ${JSON.stringify(platform)}\n`,
        );
      } else {
        expect(captured.stderr).toContain("path captured");
        const capturedReceipt = JSON.parse(
          readFileSync(join(dir, "task6-native-receipt.json"), "utf8"),
        );
        expect(capturedReceipt.cleaned).toBe(true);
        goModule = join(capturedReceipt.dir, "module");
      }
      writeFileSync(
        join(goModule, "main.go"),
        'package main\nimport p "github.com/OpenSDLC-Dev/managed-agent-platform"\nvar _ = p.Present\nfunc main() {}\n',
      );
      const loaded = spawnSync(
        "go",
        [
          "list",
          "-mod=mod",
          "-json",
          "github.com/OpenSDLC-Dev/managed-agent-platform",
        ],
        {
          cwd: goModule,
          encoding: "utf8",
          timeout: 12_000,
          env: {
            ...env,
            GOPROXY: "off",
            GOSUMDB: "off",
            GOTOOLCHAIN: "local",
            GOWORK: "off",
            GOENV: "off",
            GOTELEMETRY: "off",
            GOPATH: join(dir, "gopath"),
            GOCACHE: join(dir, "gocache"),
          },
        },
      );
      expect(
        loaded.error,
        "native package resolution requires Go",
      ).toBeUndefined();
      if (process.platform !== "win32" && name.includes("\\")) {
        // Correct quoting cannot make a POSIX literal backslash a valid Go path.
        expect(loaded.status).not.toBe(0);
        expect(loaded.stderr).toContain(
          "replacement directory appears to be Windows path",
        );
      } else {
        expect(loaded.status, loaded.stderr).toBe(0);
        expect(JSON.parse(loaded.stdout).Dir).toBe(platform);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("real native password/setup, current authority, management, private bytes/SSE and logout", async ({
  page,
  context,
  browser,
}) => {
  const offered: string[] = [];
  page.on("request", (r) => {
    offered.push(
      ...credentialHeaders("http://127.0.0.1:38200", r.url(), r.headers()),
    );
  });
  await page.goto("/setup");
  await page.getByLabel("Setup code").fill("bad-code");
  await page.getByLabel("Login name").fill("first-admin");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveValue("");
  await page.getByLabel("Setup code").fill(code());
  await page.getByLabel("Login name").fill("first-admin");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create administrator" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("[data-role=admin]")).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "map_session",
  )!;
  expect(
    !!cookie &&
      cookie.httpOnly &&
      cookie.sameSite === "Lax" &&
      cookie.path === "/",
  ).toBe(true);
  expect(cookie.secure).toBe(false);
  expect(
    await page.evaluate(() => document.cookie.includes("map_session")),
  ).toBe(false);
  const session = await page.evaluate(
    async () => await (await fetch("/api/auth/session")).json(),
  );
  expect(Object.keys(session).sort()).toEqual(
    [
      "csrf_token",
      "email",
      "expires_at",
      "id",
      "login_name",
      "name",
      "role",
      "role_source",
      "signed_in",
    ].sort(),
  );
  expect(JSON.stringify(session).includes(cookie.value)).toBe(false);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  for (const path of ["/api/login", "/api/platform/v1/agents"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(path === "/api/login" ? 405 : 404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
  expect(
    (await page.request.post("/api/login", { data: { password } })).status(),
  ).toBe(404);
  expect((await page.request.get("/v1/agents")).status()).toBe(401);
  for (const path of [
    `${org}/members`,
    `${org}/service_accounts`,
    `${org}/workspaces/default/api_keys`,
    "/api/organizations/default/proxy/v1/agents",
    "/admin/v1/providers",
    "/api/auth/logout",
  ]) {
    for (const token of [undefined, "wrong"]) {
      const status = await page.evaluate(
        async ({ path, token }) =>
          (
            await fetch(path, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(token ? { "X-CSRF-Token": token } : {}),
              },
              body: "{}",
            })
          ).status,
        { path, token },
      );
      expect(status, path).toBe(403);
    }
  }
  await page.goto("/service-accounts");
  await page
    .getByRole("button", { name: "Create service account", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("admin-bot");
  await page.getByLabel("Organization role").selectOption("admin");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "admin-bot", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit admin-bot" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
  await page.getByLabel("Description").fill("test account");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText("test account", { exact: true })).toBeVisible();
  const accounts = await (
    await page.request.get(`${org}/service_accounts`)
  ).json();
  const sa = accounts.data[0];
  expect(sa.created_by_actor_id).toBe(session.id);
  expect(
    (
      await write(page, `${org}/service_accounts/${sa.id}`, {
        description: null,
        organization_role: null,
      })
    ).status,
  ).toBe(200);
  await page.getByRole("button", { name: "Archive admin-bot" }).click();
  await page.getByRole("button", { name: "Confirm archive" }).click();
  await page.getByLabel("Include archived").check();
  await expect(page.locator('[data-status="archived"]')).toBeVisible();
  const archived = await (
    await page.request.get(`${org}/service_accounts/${sa.id}`)
  ).json();
  const repeated = await write(
    page,
    `${org}/service_accounts/${sa.id}/archive`,
  );
  expect(repeated.body.archived_at).toBe(archived.archived_at);
  expect(
    (
      await write(page, `${org}/service_accounts/${sa.id}`, {
        description: "no",
      })
    ).status,
  ).toBe(400);
  // An admin service account never satisfies the human last-admin guard.
  await write(page, `${org}/service_accounts`, {
    name: "another-admin-bot",
    organization_role: "admin",
  });
  await page.goto("/members");
  await page.getByLabel("Role for first-admin").selectOption("user");
  await expect(page.locator("p[role=alert]")).toContainText("last");
  await page.getByRole("button", { name: "Remove first-admin" }).click();
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("last");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Create local member" }).click();
  await page.getByLabel("Login name").fill("new-person");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create member", exact: true })
    .click();
  await expect(
    page.getByText("new-person", { exact: true }).first(),
  ).toBeVisible();
  const userContext = await browser.newContext({
    baseURL: "http://127.0.0.1:38200",
  });
  const userPage = await userContext.newPage();
  await login(userPage, "new-person");
  await expect(userPage.locator("[data-no-resource-access]")).toBeVisible();
  await expect(userPage.locator("[data-role=user]")).toBeVisible();
  await expect(userPage.getByTestId("connection-dot")).toHaveAttribute(
    "data-state",
    "denied",
  );
  await expect(
    userPage.getByRole("link", { name: "Members", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Role for new-person").selectOption("admin");
  await userPage.reload();
  await expect(userPage.locator("[data-role=admin]")).toBeVisible();
  await expect(
    userPage.getByRole("link", { name: "Members", exact: true }).first(),
  ).toBeVisible();
  const memberPage = await (
    await page.request.get(`${org}/members?limit=1&roles[]=admin`)
  ).json();
  expect(memberPage.has_more).toBe(true);
  expect(memberPage.first_id).toBe(memberPage.last_id);
  const following = await (
    await page.request.get(
      `${org}/members?limit=1&after_id=${memberPage.last_id}`,
    )
  ).json();
  expect(following.data[0].id).not.toBe(memberPage.last_id);
  const defaultAccount = await write(page, `${org}/service_accounts`, {
    name: "default-role-bot",
  });
  expect(defaultAccount.body.organization_role).toBe("developer");
  const accountPage = await (
    await page.request.get(
      `${org}/service_accounts?limit=1&include_archived=true`,
    )
  ).json();
  expect(accountPage.next_page).toEqual(expect.any(String));
  const nextAccountPage = await (
    await page.request.get(
      `${org}/service_accounts?limit=1&include_archived=true&page=${encodeURIComponent(accountPage.next_page)}`,
    )
  ).json();
  expect(nextAccountPage.data[0].id).not.toBe(accountPage.data[0].id);
  // Real resource transport: JSON, multipart, exact binary filename/bytes.
  const resource = "/api/organizations/default/proxy/v1";
  const agent = await write(page, `${resource}/agents`, {
    name: "native-fixture",
    model: "unused-model",
  });
  expect(agent.status).toBe(200);
  const environment = await write(page, `${resource}/environments`, {
    name: "native-fixture",
    config: { type: "self_hosted" },
  });
  expect(environment.status).toBe(200);
  const created = await write(page, `${resource}/sessions`, {
    agent: agent.body.id,
    environment_id: environment.body.id,
  });
  expect(created.status).toBe(200);
  const sid = created.body.id;
  const uploaded = await page.evaluate(async (resource) => {
    const s = await (await fetch("/api/auth/session")).json();
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([0, 1, 255, 10])], "native-bytes.bin"),
    );
    const r = await fetch(`${resource}/files`, {
      method: "POST",
      headers: { "X-CSRF-Token": s.csrf_token },
      body: form,
    });
    return { status: r.status, body: await r.json() };
  }, resource);
  expect(uploaded.status).toBe(200);
  // Fresh uploads are not downloadable; seed the output flag as the executor would.
  const downloadable = spawnSync(
    "docker",
    [
      "exec",
      receipt().container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "native_password",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `UPDATE files SET downloadable=true,scope_type='session',scope_id='${sid}' WHERE id='${uploaded.body.id}'`,
    ],
    { encoding: "utf8" },
  );
  expect(downloadable.status, downloadable.stderr).toBe(0);
  const binary = await page.request.get(
    `${resource}/files/${uploaded.body.id}/content`,
  );
  expect(binary.status()).toBe(200);
  expect([...(await binary.body())]).toEqual([0, 1, 255, 10]);
  expect(binary.headers()["content-disposition"]).toContain("native-bytes.bin");
  const token = sid.split("_")[1];
  const child = `sthr_${token[0] === "0" ? "1" : "0"}${token.slice(1)}`;
  const primary = `sthr_${sid.split("_")[1]}`;
  const sql = `INSERT INTO session_threads(id,session_id,parent_thread_id,agent,agent_name,status) VALUES ('${child}','${sid}','${primary}','{"id":"agent_child","type":"agent","version":1,"name":"worker","model":{"id":"unused-model"},"system":"","tools":[],"mcp_servers":[],"skills":[]}','worker','idle')`;
  const seeded = spawnSync(
    "docker",
    [
      "exec",
      receipt().container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "native_password",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  );
  expect(seeded.status, seeded.stderr).toBe(0);
  const urls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/stream?")) urls.push(r.url());
  });
  await page.goto(`/sessions/${sid}?inspector=thread`);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  expect(
    urls.some((u) => u.includes(`${resource}/sessions/${sid}/events/stream?`)),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Child thread worker", exact: true })
    .click();
  await expect(page.locator("[data-viewing-thread-id]")).toHaveAttribute(
    "data-viewing-thread-id",
    child,
  );
  await expect
    .poll(() =>
      urls.some((u) =>
        u.includes(`${resource}/sessions/${sid}/threads/${child}/stream?`),
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  await test.step("same-context account replacement drops the old document, Query cache and both live streams", async () => {
    const oldStreams = (receipt().streams as StreamReceipt[]).filter(
      (stream) =>
        stream.port === 38200 && stream.path.includes(`/sessions/${sid}/`),
    );
    expect(oldStreams).toHaveLength(2);
    expect(oldStreams.every((stream) => stream.closedAt === null)).toBe(true);
    const before = await privateCache(page, sid, true);
    expect(before).toEqual({
      oldWindow: true,
      oldPrivate: true,
      oldResource: true,
    });
    const switcher = await context.newPage();
    expect(switcher.context()).toBe(page.context());
    const navigations: string[] = [];
    const navigation = (r: Request) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame())
        navigations.push(new URL(r.url()).pathname);
    };
    page.on("request", navigation);
    const nextSession = await (
      await userPage.request.get("/api/auth/session")
    ).json();
    // Capture a clone before returning the real response to the app. Chromium
    // can discard the protocol response body as soon as the document leaves.
    await page.evaluate(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]) === "/api/auth/session" && response.ok) {
          const { id, signed_in } = await response.clone().json();
          console.info(
            "principal-boundary-session:" +
              JSON.stringify({
                id,
                signed_in,
                status: response.status,
                signedOutMarker:
                  response.headers.has("x-platform-signed-out") ||
                  response.headers.has("x-console-signed-out"),
              }),
          );
        }
        return response;
      };
    });
    const confirmedReplacement = page.waitForEvent("console", {
      predicate: (message) =>
        message.text().startsWith("principal-boundary-session:") &&
        JSON.parse(message.text().split("principal-boundary-session:")[1])
          .id === nextSession.id,
      timeout: 20_000,
    });
    try {
      await login(switcher, "new-person");
      await page.bringToFront();
      const replacement = JSON.parse(
        (await confirmedReplacement)
          .text()
          .split("principal-boundary-session:")[1],
      );
      expect(replacement).toEqual({
        id: nextSession.id,
        signed_in: true,
        status: 200,
        signedOutMarker: false,
      });
      expect(nextSession.id).not.toBe(session.id);
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
      await expect(page.getByTestId("signed-in-as")).toHaveAttribute(
        "data-account",
        "new-person",
      );
      const after = await privateCache(page, sid);
      expect(after).toEqual({
        oldWindow: false,
        oldPrivate: false,
        oldResource: false,
      });
      // Assert closures on the original fixture response handles, not on
      // Playwright events that Chromium omits for a discarded document.
      await expect
        .poll(() =>
          oldStreams.every((old) =>
            (receipt().streams as StreamReceipt[]).some(
              (current) =>
                current.id === old.id && typeof current.closedAt === "string",
            ),
          ),
        )
        .toBe(true);
      expect(navigations.filter((path) => path === "/")).toHaveLength(1);
      expect(navigations).not.toContain("/login");
      // Use the original fixture cookie only in this explicit request. A document
      // switch must not revoke that still-valid server session to make SSE end.
      const original = await page.request.get("/api/auth/session", {
        headers: { cookie: `map_session=${cookie.value}` },
      });
      expect(original.status()).toBe(200);
      expect((await original.json()).id).toBe(session.id);
      writeFileSync(
        join(
          process.env.NATIVE_EVIDENCE_DIR!,
          "principal-boundary-browser.json",
        ),
        JSON.stringify(
          {
            sameContext: true,
            oldPrincipal: session.id,
            newPrincipal: nextSession.id,
            replacementStatus: replacement.status,
            signedOutMarker: false,
            before,
            after,
            navigations,
            oldSessionStillValid: original.status() === 200,
            streams: (receipt().streams as StreamReceipt[]).filter((current) =>
              oldStreams.some((old) => old.id === current.id),
            ),
          },
          null,
          2,
        ),
      );

      // The same replacement must also leave a real dirty editor without an
      // application confirmation or a native beforeunload prompt retaining it.
      page.off("request", navigation);
      await login(page, "first-admin");
      await page.goto(`/agents/${agent.body.id}`);
      await page
        .getByLabel("Name", { exact: true })
        .fill("Old actor unsaved draft");
      await page
        .getByRole("link", { name: "Dashboard", exact: true })
        .first()
        .click();
      const prompt = page.getByRole("dialog", {
        name: "Unsaved changes",
        exact: true,
      });
      await prompt.getByRole("button", { name: "Stay" }).click();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
        "Old actor unsaved draft",
      );
      const dialogs: string[] = [];
      const onDialog = (dialog: import("@playwright/test").Dialog) => {
        dialogs.push(dialog.type());
        void dialog.dismiss();
      };
      page.on("dialog", onDialog);
      try {
        await login(switcher, "new-person");
        await page.bringToFront();
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
        await expect(page.getByTestId("signed-in-as")).toHaveAttribute(
          "data-account",
          "new-person",
        );
        await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
        await expect(prompt).toHaveCount(0);
        expect(dialogs).toEqual([]);
        writeFileSync(
          join(
            process.env.NATIVE_EVIDENCE_DIR!,
            "principal-boundary-dirty-browser.json",
          ),
          JSON.stringify(
            {
              voluntaryNavigationGuarded: true,
              oldDraftRetainedOnStay: true,
              replacementReachedNewDocument: true,
              oldDraftInputs: 0,
              dialogs,
            },
            null,
            2,
          ),
        );
      } finally {
        page.off("dialog", onDialog);
      }
    } finally {
      page.off("request", navigation);
      await switcher.close();
    }
  });
  // Restore account A and its child view for the existing authority-withdrawal
  // contract. The two-page test above did not log either account out.
  await login(page, "first-admin");
  await test.step("initial metadata outage cannot populate A-private work before first successful B identity", async () => {
    expect(
      (
        await write(page, `${org}/members`, {
          login_name: "initial-user",
          password,
          role: "user",
        })
      ).status,
    ).toBe(200);
    const firstPage = await context.newPage();
    const switcher = await context.newPage();
    const privateRequests: string[] = [];
    const privateResponses: { path: string; status: number }[] = [];
    firstPage.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (
        path.startsWith("/api/console/") ||
        path.startsWith("/api/organizations/") ||
        path.startsWith("/admin/v1/")
      )
        privateRequests.push(path);
    });
    firstPage.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (
        path.startsWith("/api/console/") ||
        path.startsWith("/api/organizations/") ||
        path.startsWith("/admin/v1/")
      )
        privateResponses.push({ path, status: response.status() });
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const arrived = new Promise<void>((resolve) => {
      started = resolve;
    });
    let metadataCalls = 0;
    let heldPrincipal: string | undefined;
    let heldStatus: number | undefined;
    const metadataResponses: { id: string; status: number; marked: boolean }[] =
      [];
    await firstPage.route("**/api/auth/session", async (route) => {
      metadataCalls++;
      if (metadataCalls === 1) {
        const original = await route.fetch();
        heldPrincipal = (await original.json()).id;
        heldStatus = original.status();
        started();
        await held;
        await route.fulfill({
          status: 503,
          json: {
            error: { type: "api_error", message: "initial metadata outage" },
          },
        });
      } else {
        const response = await route.fetch();
        const body = await response.json();
        metadataResponses.push({
          id: body.id,
          status: response.status(),
          marked:
            response.headers()["x-platform-signed-out"] === "1" ||
            "x-console-signed-out" in response.headers(),
        });
        await route.fulfill({ response });
      }
    });
    try {
      await firstPage.goto("/members");
      await arrived;
      expect(heldStatus).toBe(200);
      expect(heldPrincipal).toBe(session.id);
      // The real A cookie can read private members now, but the app must not.
      const opportunity = await firstPage.request.get(`${org}/members`);
      expect(opportunity.status()).toBe(200);
      await expect(
        firstPage.locator('[data-native-identity="loading"]'),
      ).toBeVisible();
      await expect(
        firstPage.getByRole("button", { name: "Create local member" }),
      ).toHaveCount(0);
      const beforeKeys = await firstPage
        .locator('[data-native-identity="loading"]')
        .evaluate((element) => {
          type Fiber = {
            memoizedProps?: { client?: QueryClient };
            return?: Fiber;
          };
          const key = Object.keys(element).find((key) =>
            key.startsWith("__reactFiber$"),
          )!;
          let fiber = (element as unknown as Record<string, Fiber>)[key];
          while (fiber && !fiber.memoizedProps?.client?.getQueryData)
            fiber = fiber.return!;
          const client = fiber?.memoizedProps?.client;
          if (!client) throw new Error("real Query provider missing");
          Object.assign(window, { __initialDocument: true });
          return client
            .getQueryCache()
            .getAll()
            .map((query) => query.queryKey);
        });
      expect(beforeKeys).toEqual([["console-session"]]);
      expect(privateRequests).toEqual([]);
      await firstPage.screenshot({
        path: join(
          process.env.NATIVE_EVIDENCE_DIR!,
          "initial-identity-loading.png",
        ),
        fullPage: true,
      });
      await login(switcher, "initial-user");
      const next = await (
        await switcher.request.get("/api/auth/session")
      ).json();
      expect(next.id).not.toBe(session.id);
      expect(next.role).toBe("user");
      release();
      await firstPage.bringToFront();
      await expect(firstPage.getByTestId("signed-in-as")).toHaveAttribute(
        "data-account",
        "initial-user",
      );
      await expect(firstPage.getByTestId("error-state")).toHaveAttribute(
        "data-denied",
        "true",
      );
      await expect(firstPage).toHaveURL(/\/members$/);
      await expect(
        firstPage.getByRole("button", { name: "Create local member" }),
      ).toHaveCount(0);
      expect(
        await firstPage.evaluate(() => "__initialDocument" in window),
      ).toBe(true);
      const after = await privateCache(firstPage, sid);
      expect(after).toEqual({
        oldWindow: false,
        oldPrivate: false,
        oldResource: false,
      });
      expect(metadataResponses.length).toBeGreaterThan(0);
      expect(
        metadataResponses.every(
          (response) =>
            response.id === next.id &&
            response.status === 200 &&
            !response.marked,
        ),
      ).toBe(true);
      expect(privateResponses.length).toBeGreaterThan(0);
      expect(
        privateResponses.every((response) => response.status === 403),
      ).toBe(true);
      const original = await firstPage.request.get("/api/auth/session", {
        headers: { cookie: `map_session=${cookie.value}` },
      });
      expect(original.status()).toBe(200);
      await firstPage.screenshot({
        path: join(
          process.env.NATIVE_EVIDENCE_DIR!,
          "initial-identity-b-user-denied.png",
        ),
        fullPage: true,
      });
      writeFileSync(
        join(
          process.env.NATIVE_EVIDENCE_DIR!,
          "initial-principal-browser.json",
        ),
        JSON.stringify(
          {
            sameContext: firstPage.context() === switcher.context(),
            oldPrincipal: session.id,
            firstConfirmedPrincipal: next.id,
            heldStatus,
            heldPrincipal,
            injectedInitialStatus: 503,
            privateOpportunityStatus: opportunity.status(),
            beforeKeys,
            privateRequestsBeforeRetry: [],
            metadataResponses,
            privateResponses,
            after,
            initialDocumentRetainedWithoutPrivatePopulation: true,
            oldServerSessionStillValid: original.status() === 200,
          },
          null,
          2,
        ),
      );
    } finally {
      release();
      await firstPage.close();
      await switcher.close();
    }
  });
  await login(page, "first-admin");
  await test.step("pending deliberate logout never rebinds a replacement cookie over private member cache", async () => {
    await page.goto("/members");
    await expect(page.getByLabel("Role for first-admin")).toBeVisible();
    const before = await privateCache(page, sid, true);
    expect(before.oldPrivate).toBe(true);
    const oldCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "map_session",
    )!;
    const oldSession = await (
      await page.request.get("/api/auth/session")
    ).json();
    const switcher = await context.newPage();
    expect(switcher.context()).toBe(page.context());
    const navigations: string[] = [];
    const navigation = (request: Request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        navigations.push(
          new URL(request.url()).pathname + new URL(request.url()).search,
        );
    };
    page.on("request", navigation);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const arrived = new Promise<void>((resolve) => {
      started = resolve;
    });
    let logoutStatus: number | undefined;
    let logoutCalls = 0;
    const logoutRoute = async (route: import("@playwright/test").Route) => {
      logoutCalls++;
      // The real POST revokes A. Delay only its successful response (including
      // its expired cookie), not B's login, metadata or private authorization.
      const response = await route.fetch();
      logoutStatus = response.status();
      started();
      await held;
      await route.fulfill({ response });
    };
    await page.route("**/api/auth/logout", logoutRoute);
    try {
      await page.evaluate(() => {
        const client = (
          window as unknown as { __nativePrincipalDocument: QueryClient }
        ).__nativePrincipalDocument;
        const proof = {
          client,
          metadata: [] as {
            id: string;
            role: string;
            status: number;
            marked: boolean;
          }[],
          renders: [] as {
            account: string | null;
            oldRow: boolean;
            privateControl: boolean;
            signOutEnabled: boolean;
          }[],
        };
        Object.assign(window, { __pendingSignoutProof: proof });
        const original = window.fetch;
        window.fetch = async (...args) => {
          const response = await original(...args);
          if (String(args[0]) === "/api/auth/session" && response.ok) {
            const body = await response.clone().json();
            proof.metadata.push({
              id: body.id,
              role: body.role,
              status: response.status,
              marked:
                response.headers.has("x-platform-signed-out") ||
                response.headers.has("x-console-signed-out"),
            });
          }
          return response;
        };
        const observer = new MutationObserver(() => {
          const footer = document.querySelector('[data-testid="signed-in-as"]');
          const signOut = document.querySelector<HTMLButtonElement>(
            '[data-testid="sign-out"]',
          );
          proof.renders.push({
            account: footer?.getAttribute("data-account") ?? null,
            oldRow: !!document.querySelector(
              '[aria-label="Role for first-admin"]',
            ),
            privateControl: [...document.querySelectorAll("button")].some(
              (button) => button.textContent === "Create local member",
            ),
            signOutEnabled: !!signOut && !signOut.disabled,
          });
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      });
      await page.getByTestId("sign-out").click();
      await arrived;
      expect(logoutStatus).toBe(200);
      await expect(page.getByTestId("sign-out")).toBeDisabled();
      const revoked = await page.request.get("/api/auth/session", {
        headers: { cookie: `map_session=${oldCookie.value}` },
      });
      expect(revoked.status()).toBe(401);
      await login(switcher, "initial-user");
      const replacement = await (
        await switcher.request.get("/api/auth/session")
      ).json();
      expect(replacement.id).not.toBe(oldSession.id);
      expect(replacement.role).toBe("user");
      await page.evaluate(async () => {
        const { client } = (
          window as unknown as {
            __pendingSignoutProof: { client: QueryClient };
          }
        ).__pendingSignoutProof;
        await client.refetchQueries({ queryKey: ["console-session"] });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
      const pending = await page.evaluate(() => {
        const proof = (
          window as unknown as {
            __pendingSignoutProof: {
              client: QueryClient;
              metadata: unknown[];
              renders: {
                account: string | null;
                oldRow: boolean;
                privateControl: boolean;
                signOutEnabled: boolean;
              }[];
            };
          }
        ).__pendingSignoutProof;
        return {
          id: proof.client.getQueryData<{ id: string }>(["console-session"])
            ?.id,
          memberCacheRetained: JSON.stringify(
            proof.client.getQueriesData({ queryKey: ["members"] }),
          ).includes("first-admin"),
          oldPrivateCacheRetained:
            proof.client.getQueryData(["members", "principal-boundary"]) !==
            undefined,
          metadata: proof.metadata,
          replacementRenders: proof.renders.filter(
            (render) => render.account === "initial-user",
          ),
        };
      });
      expect(pending.id).toBe(replacement.id);
      expect(pending.metadata).toContainEqual({
        id: replacement.id,
        role: "user",
        status: 200,
        marked: false,
      });
      expect(pending.memberCacheRetained).toBe(true);
      expect(pending.oldPrivateCacheRetained).toBe(true);
      expect(pending.replacementRenders).toEqual([]);
      await expect(
        page.locator('[data-native-identity="loading"]'),
      ).toBeVisible();
      await expect(page.getByLabel("Role for first-admin")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Create local member" }),
      ).toHaveCount(0);
      await expect(page.getByTestId("signed-in-as")).toHaveCount(0);
      await expect(page.getByTestId("sign-out")).toHaveCount(0);
      expect(navigations).toEqual([]);
      release();
      await expect(page).toHaveURL(/\/login$/);
      expect(navigations).toEqual(["/login"]);
      expect(logoutCalls).toBe(1);
      writeFileSync(
        join(process.env.NATIVE_EVIDENCE_DIR!, "pending-signout-browser.json"),
        JSON.stringify(
          {
            sameContext: true,
            oldPrincipal: oldSession.id,
            replacementPrincipal: replacement.id,
            injectedFault:
              "Only the actual successful logout response and its expired cookie were held; metadata and private reads were real and unmodified.",
            logoutStatus,
            oldServerSessionStatusAfterActualLogout: revoked.status(),
            pending,
            navigations,
            logoutCalls,
          },
          null,
          2,
        ),
      );
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
      page.off("request", navigation);
      await switcher.close();
    }
  });
  // The held POST revoked only the later A session, not the original setup
  // session. Restore that actual fixture cookie without exceeding login limits.
  await context.addCookies([cookie]);
  expect((await (await page.request.get("/api/auth/session")).json()).id).toBe(
    session.id,
  );
  await page.goto(`/sessions/${sid}?inspector=thread`);
  await page
    .getByRole("button", { name: "Child thread worker", exact: true })
    .click();
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  // Demotion cancels the established child stream. Its follow-up read reports
  // permission denial, not a signed-out identity or an endless reconnect loop.
  const attached = await page.evaluate(
    async ({ resource, sid, child }) => {
      const response = await fetch(
        `${resource}/sessions/${sid}/threads/${child}/stream`,
      );
      const state = window as Window & { __nativeStreamEnded?: boolean };
      state.__nativeStreamEnded = false;
      void (async () => {
        try {
          const reader = response.body!.getReader();
          while (!(await reader.read()).done) {
            /* drain real SSE */
          }
        } catch {
        } finally {
          state.__nativeStreamEnded = true;
        }
      })();
      return response.status;
    },
    { resource, sid, child },
  );
  expect(attached).toBe(200);
  const withdrawn = await write(userPage, `${org}/members/${session.id}`, {
    role: "user",
  });
  expect(withdrawn.status).toBe(200);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean(
            (window as Window & { __nativeStreamEnded?: boolean })
              .__nativeStreamEnded,
          ),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(page.getByTestId("error-state")).toContainText(
    "developer role",
    { timeout: 20_000 },
  );
  await expect(page).not.toHaveURL(/\/login/);
  expect((await page.request.get("/api/auth/session")).status()).toBe(200);
  expect(
    (await write(userPage, `${org}/members/${session.id}`, { role: "admin" }))
      .status,
  ).toBe(200);
  await page.goto(`/sessions/${sid}?inspector=resources`);
  const downloadLink = page.getByRole("link", {
    name: `Download native-bytes.bin (${uploaded.body.id})`,
    exact: true,
  });
  await expect(downloadLink).toHaveAttribute(
    "href",
    `${resource}/files/${uploaded.body.id}/content`,
  );
  const pendingDownload = page.waitForEvent("download");
  await downloadLink.click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("native-bytes.bin");
  const saved = join(test.info().outputDir, "native-bytes.bin");
  await download.saveAs(saved);
  expect([...readFileSync(saved)]).toEqual([0, 1, 255, 10]);
  expect(offered).toEqual([]);
  // Self-demotion refreshes authority with a full document boundary, not logout.
  await page.goto("/members");
  await page.getByLabel("Role for first-admin").selectOption("developer");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("[data-role=developer]")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Members", exact: true }),
  ).toHaveCount(0);
  await userPage.goto("/members");
  await userPage.getByRole("button", { name: "Remove first-admin" }).click();
  await userPage.getByRole("button", { name: "Confirm removal" }).click();
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await userPage.getByTestId("sign-out").click();
  await expect(userPage).toHaveURL(/\/login$/);
  expect(
    (await userContext.cookies()).some((c) => c.name === "map_session"),
  ).toBe(false);
  await userContext.close();
});

test("real native OIDC follows platform-owned PKCE/callback and setup refreshes current authority", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:38201",
  });
  const page = await context.newPage();
  const calls: string[] = [];
  const offered: string[] = [];
  page.on("request", (r) => {
    calls.push(new URL(r.url()).pathname);
    offered.push(
      ...credentialHeaders("http://127.0.0.1:38201", r.url(), r.headers()),
    );
  });
  await page.goto("/login");
  await page.getByRole("link", { name: "Sign in with SSO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("[data-role=user]")).toBeVisible();
  expect(calls).toContain("/api/auth/callback");
  expect(calls).not.toContain("/token");
  expect((await context.cookies()).map((c) => c.name)).toContain("map_session");
  expect(
    (await context.cookies()).some((c) => c.name === "console_identity"),
  ).toBe(false);
  await page.goto("/setup");
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByLabel("Setup code").fill(code("oidc"));
  await page.getByRole("button", { name: "Redeem setup code" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("[data-role=admin]")).toBeVisible();
  expect(offered).toEqual([]);
  await context.close();
});

test("real native login accepts a twelve-byte Unicode password and displays server throttling without signing out", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByLabel("Login name").fill("rate-limited-person");
    await page.getByLabel("Password").fill("密码密码");
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/auth/login" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(attempt < 5 ? 401 : 429);
    expect(response.headers()["x-platform-signed-out"]).toBeUndefined();
    if (attempt === 5) {
      expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
      await expect(page.locator("p[role=alert]")).toHaveText(
        /too many login attempts/,
      );
    } else
      await expect(page.locator("p[role=alert]")).toHaveText(
        /invalid login name or password/,
      );
    await expect(page.getByLabel("Password")).toHaveValue("");
    await expect(page).toHaveURL(/\/login$/);
  }
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "map_session"),
  ).toBe(false);
});
