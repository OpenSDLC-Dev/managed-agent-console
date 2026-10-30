import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
const org = "/api/console/organizations/default";
const password = "native-test-password-123";
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

test("real native password/setup, current authority, management, private bytes/SSE and logout", async ({
  page,
  context,
  browser,
}) => {
  const offered: string[] = [];
  page.on("request", (r) => {
    if (
      r.url().includes("127.0.0.1:38200") &&
      (r.headers()["x-api-key"] || r.headers().authorization)
    )
      offered.push(r.url());
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
  page.on("request", (r) => calls.push(new URL(r.url()).pathname));
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
