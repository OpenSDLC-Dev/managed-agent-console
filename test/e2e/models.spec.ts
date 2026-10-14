import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const MOCK = "http://127.0.0.1:18080";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

/**
 * Plan 10 slice 3: the model gateway's models (its aliases), through the
 * `/api/gateway` BFF to the mock gateway on its own port.
 */
test("add a model with a fallback tier, edit its routing, then delete it", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("nav [data-surface=models]").click();
  await expect(page).toHaveURL(/\/models$/);

  await page.getByRole("button", { name: "Add model" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("coder");
  await dialog
    .getByLabel("Primary upstream model 1", { exact: true })
    .selectOption("gwdep_mmm30001");
  await dialog.getByRole("button", { name: "Add fallback tier" }).click();
  await dialog
    .getByLabel("Fallback 1 upstream model 1", { exact: true })
    .selectOption("gwdep_dsflash01");
  await dialog.getByRole("button", { name: "Add model" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: "coder" });
  await expect(row.locator("[data-tiers]")).toHaveAttribute("data-tiers", "2");
  await row.click();
  await expect(page).toHaveURL(/\/models\?model=coder$/);
  const panel = page.getByRole("region", { name: "Model details" });
  await expect(panel.locator("[data-priority]")).toHaveCount(2);

  // Split the primary tier 1:1 with another upstream model.
  await panel.getByRole("button", { name: "Edit routing" }).click();
  await dialog
    .getByRole("button", { name: "Add upstream model" })
    .first()
    .click();
  await dialog
    .getByLabel("Primary upstream model 2", { exact: true })
    .selectOption("gwdep_dspro0001");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.locator("[data-priority='0'] [data-share]")).toHaveCount(
    2,
  );
  await expect(
    panel.locator("[data-priority='0'] [data-share]").first(),
  ).toHaveAttribute("data-share", "0.5");

  await panel.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete model" }).click();
  await expect(page).toHaveURL(/\/models$/);
  await expect(page.getByRole("row").filter({ hasText: "coder" })).toHaveCount(
    0,
  );
});

test("the gateway's refusal to delete a model a key is granted reaches the operator", async ({
  page,
}) => {
  await signIn(page, "/models?model=deepseek-flash");
  const panel = page.getByRole("region", { name: "Model details" });
  await panel.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete model" }).click();
  // The store's own words name the keys in the way.
  await expect(page.getByText(/is granted to api keys/)).toBeVisible();
  await expect(panel).toBeVisible();
});

test("a model name with a slash routes to its own path", async ({ page }) => {
  await signIn(page, "/models");
  await page.getByRole("button", { name: "Add model" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Qwen/Qwen3-Coder");
  await dialog
    .getByLabel("Primary upstream model 1", { exact: true })
    .selectOption("gwdep_dsflash01");
  await dialog.getByRole("button", { name: "Add model" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("row").filter({ hasText: "Qwen/Qwen3-Coder" }).click();
  const panel = page.getByRole("region", { name: "Model details" });
  await panel.getByRole("button", { name: "Edit routing" }).click();
  await dialog.getByLabel("Display name").fill("Coder");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText("Coder · created")).toBeVisible();
});

test("a fresh gateway's first model, set up in one form", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__empty-gateway`);
  await signIn(page, "/models");
  const callout = page.getByTestId("no-models");
  await callout.getByRole("button", { name: "Set up a model" }).click();
  const dialog = page.getByRole("dialog", { name: "Set up a model" });
  await dialog.getByLabel("Vendor").selectOption("deepseek");
  await dialog.getByLabel("API key").fill("sk-e2e-0123456789abcd");
  await dialog.getByLabel("Upstream model ID").fill("deepseek-v4-flash");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/models\?model=deepseek-v4-flash$/);
  await expect(callout).toBeHidden();
  const panel = page.getByRole("region", { name: "Model details" });
  await expect(panel.getByText("on DeepSeek")).toBeVisible();

  // The provider, its key and the upstream model are on Providers too.
  await page.goto("/providers");
  const provider = page.getByRole("row").filter({ hasText: "DeepSeek" });
  await expect(provider.locator("[data-count]")).toHaveText(["1", "1"]);
});
