import { expect, test, type Page } from "@playwright/test";

/** Navigate to /login and wait until the form is hydrated and interactive. */
async function openLogin(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
}

test("unauthenticated visits redirect to the login gate", async ({ page }) => {
  await page.goto("/agents");
  await expect(page).toHaveURL(/\/login$/);
});

test("the BFF refuses unauthenticated API calls with the platform envelope shape", async ({
  request,
}) => {
  const response = await request.get("/api/platform/v1/agents");
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.type).toBe("error");
  expect(body.error.type).toBe("authentication_error");
});

test("wrong password is rejected; the right one lands on Agents", async ({
  page,
}) => {
  await openLogin(page);
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong password.")).toBeVisible();

  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible();
});

test("the shell shows all six resources and a live platform connection", async ({
  page,
}) => {
  await openLogin(page);
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);

  for (const item of [
    "Agents",
    "Sessions",
    "Environments",
    "Credential vaults",
    "Skills",
    "Files",
  ]) {
    await expect(
      page.getByRole("link", { name: item, exact: true }),
    ).toBeVisible();
  }

  // The probe goes through the BFF to the mock platform and comes back green.
  await expect(page.getByTestId("connection-dot")).toHaveAttribute(
    "data-state",
    "up",
    { timeout: 15_000 },
  );

  // Client-side navigation works.
  await page.getByRole("link", { name: "Sessions" }).click();
  await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
});
