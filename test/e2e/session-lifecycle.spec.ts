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
      "Cannot delete session while it is running. Send an interrupt event or wait for the session to complete.",
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
      `Session ${id} cannot be archived while its status is "running". Only pending or idle sessions may be archived.`,
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(`/sessions/${id}`);
  expect(writes).toEqual([`/api/platform/v1/sessions/${id}/archive`]);
  await expect(
    page.getByRole("button", { name: "Interrupt", exact: true }),
  ).toBeEnabled();
});

test("archiving keeps a session's own files; deleting takes them and keeps the upload", async ({
  page,
}) => {
  const id = "sesn_research0000000000001";
  const output = "file_output000000000001";
  const copy = "file_researchcopy0000001";
  const status = async (path: string) =>
    (await page.request.get(`/api/platform/v1/${path}`)).status();
  await signIn(page);
  await page.goto(`/sessions/${id}`);
  await page.getByRole("button", { name: "Interrupt", exact: true }).click();
  await expect(
    page.locator('[data-testid="session-effective-status"]'),
  ).toHaveAttribute("data-status", "idle");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await page.goto(`/sessions/${id}?inspector=resources`);
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  // Archiving preserves the copy and the deliverable, still downloadable.
  const panel = page.getByTestId("session-resources");
  await expect(panel).toHaveAttribute("data-session-file-count", "2");
  await expect(panel.locator('[data-size-bytes="48213"]')).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "Download summary.xlsx" }),
  ).toHaveAttribute("href", `/api/platform/v1/files/${output}/content`);
  expect(await status(`files/${output}`)).toBe(200);
  expect(await status(`files/${copy}`)).toBe(200);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  // Deleting is the destructive boundary: the session's own files go with
  // it, and the upload its mount copied stays.
  expect(await status(`files/${output}`)).toBe(404);
  expect(await status(`files/${copy}`)).toBe(404);
  expect(
    (
      await (
        await page.request.get(`/api/platform/v1/files?scope_id=${id}`)
      ).json()
    ).data,
  ).toEqual([]);
  await page.getByRole("link", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "research-notes.md", exact: true }),
  ).toBeVisible();

  // A link to the deleted session answers with its 404, not a broken page.
  await page.goto(`/sessions/${id}?inspector=resources`);
  await expect(page.getByTestId("error-state")).toHaveAttribute(
    "data-error-status",
    "404",
  );
});
