import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const MOCK = "http://127.0.0.1:18080";

// These cases inject platform-shaped refusals in the password/key lane. They
// test presentation, not OIDC sign-in or the platform's stored-role resolution.
test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

test("a denied collection read hides its entry and explains a detail bookmark", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__forbid`, { data: { paths: ["v1/skills"] } });
  await signIn(page);
  await page.goto("/skills/skill_reportwriter0000001");

  const state = page.getByTestId("error-state");
  await expect(state).toBeVisible();
  await expect(state).toHaveAttribute("data-error-status", "403");
  await expect(state).toHaveAttribute("data-denied", "true");
  await expect(
    page.getByText("this route requires the developer role"),
  ).toBeVisible();
  await expect(page.getByTestId("unavailable-surface")).toHaveCount(0);
  await expect(page.locator("nav [data-surface=skills]")).toHaveCount(0);
  await expect(page.locator("nav [data-surface=agents]")).toBeVisible();
});

test("refused resource reads leave only local entry points", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__forbid`, {
    data: {
      paths: ["v1/", "api/console/", "admin/v1/"],
    },
  });
  await signIn(page);
  await page.goto("/dashboard");
  await expect(page.locator("nav [data-surface]")).toHaveCount(0);
  await expect(page.locator("[data-dashboard-card]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Get API key" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Build an agent" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Explore docs" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Dashboard" })).toBeVisible();
});

// Read success is no promise of write access. This injected refusal is not a
// platform read-only role: plan 69 has no such role.
test("a denied write keeps readable resources and the console session", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Environments", exact: true }).click();
  await page.getByRole("button", { name: "Create environment" }).click();
  await page.getByLabel("Name").fill("role-check");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create environment", exact: true })
    .click();
  await expect(page).toHaveURL(/\/environments\/env_mock/);

  const id = new URL(page.url()).pathname.split("/").pop();
  await request.post(`${MOCK}/__forbid`, {
    data: { paths: [`v1/environments/${id}/archive`] },
  });

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive environment" }).click();

  await expect(page.getByText("Archive failed")).toBeVisible();
  await expect(
    page.getByText(/this route requires the developer role/),
  ).toBeVisible();
  await expect(page.getByText("archived", { exact: true })).toHaveCount(0);
  await expect(page.locator("nav [data-surface=environments]")).toBeVisible();
  await expect(page.getByTestId("unavailable-surface")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "role-check" })).toBeVisible();
});

test("gateway read and write refusals use the platform's current messages", async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(`${MOCK}/__forbid`, {
    data: { paths: ["admin/v1/providers"] },
  });
  const read = await page.request.get("/api/gateway/admin/v1/providers");
  expect(read.status()).toBe(403);
  expect((await read.json()).error).toEqual({
    type: "permission_error",
    message: "this request needs the developer role; yours is user",
  });
  const write = await page.request.post("/api/gateway/admin/v1/providers", {
    data: {},
  });
  expect(write.status()).toBe(403);
  expect((await write.json()).error).toEqual({
    type: "permission_error",
    message: "this request needs the admin role; yours is developer",
  });
  await page.goto("/providers");
  await expect(page.getByTestId("error-state")).toHaveAttribute(
    "data-denied",
    "true",
  );
  await expect(page.locator("nav [data-surface=providers]")).toHaveCount(0);
  await expect(page.locator("nav [data-surface=models]")).toBeVisible();
});
