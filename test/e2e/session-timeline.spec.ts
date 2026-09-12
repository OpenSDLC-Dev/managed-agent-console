import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

const SESSION = "/sessions/sesn_gatedbash00000000001";
test.beforeEach(async ({ request }) => {
  expect((await request.post("http://127.0.0.1:18080/__reset")).ok()).toBe(
    true,
  );
});

test("timeline zoom, event navigation and JSON download retain the complete loaded trace", async ({
  page,
}) => {
  await signIn(page, SESSION);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  const bar = page.getByRole("group", { name: "Event timeline" });
  await expect(bar).toHaveAttribute("data-timed-events", "7");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset timeline zoom" }),
  ).toHaveAttribute("data-zoom", "2");
  const end = bar.getByRole("button", { name: /^span.model_request_end/ });
  await end.focus();
  await end.press("Enter");
  await expect(page).toHaveURL(
    SESSION + "?event=sevt_000000000000000006&inspector=events",
  );
  await expect(page.getByTestId("event-detail")).toHaveAttribute(
    "data-event-type",
    "span.model_request_end",
  );
  await page
    .getByLabel("Find in transcript")
    .fill("no matching transcript text");
  const expected = await (
    await page.request.get(
      "/api/platform/v1/sessions/sesn_gatedbash00000000001/events",
    )
  ).json();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download events" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "sesn_gatedbash00000000001-events.json",
  );
  expect(JSON.parse(await readFile((await download.path())!, "utf8"))).toEqual(
    expected.data,
  );
  await page.getByRole("button", { name: "Reset timeline zoom" }).click();
  await expect(
    page.getByRole("button", { name: "Zoom out", exact: true }),
  ).toBeDisabled();
});

test("Thread details expose pinned metadata, server usage and an inspectable request chart at narrow widths", async ({
  page,
}) => {
  await signIn(page, SESSION + "?inspector=thread");
  const preview = page.getByRole("region", { name: "Thread details" });
  await expect(preview).toHaveAttribute(
    "data-inspected-thread-id",
    "sthr_gatedbashprimary00001",
  );
  await expect(preview.getByRole("link")).toHaveAttribute(
    "href",
    "/agents/agent_taskrunner0000000001?version=1",
  );
  await expect(
    preview.getByRole("img", { name: "Input tokens at each model request" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await preview.getByText("Inspect model requests", { exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await preview.locator("[data-event-id]").click();
  await expect(page.getByTestId("event-detail")).toHaveAttribute(
    "data-event-type",
    "span.model_request_end",
  );
  await expect(page).toHaveURL(/event=sevt_000000000000000006/);
});

test("pointer users can inspect every coincident marker at fit and zoomed scales", async ({
  page,
}) => {
  await signIn(page, SESSION);
  const bar = page.getByRole("group", { name: "Event timeline" });
  await expect(bar).toHaveAttribute("data-timed-events", "7");
  for (const zoom of [1, 2]) {
    if (zoom === 2)
      await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const ids = await bar
      .locator("[data-event-id]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-event-id")!),
      );
    for (const id of ids) {
      await bar.locator(`[data-event-id="${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`event=${id}`));
    }
  }
});
