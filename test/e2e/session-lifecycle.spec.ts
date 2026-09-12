import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("edit metadata, archive and delete a session", async ({ page }) => {
  await signIn(page);
  await page.goto("/sessions/sesn_gatedbash00000000001");
  await page.getByRole("button", { name: "Edit session" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Renamed session");
  await page
    .getByLabel("Metadata changes (JSON)")
    .fill('{"owner":"ops","ticket":"42"}');
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Renamed session" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit session" }).click();
  await page.getByLabel("Metadata changes (JSON)").fill('{"ticket":null}');
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const saved = await (
    await page.request.get(
      "/api/platform/v1/sessions/sesn_gatedbash00000000001",
    )
  ).json();
  expect(saved.metadata).toEqual({ owner: "ops" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Close session inspector" }).click();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/sessions$/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/sessions/sesn_gatedbash00000000001");
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Message to the session")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toBeHidden();
  await expect(page.getByRole("button", { name: "Edit session" })).toBeHidden();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByText("Renamed session")).toBeHidden();
});

test("a running session's deletion refusal is visible", async ({ page }) => {
  await signIn(page);
  await page.goto("/sessions/sesn_research0000000000001");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(
    page.getByText(
      "session is running; send user.interrupt before archiving or deleting",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sessions\/sesn_research0000000000001$/);
});

test("direct archive preserves an inspector's filters and prevents duplicate pending requests", async ({
  page,
}) => {
  const id = "sesn_gatedbash00000000001";
  const url = `/sessions?order=asc&session=${id}`;
  await signIn(page, url);
  const panel = page.getByRole("region", { name: "Session details" });
  await expect(
    panel.getByRole("heading", { name: "Latest activity" }),
  ).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route(
    `**/api/platform/v1/sessions/${id}/archive`,
    async (route) => {
      calls++;
      await gate;
      await route.continue();
    },
  );
  try {
    await panel.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).press("Enter");
    await expect.poll(() => calls).toBe(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await panel.getByRole("button", { name: "More actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Archive" }),
    ).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("Escape");
  } finally {
    release();
  }
  await expect(panel.getByText("archived", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(url);
  expect(calls).toBe(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("archive refusal stays on the Session and never interrupts it implicitly", async ({
  page,
}) => {
  const id = "sesn_research0000000000001";
  await signIn(page, `/sessions/${id}`);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      writes.push(new URL(request.url()).pathname);
  });
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("Archive failed", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "session is running; send user.interrupt before archiving or deleting",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(`/sessions/${id}`);
  expect(writes).toEqual([`/api/platform/v1/sessions/${id}/archive`]);
  await expect(
    page.getByRole("button", { name: "Interrupt", exact: true }),
  ).toBeEnabled();
});

test("session deletion removes outputs and keeps uploaded files", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_research0000000000001");
  await page.getByRole("button", { name: "Interrupt", exact: true }).click();
  await expect(
    page.locator('[data-testid="session-effective-status"]'),
  ).toHaveAttribute("data-status", "idle");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await page.goto("/sessions/sesn_research0000000000001");
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  // Archiving preserves the deliverables. Deleting is the destructive boundary.
  expect(
    (
      await page.request.get("/api/platform/v1/files/file_output000000000001")
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await page.getByRole("link", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "research-notes.md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "summary.xlsx", exact: true }),
  ).toBeHidden();
  expect(
    (
      await page.request.get("/api/platform/v1/files/file_output000000000001")
    ).status(),
  ).toBe(404);
});
