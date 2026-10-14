import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const MOCK = "http://127.0.0.1:18080";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

/**
 * Plan 10 slice 2: the model gateway's providers, through the `/api/gateway`
 * BFF to the mock gateway on its own port (playwright.config.ts).
 */
test("add a provider from a vendor's published hosts, then disable it", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("nav [data-surface=providers]").click();
  await expect(page).toHaveURL(/\/providers$/);
  await expect(page.getByRole("cell", { name: "MiniMax CN" })).toBeVisible();

  await page.getByRole("button", { name: "Add provider" }).first().click();
  const dialog = page.getByRole("dialog");
  // The radios are visually hidden inside their cards; an operator clicks the
  // card, and so does this.
  await dialog.locator("[data-profile=minimax]").click();
  await dialog.locator("[data-region=international]").click();
  await expect(dialog.getByLabel("Name")).toHaveValue("MiniMax Intl");
  await dialog.getByRole("button", { name: "Add provider" }).click();

  await expect(page).toHaveURL(/\/providers\/gwprov_/);
  await expect(
    page.getByRole("heading", { level: 1, name: "MiniMax Intl" }),
  ).toBeVisible();
  await expect(
    page.getByText("https://api.minimax.io/anthropic"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Disable" }).click();
  await expect(page.locator("[data-enabled]")).toHaveAttribute(
    "data-enabled",
    "false",
  );

  await page.getByRole("link", { name: "Providers" }).first().click();
  await expect(page.getByRole("cell", { name: "MiniMax Intl" })).toBeVisible();
});

test("the gateway's refusal to delete a provider with upstream models reaches the operator", async ({
  page,
}) => {
  await signIn(page, "/providers/gwprov_deepseek01");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Delete/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Delete/ })
    .click();
  // The store's own words name the upstream models in the way.
  await expect(page.getByText(/has deployments/)).toBeVisible();
  await expect(page).toHaveURL(/\/providers\/gwprov_deepseek01$/);
});

test("a gateway that serves no admin API takes the screens with it", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__unimplemented`, {
    data: { surfaces: ["model-gateway"] },
  });
  await signIn(page);
  await expect(page.locator("nav [data-surface=agents]")).toBeVisible();
  await expect(page.locator("nav [data-surface=providers]")).toHaveCount(0);

  await page.goto("/providers");
  await expect(page.getByTestId("unavailable-surface")).toHaveAttribute(
    "data-surface",
    "providers",
  );
});
