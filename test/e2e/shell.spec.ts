import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./sign-in";

/** Navigate to /login and wait until the form is hydrated and interactive. */
async function openLogin(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Login name").fill("operator");
}

test("unauthenticated visits redirect to the login gate", async ({ page }) => {
  await page.goto("/agents");
  await expect(page).toHaveURL(/\/login\?return_to=%2Fagents$/);
});

test("the private API refuses unauthenticated API calls with the platform envelope shape", async ({
  request,
}) => {
  const response = await request.get(
    "/api/organizations/default/proxy/v1/agents",
  );
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.type).toBe("error");
  expect(body.error.type).toBe("authentication_error");
});

test("native auth metadata is public and legacy login routes are absent", async ({
  request,
}) => {
  const config = await request.get("/api/auth/config");
  expect(await config.json()).toEqual({ mode: "password", native_login: true });
  for (const path of ["/api/login", "/api/platform/v1/agents"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});

test("the login page reports no SSO on a password-only deployment", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("Login name")).toBeVisible();
  await expect(page.getByTestId("sso-sign-in")).toHaveCount(0);
});

test("console documents deny framing", async ({ page }) => {
  const login = await page.goto("/login");
  expect(login?.status()).toBe(200);
  expect(login?.headers()["content-security-policy"]).toBe(
    "frame-ancestors 'none'",
  );
  expect(login?.headers()["x-frame-options"]).toBe("DENY");

  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Login name").fill("operator");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const dashboard = await page.goto("/dashboard");
  expect(dashboard?.status()).toBe(200);
  expect(dashboard?.headers()["content-security-policy"]).toBe(
    "frame-ancestors 'none'",
  );
  expect(dashboard?.headers()["x-frame-options"]).toBe("DENY");
});

test("wrong password is rejected; the right one lands on the Dashboard", async ({
  page,
}) => {
  await openLogin(page);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("invalid login name or password")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveValue("");
  await page.getByLabel("Login name").fill("operator");

  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 1 }),
  ).toHaveAttribute("data-greeting-name", "Test");
});

test("the shell shows all resources and a live platform connection", async ({
  page,
}) => {
  await openLogin(page);
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const [group, items] of [
    ["Resources", ["Skills", "Files"]],
    [
      "Agents",
      [
        "Agents",
        "Sessions",
        "Deployments",
        "Memory",
        "Environments",
        "Credential vaults",
      ],
    ],
  ] as const) {
    await nav.locator(`[data-nav-group="${group}"]`).click();
    for (const item of items) {
      await expect(
        nav.getByRole("link", { name: item, exact: true }),
      ).toBeVisible();
    }
    if (group === "Resources") {
      await nav.getByRole("button", { name: "Back to all sections" }).click();
    }
  }

  // The probe goes through the application edge to the mock platform and comes back green.
  await expect(page.getByTestId("connection-dot")).toHaveAttribute(
    "data-state",
    "up",
    { timeout: 15_000 },
  );

  // Client-side navigation works.
  await nav.getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(
    page.getByRole("heading", { name: "Sessions", exact: true }),
  ).toBeVisible();
});

test("the expanded sidebar offers both versions and a keyboard-accessible account menu", async ({
  page,
}) => {
  await signIn(page, "/dashboard");
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("link", { name: "Platform documentation" }),
  ).toBeVisible();
  const account = page.getByRole("button", { name: "Account menu" });
  const panel = page.getByRole("dialog", { name: "Account settings" });

  await account.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  const signOut = panel.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(signOut).toBeFocused();
  await expect(panel.getByText("Theme", { exact: true })).toHaveCount(0);
  await expect(
    panel.getByText("Platform Connected", { exact: true }),
  ).toHaveCount(0);
  const platform = panel.locator("[data-platform-version]");
  const consoleBuild = panel.locator("[data-console-version]");
  await expect(platform).toBeVisible();
  await expect(consoleBuild).toBeVisible();
  const platformBox = (await platform.boundingBox())!;
  expect((await consoleBuild.boundingBox())!.y).toBeGreaterThanOrEqual(
    platformBox.y + platformBox.height,
  );
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(account).toBeFocused();
});

test("an open account menu follows Platform upgrades on the session refresh", async ({
  page,
}) => {
  let stamp: string | undefined;
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), platform_version: stamp },
    });
  });
  await page.clock.install();
  await signIn(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  const panel = page.getByRole("dialog", { name: "Account settings" });
  const platform = panel.locator("[data-platform-version]");
  const consoleBuild = panel.locator("[data-console-version]");
  await expect(platform).toBeVisible();
  await expect(platform).toHaveAttribute("data-platform-version", "");
  const consoleVersion = await consoleBuild.getAttribute(
    "data-console-version",
  );
  const builtConfig = JSON.parse(
    readFileSync(".next/required-server-files.json", "utf8"),
  ).config;
  expect(consoleVersion).toBe(builtConfig.env.CONSOLE_BUILD_VERSION);

  for (const release of ["1.2.3", "v1.2.3-dev-41a8318b", "v1.2.4"]) {
    stamp = release;
    await page.clock.fastForward(16_000);
    await expect(platform).toHaveAttribute("data-platform-version", release);
    await expect(panel).toBeVisible();
    await expect(consoleBuild).toHaveAttribute(
      "data-console-version",
      consoleVersion!,
    );
  }
});

test("the account dot follows a Platform outage and recovers on reconnection", async ({
  page,
  context,
}) => {
  const probe = "**/proxy/v1/agents?limit=1";
  await page.route(probe, (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await signIn(page, "/dashboard");
  const dot = page.getByTestId("connection-dot");
  await expect(dot).toHaveAttribute("data-state", "down");
  await expect(dot).toHaveClass(/bg-red-500/);
  await page.getByRole("button", { name: "Account menu" }).click();
  const panel = page.getByRole("dialog", { name: "Account settings" });
  await expect(panel.getByText("HTTP 503")).toBeVisible();
  await page.unroute(probe);
  await context.setOffline(true);
  await expect(panel.getByText("Network offline")).toBeVisible();
  await context.setOffline(false);
  await expect(dot).toHaveAttribute("data-state", "up");
  await expect(dot).toHaveClass(/bg-emerald-500/);
  await expect(panel.getByRole("status")).toHaveCount(0);
});
