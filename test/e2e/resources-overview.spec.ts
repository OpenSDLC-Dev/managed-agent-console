import { expect, test } from "@playwright/test";
import { browserPost } from "./browser-write";
import { signIn } from "./sign-in";

const mock = "http://127.0.0.1:18080";
const fileCollection = "/api/organizations/default/proxy/v1/files";
test.beforeEach(async ({ request }) => {
  expect((await request.post(mock + "/__reset")).ok()).toBeTruthy();
});

test("Resources lands on Overview, keeps the workspace selected and restores sidebar focus", async ({
  page,
}) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const group = nav.locator('[data-nav-group="Resources"]');
  await expect(group).toHaveAttribute("href", "/resources");
  await group.click();
  await expect(page).toHaveURL(/\/resources$/);
  const overview = nav.getByRole("link", { name: "Overview" });
  await expect(overview).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link")).toHaveText([
    "Overview",
    "Files",
    "Skills",
  ]);
  const workspace = nav.getByRole("combobox", { name: "Workspace" });
  const back = nav.getByRole("button", { name: /back to all sections/i });
  const workspaceBox = await workspace.boundingBox();
  expect(workspaceBox!.y - (await back.boundingBox())!.y).toBe(40);
  expect((await overview.boundingBox())!.y - workspaceBox!.y).toBe(40);
  await workspace.click();
  const current = page.getByRole("option", { name: "Default" });
  await expect(current).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(workspace).toBeFocused();
  await workspace.click();
  await current.click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(overview).toHaveAttribute("aria-current", "page");
  await back.click();
  await expect(group).toBeFocused();
  await expect(group).toContainText("Overview");
  await group.click();
  await expect(back).toBeFocused();
  const skills = page.getByRole("region", { name: "Skills" });
  await skills.getByRole("link", { name: "View all skills" }).click();
  await expect(page).toHaveURL(/\/skills$/);
  await expect(nav.getByRole("link", { name: "Skills" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goBack();
  await expect(overview).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: /Search Console/ }).click();
  await page
    .getByRole("combobox", { name: /Search/ })
    .fill("resources overview");
  await page.getByRole("option", { name: /Resources overview/i }).click();
  await expect(page).toHaveURL(/\/resources$/);
});

test("preview rows keep Platform order, count later pages and open the matching list drawer", async ({
  page,
}) => {
  await signIn(page);
  for (let i = 0; i < 22; i++) {
    const seeded = await browserPost(page, fileCollection, {
      multipart: {
        file: {
          name: "overview-" + i + ".txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Overview fixture"),
        },
      },
    });
    expect(seeded.ok()).toBeTruthy();
  }
  const first = await (
    await page.request.get(fileCollection + "?limit=3")
  ).json();
  await page.goto("/resources");
  const files = page.getByRole("region", { name: "Files" });
  const skills = page.getByRole("region", { name: "Skills" });
  await expect(files.locator("[data-count]")).toHaveAttribute(
    "data-count",
    "23",
  );
  await expect(skills.locator("[data-count]")).toHaveAttribute(
    "data-count",
    "2",
  );
  const rows = files.locator("a[data-resource-id]");
  await expect(rows).toHaveCount(3);
  expect(
    await rows.evaluateAll((links) =>
      links.map((link) => link.getAttribute("data-resource-id")),
    ),
  ).toEqual(first.data.map((file: { id: string }) => file.id));
  await expect(rows.first().locator("time")).toHaveAttribute(
    "datetime",
    first.data[0].created_at,
  );
  await rows.first().click();
  await expect(
    page.getByRole("region", { name: "File details" }),
  ).toHaveAttribute("data-file-id", first.data[0].id);
  await page.goBack();
  const custom = skills.locator('[data-source="custom"]').locator("..");
  await custom.click();
  await expect(
    page.getByRole("region", { name: "Skill details" }),
  ).toHaveAttribute("data-skill-id", "skill_reportwriter0000001");
  await page.goBack();
  await files.getByRole("link", { name: "View all files" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(page.getByRole("region", { name: "File details" })).toHaveCount(
    0,
  );
});

test("Add opens the file list or the skill creation dialog, and supports cancel and submit", async ({
  page,
}) => {
  await signIn(page, "/resources");
  const add = page.getByRole("button", { name: "Add", exact: true });
  await add.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem")).toHaveText(["File", "Skill"]);
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
  await add.click();
  await page.getByRole("menuitem", { name: "File", exact: true }).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Upload file", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Upload file" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goBack();
  await add.click();
  await page.getByRole("menuitem", { name: "Skill", exact: true }).click();
  await expect(page).toHaveURL(/\/skills\?create=true$/);
  const dialog = page.getByRole("dialog", { name: "Create skill" });
  await expect(dialog).toBeVisible();
  await page.reload();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/skills$/);
  await page.goBack();
  await add.click();
  await page.getByRole("menuitem", { name: "Skill", exact: true }).click();
  await dialog
    .getByLabel("Skill files")
    .setInputFiles({
      name: "SKILL.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "---\nname: overview-skill\ndescription: Overview fixture.\n---\nWrite a summary.",
      ),
    });
  await dialog
    .getByRole("button", { name: "Create skill", exact: true })
    .click();
  await expect(page).toHaveURL(/\/skills$/);
  await page.goBack();
  const skills = page.getByRole("region", { name: "Skills" });
  await expect(skills.locator("[data-count]")).toHaveAttribute(
    "data-count",
    "3",
  );
  await expect(
    skills.getByRole("link", { name: /overview-skill/ }),
  ).toBeVisible();
});

test("cards follow the content width and an empty collection keeps both list and Add actions", async ({
  page,
}) => {
  await page.route("**/proxy/v1/files?*", (route) =>
    route.fulfill({
      json: {
        data: [],
        next_page: null,
        has_more: false,
        first_id: null,
        last_id: null,
      },
    }),
  );
  await signIn(page, "/resources");
  const files = page.getByRole("region", { name: "Files" });
  const skills = page.getByRole("region", { name: "Skills" });
  await expect(files.getByText("No files yet")).toBeVisible();
  await expect(files.locator("[data-count]")).toHaveAttribute(
    "data-count",
    "0",
  );
  for (const [width, columns] of [
    [1440, 2],
    [900, 1],
    [390, 1],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    const f = (await files.boundingBox())!,
      s = (await skills.boundingBox())!;
    if (columns === 2) {
      expect(f.y).toBe(s.y);
      expect(s.x - (f.x + f.width)).toBe(16);
    } else {
      expect(f.x).toBe(s.x);
      expect(s.y - (f.y + f.height)).toBe(16);
    }
    expect(s.x + s.width).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "File", exact: true }),
  ).toBeVisible();
});

test("Overview only offers readable collections and hides its entry when both are refused", async ({
  page,
  request,
}) => {
  await request.post(mock + "/__forbid", { data: { paths: ["v1/skills"] } });
  await signIn(page, "/resources");
  await expect(page.getByRole("region", { name: "Files" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Skills" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["File"]);
  await request.post(mock + "/__forbid", {
    data: { paths: ["v1/files", "v1/skills"] },
  });
  await page.reload();
  await expect(page.getByTestId("error-state")).toHaveAttribute(
    "data-denied",
    "true",
  );
  await expect(page.locator('[data-nav-group="Resources"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toHaveCount(0);
});
