import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

// During a quick reopen, the fading-out form is still editable to Playwright.
// Wait for the new open state before filling so its draft reset has committed.
async function openCreatedFilter(page: Page) {
  const trigger = page.getByLabel("Created filter");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const filter = page.getByRole("region", { name: "Created date filter" });
  await expect(filter).toHaveAttribute("data-open", "");
  await expect
    .poll(() => filter.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
}

for (const route of ["agents", "sessions", "memory-stores"]) {
  test(`${route}: custom bounds apply only on Apply, support one side and reset pagination`, async ({
    page,
  }) => {
    await signIn(page, `/${route}`);
    await openCreatedFilter(page);
    await page.getByRole("button", { name: "Custom range" }).click();
    await page
      .getByRole("textbox", { name: "Start", exact: true })
      .fill("2026-08-01");
    await page
      .getByRole("textbox", { name: "End", exact: true })
      .fill("2026-08-02");
    const sent = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/platform/v1/${route.replaceAll("-", "_")}?`) &&
        new URL(req.url()).searchParams.has("created_at[lte]"),
    );
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    const params = new URL((await sent).url()).searchParams;
    expect(params.has("page")).toBe(false);
    const bounds = await page.evaluate(() => ({
      start: new Date(2026, 7, 1).toISOString(),
      end: new Date(2026, 7, 2, 23, 59, 59, 999)
        .toISOString()
        .replace("999Z", "999999Z"),
    }));
    expect(params.get("created_at[gte]")).toBe(bounds.start);
    expect(params.get("created_at[lte]")).toBe(bounds.end);
    await expect(page.getByLabel("Created filter")).toHaveAttribute(
      "data-value",
      "custom",
    );
    await openCreatedFilter(page);
    await page
      .getByRole("textbox", { name: "Start", exact: true })
      .fill("2026-02-30");
    await expect(
      page.getByRole("button", { name: "Apply", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await openCreatedFilter(page);
    await expect(
      page.getByRole("textbox", { name: "Start", exact: true }),
    ).toHaveValue("2026-08-01");
    await page.getByRole("textbox", { name: "Start", exact: true }).fill("");
    const oneSided = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/platform/v1/${route.replaceAll("-", "_")}?`) &&
        new URL(req.url()).searchParams.has("created_at[lte]") &&
        !new URL(req.url()).searchParams.has("created_at[gte]"),
    );
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await oneSided;
    await openCreatedFilter(page);
    await page.getByRole("button", { name: "Open End calendar" }).click();
    await expect(
      page.getByRole("group", { name: "End calendar" }),
    ).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("textbox", { name: "End", exact: true }),
    ).toHaveValue("2026-08-03");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await openCreatedFilter(page);
    await page.getByRole("button", { name: "Open End calendar" }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
}
