import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

const SESSION = "/sessions/sesn_gatedbash00000000001";
test.beforeEach(async ({ request }) => {
  expect((await request.post("http://127.0.0.1:18080/__reset")).ok()).toBe(
    true,
  );
});

test("inspector tabs preserve the live transcript and restore an exact event URL", async ({
  page,
}) => {
  await signIn(page, SESSION);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  const count = await page
    .getByTestId("events-toolbar")
    .getAttribute("data-total-events");
  const session = page.getByRole("tab", { name: "Session", exact: true });
  await session.focus();
  await session.press("ArrowRight");
  await expect(page).toHaveURL(SESSION + "?inspector=events");
  await page
    .getByRole("combobox", { name: "Event type" })
    .selectOption("agent.tool_use");
  const event = page.getByTestId("inspector-event-row");
  await expect(event).toHaveCount(1);
  const id = await event.getAttribute("data-event-id");
  await event.click();
  await expect(page).toHaveURL(SESSION + "?inspector=events&event=" + id);
  await page.reload();
  await expect(page.getByTestId("event-detail")).toHaveAttribute(
    "data-event-type",
    "agent.tool_use",
  );
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await expect(page.locator('[data-tool-name="bash"]')).toHaveAttribute(
    "data-call-count",
    "1",
  );
  await expect(page.getByTestId("events-toolbar")).toHaveAttribute(
    "data-total-events",
    count!,
  );
  await page.goBack();
  await expect(
    page.getByRole("tab", { name: "Events", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("event-detail")).toBeVisible();
});

test("search and inline approvals leave the persisted trace inspectable", async ({
  page,
}) => {
  await signIn(page, SESSION);
  const tool = page
    .getByTestId("event-row")
    .filter({ has: page.getByTestId("approval-banner") });
  await expect(tool).toHaveAttribute("data-event-type", "agent.tool_use");
  await tool.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(page.getByTestId("approval-banner")).toHaveCount(0);
  await page.getByLabel("Find in transcript").fill("skipping");
  await expect(page.getByTestId("event-row")).toHaveCount(1);
  await page.getByRole("tab", { name: "Events", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Event type" })
    .selectOption("user.tool_confirmation");
  await expect(page.getByTestId("inspector-event-row")).toHaveCount(1);
  await page.getByTestId("inspector-event-row").click();
  await expect(page.getByTestId("event-detail")).toHaveAttribute(
    "data-event-type",
    "user.tool_confirmation",
  );
});

test("narrow transcript and inspector remain accessible, resizable and keyboard reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, SESSION + "?inspector=closed");
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const open = page.getByRole("button", { name: "Open session inspector" });
  await open.click();
  await page.getByRole("tab", { name: "Session", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Threads", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Events", exact: true }).click();
  await page.getByTestId("inspector-event-row").first().click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Close session inspector" })
    .press("Escape");
  await expect(open).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await open.click();
  const resize = page.getByRole("separator", {
    name: "Resize session inspector",
  });
  const width = Number(await resize.getAttribute("aria-valuenow"));
  await resize.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", String(width + 32));
});
