import { expect, test, type Page } from "@playwright/test";

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
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
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
        "Memory Stores",
        "Environments",
        "Credential Vaults",
      ],
    ],
  ] as const) {
    await nav.getByRole("button", { name: group, exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
});
