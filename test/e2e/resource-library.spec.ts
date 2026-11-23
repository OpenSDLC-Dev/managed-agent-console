import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { signIn } from "./sign-in";
import { browserPost } from "./browser-write";

const files = "/api/organizations/default/proxy/v1/files";
const skills = "/api/organizations/default/proxy/v1/skills";
const notes = "file_notes0000000000001";
const custom = "skill_reportwriter0000001";
const text = (name: string) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from("Regression fixture."),
});
const manifest = (name: string) => ({
  name: "SKILL.md",
  mimeType: "text/markdown",
  buffer: Buffer.from(
    "---\nname: " +
      name +
      "\ndescription: Test instructions.\n---\nWrite a summary.",
  ),
});

test.beforeEach(async ({ request }) => {
  expect(
    (await request.post("http://127.0.0.1:18080/__reset")).ok(),
  ).toBeTruthy();
});

async function openFileUpload(page: Page) {
  await page
    .getByRole("button", { name: "Upload file", exact: true })
    .first()
    .click();
  return page.getByRole("dialog", { name: "Upload file" });
}

test("file staging, cancel, submit, row menu and named delete confirmation", async ({
  page,
}) => {
  await signIn(page, "/files");
  const dialog = await openFileUpload(page);
  await dialog.getByLabel("File to upload").setInputFiles(text("review.txt"));
  await dialog.getByRole("button", { name: "Remove review.txt" }).click();
  await expect(
    dialog.getByRole("button", { name: "Remove review.txt" }),
  ).toBeHidden();
  await dialog.getByLabel("File to upload").setInputFiles(text("review.txt"));
  await page.keyboard.press("Escape");
  const row = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "review.txt", exact: true }),
  });
  await expect(row).toHaveCount(0);
  await openFileUpload(page);
  await expect(
    dialog.getByRole("button", { name: "Remove review.txt" }),
  ).toBeHidden();
  await dialog.getByLabel("File to upload").setInputFiles(text("review.txt"));
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(row).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Download review.txt" }),
  ).toBeDisabled();
  await row.getByRole("button", { name: "Actions for review.txt" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete file?" });
  await expect(confirmation).toContainText("review.txt");
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Actions for review.txt" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await confirmation
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});

test("file lookup, copy, drawer tabs, neighbor navigation, history and downloads", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, "/files");
  const seed = await browserPost(page, files, {
    multipart: { file: text("neighbor.txt") },
  });
  const neighbor = (await seed.json()).id as string;
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: "research-notes.md" });
  await row.getByRole("button", { name: "Copy " + notes }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(notes);
  const panel = page.getByRole("region", { name: "File details" });
  await expect(panel).toBeHidden();
  await row
    .getByRole("cell", { name: "research-notes.md", exact: true })
    .click();
  await expect(page).toHaveURL("/files?file=" + notes);
  await expect(
    panel.getByText("Only agent-generated files can be downloaded."),
  ).toBeVisible();
  await panel.getByText("API", { exact: true }).click();
  await expect(panel.locator("pre")).toContainText('"downloadable": false');
  await panel.getByRole("button", { name: "Previous file" }).click();
  await expect(panel).toHaveAttribute("data-file-id", neighbor);
  await page.goBack();
  await expect(panel).toHaveAttribute("data-file-id", notes);
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
  const lookup = page.getByRole("textbox", { name: "Find file by ID" });
  await lookup.fill("unknown-file");
  await expect(
    page.getByRole("heading", { name: "File not found" }),
  ).toBeVisible();
  await lookup.fill(".");
  await lookup.press("Enter");
  await expect(
    page.getByRole("heading", { name: "File not found" }),
  ).toBeVisible();
  // The generated output is outside the unscoped list, even on its first page.
  await lookup.fill("file_output000000000001");
  await lookup.press("Enter");
  const hit = page.getByRole("row").filter({ hasText: "summary.xlsx" });
  await expect(hit).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await hit.getByRole("cell", { name: "summary.xlsx", exact: true }).click();
  const saved = page.waitForEvent("download");
  await panel.getByRole("link", { name: "Download", exact: true }).click();
  expect((await saved).suggestedFilename()).toBe("summary.xlsx");
  await panel.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(row).toBeVisible();
});

test("bulk file deletion retries only refused IDs and restores the empty upload entry", async ({
  page,
}) => {
  await signIn(page, "/files");
  const seeded = await browserPost(page, files, {
    multipart: { file: text("retry.txt") },
  });
  const { id } = await seeded.json();
  await page.reload();
  await page.getByRole("checkbox", { name: "Select all rows" }).check();
  await expect(page.locator("[data-selected-count]")).toHaveAttribute(
    "data-selected-count",
    "2",
  );
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select all rows" }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Select all rows" }).check();
  await page.route("**" + files + "/" + id, async (route) => {
    if (route.request().method() === "DELETE")
      await route.fulfill({
        status: 409,
        json: {
          type: "error",
          error: { type: "conflict_error", message: "File is in use" },
        },
      });
    else await route.continue();
  });
  let deletes = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE" && request.url().endsWith("/" + notes))
      deletes++;
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Delete 2 files" }).click();
  await expect(dialog.getByRole("alert")).toContainText("File is in use");
  await expect(page.locator("[data-selected-count]")).toHaveAttribute(
    "data-selected-count",
    "1",
  );
  await page.unroute("**" + files + "/" + id);
  await dialog.getByRole("button", { name: "Delete 1 file" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "No files yet" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload file" })).toHaveCount(
    2,
  );
  expect(deletes).toBe(1);
});

test("skill creation stays on the list, Update stages a new version, version actions and skill deletion work", async ({
  page,
}) => {
  await signIn(page, "/skills?skill=xlsx");
  const panel = page.getByRole("region", { name: "Skill details" });
  await expect(panel).toHaveAttribute("data-skill-id", "xlsx");
  await page
    .getByRole("button", { name: "Create skill", exact: true })
    .press("Enter");
  const create = page.getByRole("dialog", { name: "Create skill" });
  await create.getByRole("button", { name: "Create skill" }).click();
  await expect(create.getByRole("alert")).toBeVisible();
  await create
    .getByLabel("Skill files")
    .setInputFiles(manifest("release-notes"));
  await create.getByRole("button", { name: "Remove SKILL.md" }).click();
  await create
    .getByLabel("Skill files")
    .setInputFiles(manifest("release-notes"));
  const created = page.waitForResponse(
    (r) => r.url().endsWith(skills) && r.request().method() === "POST",
  );
  await create.getByRole("button", { name: "Create skill" }).click();
  const response = await created;
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).display_name).toBe("release-notes");
  const skill = await response.json();
  await expect(page).toHaveURL("/skills");
  await expect(panel).toBeHidden();
  const row = page.getByRole("row").filter({
    has: page.getByRole("button", { name: "Copy " + skill.id, exact: true }),
  });
  await expect(row).toBeVisible();
  await row
    .getByRole("button", { name: "Actions for " + skill.display_name })
    .click();
  await page.getByRole("menuitem", { name: "Update" }).click();
  const update = page.getByRole("dialog", { name: "Update skill" });
  await update
    .getByLabel("Skill files")
    .setInputFiles(manifest("release-notes"));
  await page.keyboard.press("Escape");
  await row
    .getByRole("cell", { name: skill.display_name, exact: true })
    .click();
  await panel.getByRole("button", { name: "Update" }).click();
  await expect(
    update.getByRole("button", { name: "Remove SKILL.md" }),
  ).toHaveCount(0);
  await update
    .getByLabel("Skill files")
    .setInputFiles(manifest("release-notes"));
  await update.getByRole("button", { name: "Create version" }).click();
  await expect(panel.locator("[data-version-id]")).toHaveCount(2);
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Version created" });
  await expect(toast).toBeVisible();
  const rendered = panel.getByText("Rendered", { exact: true });
  const controlBounds = await rendered.boundingBox();
  await expect
    .poll(async () => {
      const bounds = await toast.boundingBox();
      return bounds && bounds.y + bounds.height <= controlBounds!.y;
    })
    .toBe(true);
  await panel.getByText("API", { exact: true }).click();
  await expect(panel.locator("pre")).toContainText(skill.id);
  await rendered.click();
  const latest = panel
    .locator("[data-version-id]")
    .filter({ has: page.locator("[data-latest=true]") });
  const versionId = await latest.getAttribute("data-version-id");
  await latest.hover();
  const saved = page.waitForEvent("download");
  await latest
    .getByRole("link", { name: "Download version " + versionId })
    .click();
  expect((await saved).suggestedFilename()).toBe(versionId + ".zip");
  await latest
    .getByRole("button", { name: "Delete version " + versionId })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete version", exact: true })
    .click();
  await expect(panel.locator("[data-version-id]")).toHaveCount(1);
  await panel.getByRole("button", { name: "Close details" }).click();
  await row
    .getByRole("button", { name: "Actions for " + skill.display_name })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText(skill.display_name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete skill" })
    .click();
  await expect(row).toHaveCount(0);
});

test("deleting the last row on the final cursor page returns to the remaining files", async ({
  page,
}) => {
  await signIn(page, "/files");
  const seed = await browserPost(page, files, {
    multipart: { file: text("first-page.txt") },
  });
  expect(seed.ok()).toBeTruthy();
  await page.route("**" + files + "?*", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", "1");
    await route.continue({ url: url.href });
  });
  await page.reload();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByRole("cell", { name: "research-notes.md", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Select all rows" }).check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete 1 file" })
    .click();
  await expect(
    page.getByRole("cell", { name: "first-page.txt", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "No files yet" })).toHaveCount(
    0,
  );
});

test("skill selection protects catalog skills and allows confirmed deletion of custom skills", async ({
  page,
}) => {
  await signIn(page, "/skills");
  await page.getByRole("checkbox", { name: "Select all rows" }).check();
  await expect(
    page.getByRole("button", { name: "Delete", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Select Excel spreadsheets" })
    .uncheck();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Existing code");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("checkbox", { name: "Select Weekly report writer" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete 1 skill" }).click();
  await expect(
    page.getByRole("button", { name: "Copy " + custom, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Excel spreadsheets", exact: true }),
  ).toBeVisible();
});

test("lookup reaches an off-page skill and a failed read stays distinguishable from a missing ID", async ({
  page,
}) => {
  await page.route("**" + skills + "?*", async (route) => {
    const response = await route.fetch();
    const list = await response.json();
    await route.fulfill({
      response,
      json: {
        ...list,
        data: list.data.filter((row: { id: string }) => row.id !== custom),
        has_more: true,
        next_page: "next-skill-page",
      },
    });
  });
  await signIn(page, "/skills");
  await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();
  await expect(
    page.getByRole("cell", { name: "Weekly report writer", exact: true }),
  ).toHaveCount(0);
  const lookup = page.getByRole("textbox", { name: "Find skill by ID" });
  await lookup.fill(custom);
  await lookup.press("Enter");
  const panel = page.getByRole("region", { name: "Skill details" });
  await expect(panel).toHaveAttribute("data-skill-id", custom);
  await panel.getByRole("button", { name: "Close details" }).click();
  await page.route("**" + skills + "/unavailable-skill", (route) =>
    route.fulfill({
      status: 503,
      json: {
        type: "error",
        error: { type: "api_error", message: "Temporary storage failure" },
      },
    }),
  );
  await lookup.fill("unavailable-skill");
  await expect(page.getByTestId("error-state")).toContainText(
    "Temporary storage failure",
  );
  await expect(
    page.getByRole("heading", { name: "Skill not found" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(
    page.getByRole("cell", { name: "Excel spreadsheets", exact: true }),
  ).toBeVisible();
});

test("a slow exact lookup respects Back to a different skill", async ({
  page,
}) => {
  await signIn(page, "/skills?skill=xlsx");
  const panel = page.getByRole("region", { name: "Skill details" });
  await panel.getByRole("button", { name: "Close details" }).click();
  await expect(page).toHaveURL("/skills");
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**" + skills + "/" + custom, async (route) => {
    await pending;
    await route.continue();
  });
  const lookup = page.getByRole("textbox", { name: "Find skill by ID" });
  const requested = page.waitForRequest((req) =>
    req.url().endsWith(skills + "/" + custom),
  );
  try {
    await lookup.fill(custom);
    await lookup.press("Enter");
    await requested;
    await page.goBack();
    await expect(panel).toHaveAttribute("data-skill-id", "xlsx");
  } finally {
    finish();
  }
  await expect(
    page.getByRole("cell", { name: "Weekly report writer", exact: true }),
  ).toBeVisible();
  await expect(panel).toHaveAttribute("data-skill-id", "xlsx");
  await expect(page).toHaveURL("/skills?skill=xlsx");
});

test("drop a file and create a skill from a folder with nested files", async ({
  page,
}, testInfo) => {
  await signIn(page, "/files");
  const upload = await openFileUpload(page);
  const transfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["test"], "drop.txt", { type: "text/plain" }));
    return transfer;
  });
  await upload
    .getByText("Drop a file here")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    upload.getByRole("button", { name: "Remove drop.txt" }),
  ).toBeVisible();
  await upload.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "drop.txt", exact: true }),
  ).toBeVisible();
  await page.goto("/skills");
  const folder = testInfo.outputPath("folder-skill");
  await mkdir(join(folder, "notes"), { recursive: true });
  await writeFile(join(folder, "SKILL.md"), manifest("folder-skill").buffer);
  await writeFile(join(folder, "notes", "example.txt"), "Example.");
  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  const create = page.getByRole("dialog");
  await create.getByLabel("Skill folder").setInputFiles(folder);
  await expect(
    create.getByRole("button", {
      name: "Remove folder-skill/notes/example.txt",
    }),
  ).toBeVisible();
  await create.getByRole("button", { name: "Create skill" }).click();
  await expect(
    page.getByRole("cell", { name: "folder-skill", exact: true }),
  ).toBeVisible();
});
