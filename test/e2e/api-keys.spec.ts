import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const MOCK = "http://127.0.0.1:18080";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

// The mock is shared across spec files. Teardown also runs after a failed case.
test.afterEach(async ({ request }) => {
  const reset = await request.post(`${MOCK}/__reset`);
  expect(reset.ok()).toBe(true);
});

/**
 * Plan 07 slice 4 — the management-key surface, on the platform's *other*
 * console namespace (`/api/console/`, not plan 30's `/api/oauth/`).
 */
test("issue a key, see it once, then disable and archive it", async ({
  page,
}) => {
  await signIn(page, "/agents");
  await page.getByRole("link", { name: "API Keys" }).click();
  await expect(page).toHaveURL(/\/api-keys$/);

  // The seeded rows: one issued by a person, one the control plane manages.
  await expect(page.getByText("ci-deploy")).toBeVisible();
  await expect(page.getByText("control-plane")).toBeVisible();

  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByLabel("Name").fill("e2e-key");
  await page.getByLabel("Expires").selectOption("7d");
  await page.getByRole("button", { name: "Add" }).click();

  // Rendered exactly once, and nowhere else — the whole point of the dialog.
  const revealed = page.getByTestId("revealed-api-key");
  await expect(revealed).toBeVisible();
  const secret = (await revealed.textContent()) ?? "";
  expect(secret).toContain("sk-map-api01-");
  await page.getByTestId("close-revealed-api-key").click();
  await expect(revealed).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create key" })).toBeFocused();
  expect(await page.content()).not.toContain(secret);

  // The list is re-read rather than rendered from the create response.
  const row = page.locator("tr", { hasText: "e2e-key" });
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "active",
  );

  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "inactive",
  );

  // The trigger names the row ("Archive API key e2e-key"); the confirm button
  // in the dialog is the title alone, so both need exact matching to be told
  // apart.
  await row.getByRole("button", { name: "Archive API key e2e-key" }).click();
  await page
    .getByRole("button", { name: "Archive API key", exact: true })
    .click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "archived",
  );
  // Terminal: nothing is offered on it afterwards.
  await expect(row.getByRole("button")).toHaveCount(0);
});

// A key nobody issued belongs to CONTROLPLANE_API_KEY and the platform refuses
// every mutation on it. The row is still listed — hiding it would be the worse
// lie — but it carries no controls that are guaranteed to 400.
test("the control-plane's own key is listed and not mutable", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/api-keys");
  const row = page.locator("tr", { hasText: "control-plane" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Control plane")).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
});

// A deployment predating the surface answers 404 through its router catch-all,
// and the console drops the item rather than showing a page that cannot work.
test("a platform without the surface loses the nav item", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__unimplemented`, {
    data: { surfaces: ["api-keys"] },
  });
  await signIn(page);
  await expect(page.locator("nav [data-surface=api-keys]")).toHaveCount(0);

  await page.goto("/api-keys");
  const standIn = page.getByTestId("unavailable-surface");
  await expect(standIn).toBeVisible();
  await expect(standIn).toHaveAttribute("data-surface", "api-keys");
});

// Management keys stay admin-only in plan 69 slice 1. A refused read hides
// the entry, but a direct URL must explain the refusal rather than absence.
// This injects a 403 in the password/key lane; it does not resolve an OIDC role.
test("a forbidden key list hides only its entry and explains itself", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__forbid`, {
    data: { paths: ["api/console/organizations/default/workspaces"] },
  });
  await signIn(page);
  await page.goto("/api-keys");

  const state = page.getByTestId("error-state");
  await expect(state).toBeVisible();
  await expect(state).toHaveAttribute("data-error-status", "403");
  await expect(state).toHaveAttribute("data-denied", "true");
  await expect(page.getByTestId("unavailable-surface")).toHaveCount(0);
  await expect(page.locator("nav [data-surface=api-keys]")).toHaveCount(0);
  await expect(page.locator("nav [data-surface=agents]")).toBeVisible();
  await expect(
    page.getByText("this route requires the admin role"),
  ).toBeVisible();
});
