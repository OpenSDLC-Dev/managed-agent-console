import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

const store = "memstore_projectnotes000001";
const memory = "mem_projectbrief000000001";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("store inspector preserves list state and opens nested memories with rendered/raw editing", async ({
  page,
}, info) => {
  await signIn(page, "/memory-stores?status=all");
  await page.getByRole("cell", { name: "Project notes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("status=all&store=" + store));
  const panel = page.getByRole("region", { name: "Memory store details" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "API", exact: true }).click();
  await expect(panel).toContainText('"type": "memory_store"');
  await panel.getByRole("button", { name: "Rendered", exact: true }).click();
  await panel.getByRole("treeitem", { name: "decisions", exact: true }).click();
  await panel.getByRole("treeitem", { name: /architecture.md/ }).click();
  await expect(page).toHaveURL(
    /\/memory-stores\/memstore_projectnotes000001\?memory=mem_decision/,
  );
  await expect(page.getByTestId("memory-preview-content")).toContainText(
    "Use the platform wire",
  );
  await page.getByRole("treeitem", { name: /brief.md/ }).click();
  await expect(
    page.getByRole("heading", { name: "Project brief", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  await expect(page.getByTestId("memory-preview-content")).toContainText(
    "# Project brief",
  );
  await page.getByRole("button", { name: "Edit memory", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Memory content", exact: true })
    .fill("# Saved notes\n\nExact bytes.\n");
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/memories/"),
  );
  await page
    .getByRole("textbox", { name: "Memory content", exact: true })
    .press("Control+Enter");
  expect((await saved).ok()).toBe(true);
  await page.getByRole("button", { name: "Rendered", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Saved notes", exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Memory actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Download", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("brief.md");
  const file = info.outputPath("brief.md");
  await download.saveAs(file);
  expect(await readFile(file, "utf8")).toBe("# Saved notes\n\nExact bytes.\n");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved notes", exact: true }),
  ).toBeVisible();
});

test("tree supports keyboard traversal and guards dirty selection on a narrow viewport", async ({
  page,
}) => {
  await signIn(page, `/memory-stores/${store}?memory=${memory}`);
  const folder = page.getByRole("treeitem", { name: "decisions", exact: true });
  await folder.focus();
  await page.keyboard.press("ArrowRight");
  const child = page.getByRole("treeitem", { name: /architecture.md/ });
  await expect(child).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(child).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(folder).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("treeitem", { name: /brief.md/ })).toBeFocused();
  await page.getByRole("button", { name: "Edit memory", exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "Memory content",
    exact: true,
  });
  await input.fill("Draft");
  await input.press("Tab");
  await expect(input).toHaveValue("Draft  ");
  await input.press("Escape");
  await page.keyboard.press("Tab");
  await expect(input).not.toBeFocused();
  await child.click();
  const prompt = page.getByRole("dialog", {
    name: "Unsaved changes",
    exact: true,
  });
  await prompt.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(input).toHaveValue("Draft  ");
  await child.click();
  await prompt.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page.getByTestId("memory-preview-content")).toContainText(
    "Use the platform wire",
  );
  await expect(prompt).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("stale inline saves retain the draft and report the platform precondition failure", async ({
  page,
  request,
}) => {
  await signIn(page, `/memory-stores/${store}?memory=${memory}`);
  await page.getByRole("button", { name: "Edit memory", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Memory content", exact: true })
    .fill("Local edit");
  const external = await request.post(
    `http://127.0.0.1:18080/v1/memory_stores/${store}/memories/${memory}?view=full`,
    {
      headers: { "x-api-key": "test-key" },
      data: { content: "External edit" },
    },
  );
  expect(external.ok()).toBe(true);
  const response = page.waitForResponse(
    (response) => response.status() === 409,
  );
  await page.getByRole("button", { name: /^Save/ }).click();
  await response;
  await expect(
    page.getByRole("textbox", { name: "Memory content", exact: true }),
  ).toHaveValue("Local edit");
  await expect(
    page.getByRole("region", { name: "Memory preview" }).getByRole("alert"),
  ).toContainText(/precondition|changed|sha256/i);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("memory-preview-content")).toContainText(
    "External edit",
  );
});

test("rendering agent-written Markdown does not fetch remote images", async ({
  page,
  request,
}) => {
  let imageRequests = 0;
  await page.route("https://memory-assets.example/**", (route) => {
    imageRequests++;
    return route.abort();
  });
  const response = await request.post(
    "http://127.0.0.1:18080/v1/memory_stores/" +
      store +
      "/memories/" +
      memory +
      "?view=full",
    {
      headers: { "x-api-key": "test-key" },
      data: {
        content: "![diagram](https://memory-assets.example/diagram.png)",
      },
    },
  );
  expect(response.ok()).toBe(true);
  await signIn(page, "/memory-stores/" + store + "?memory=" + memory);
  await expect(
    page.getByRole("link", { name: "Open image: diagram" }),
  ).toHaveAttribute("href", "https://memory-assets.example/diagram.png");
  await expect(
    page.getByRole("region", { name: "Memory preview" }).locator("img"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  expect(imageRequests).toBe(0);
});
