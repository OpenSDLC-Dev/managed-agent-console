import { expect, test, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:18080";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

/**
 * CLAUDE.md principle 3: a surface this deployment does not implement is
 * hidden, not surfaced as an error. The mock replays what the platform
 * actually answers for an unregistered route — a plain 404/not_found_error,
 * indistinguishable by status from a real miss (issue #33).
 */
test("a surface the deployment does not implement leaves the nav and the palette", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__unimplemented`, {
    data: { surfaces: ["skills", "files"] },
  });
  await signIn(page);

  const nav = page.locator("nav");
  await expect(nav.locator("[data-surface=agents]")).toBeVisible();
  await expect(nav.locator("[data-surface=vaults]")).toBeVisible();
  await expect(nav.locator("[data-surface=skills]")).toHaveCount(0);
  await expect(nav.locator("[data-surface=files]")).toHaveCount(0);

  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Search agents, sessions, environments…");
  await expect(input).toBeVisible();
  // An empty query lists exactly the section shortcuts.
  await expect(page.getByRole("option", { name: /Sessions/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Skills/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Files/ })).toHaveCount(0);
});

test("its page says so instead of rendering the platform's error", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__unimplemented`, {
    data: { surfaces: ["skills"] },
  });
  await signIn(page);

  await page.goto("/skills");
  const standIn = page.getByTestId("unavailable-surface");
  await expect(standIn).toBeVisible();
  await expect(standIn).toHaveAttribute("data-surface", "skills");
  await expect(page.getByTestId("error-state")).toHaveCount(0);
  // The platform's envelope must not leak through as the page's message.
  await expect(page.getByText(/no such endpoint/)).toHaveCount(0);
});

test("a served deployment keeps every surface", async ({ page }) => {
  await signIn(page);
  const nav = page.locator("nav");
  for (const surface of [
    "agents",
    "sessions",
    "environments",
    "vaults",
    "skills",
    "files",
  ]) {
    await expect(nav.locator(`[data-surface=${surface}]`)).toBeVisible();
  }
});

test("a genuine not-found is still an error, not a hidden surface", async ({
  page,
}) => {
  await signIn(page);
  // Same status and error type as an absent endpoint — only the route differs,
  // and an item route's 404 means the resource is gone.
  await page.goto("/agents/agt_doesnotexist000000000000");
  await expect(page.getByTestId("error-state")).toBeVisible();
  await expect(page.getByTestId("unavailable-surface")).toHaveCount(0);
});
