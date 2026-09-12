import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("memory lookup reaches archived records and creation filtering resets pagination", async ({
  page,
  request,
}) => {
  for (let i = 0; i < 21; i++)
    await request.post("http://127.0.0.1:18080/v1/memory_stores", {
      headers: { "x-api-key": "test-key" },
      data: { name: "Page " + i },
    });
  await signIn(page, "/memory-stores");
  await expect(
    page.getByRole("columnheader", { name: "Created", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Description", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByRole("button", { name: "Previous page" }),
  ).toBeEnabled();
  await page.getByRole("combobox", { name: "Created filter" }).click();
  const changed = page.waitForRequest(
    (req) =>
      req.url().includes("/v1/memory_stores?") &&
      new URL(req.url()).searchParams.has("created_at[gte]"),
  );
  await page.getByRole("option", { name: "Last 7 days", exact: true }).click();
  expect(new URL((await changed).url()).searchParams.has("page")).toBe(false);
  await expect(
    page.getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  await page.getByRole("combobox", { name: "Created filter" }).click();
  await page.getByRole("option", { name: "All time", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Previous page" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Find memory store by ID" })
    .fill("memstore_archivednotes0001");
  await page
    .getByRole("textbox", { name: "Find memory store by ID" })
    .press("Enter");
  await expect(page).toHaveURL(
    /memory-stores\?store=memstore_archivednotes0001$/,
  );
  await expect(
    page.getByRole("heading", { name: "Archived notes", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Memory store details" }),
  ).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Find memory store by ID" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Find memory store by ID" })
    .fill("memstore_missing");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Memory store details" })
      .getByTestId("error-state"),
  ).toContainText(/not found/i);
});

test("deployment Agent filter submits the server predicate and lookup encodes path delimiters", async ({
  page,
}) => {
  await signIn(page, "/deployments");
  await expect(
    page.getByRole("columnheader", { name: "Trigger", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Created", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Agent filter" }).click();
  await page
    .getByRole("option", { name: "General task agent", exact: true })
    .click();
  await expect(
    page.getByText("Manual task runner", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Weekly research digest", { exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(360);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("textbox", { name: "Find deployment by ID" })
    .fill("depl_weeklyresearch000001");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Weekly research digest", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await page
    .getByRole("textbox", { name: "Find deployment by ID" })
    .fill("depl_bad?limit=100");
  const rejected = page.waitForResponse(
    (response) =>
      response.url().includes("depl_bad") && response.status() === 404,
  );
  await page.getByRole("button", { name: "Open", exact: true }).click();
  expect(await (await rejected).json()).toMatchObject({
    error: { type: "invalid_request_error" },
  });
  await expect(page.getByRole("alert")).toBeVisible();
});
