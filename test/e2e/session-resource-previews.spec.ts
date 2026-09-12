import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

async function createSession(page: Page) {
  await signIn(page);
  const response = await page.request.post("/api/platform/v1/sessions", {
    data: {
      agent: "agent_taskrunner0000000001",
      environment_id: "env_cloudlimited000000001",
      title: "Resource inspection",
      resources: [
        {
          type: "memory_store",
          memory_store_id: "memstore_projectnotes000001",
          access: "read_only",
          instructions: "Use the recorded project notes.",
        },
        {
          type: "file",
          file_id: "file_notes0000000000001",
          mount_path: "/mnt/session/uploads/notes.md",
        },
        {
          type: "github_repository",
          url: "https://github.com/example/project",
          authorization_token: "test-only-repository-token",
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ id: string }>;
}

test.beforeEach(async ({ request }) => {
  expect((await request.post("http://127.0.0.1:18080/__reset")).ok()).toBe(
    true,
  );
});

test("nested memory selection keeps the Session open, renders Markdown/raw and restores focus", async ({
  page,
}) => {
  const session = await createSession(page);
  await page.goto(`/sessions/${session.id}?inspector=resources`);
  await page
    .getByRole("button", { name: "Inspect resource /mnt/memory/project-notes" })
    .click();
  await expect(
    page.getByRole("region", { name: "Resource preview" }),
  ).toContainText("Read only");
  await page
    .getByRole("button", { name: "Expand /mnt/memory/project-notes" })
    .click();
  const memory = page.getByRole("treeitem", { name: /brief.md/ });
  await memory.click();
  const preview = page.getByTestId("session-memory-preview");
  await expect(
    preview.getByRole("heading", { name: "Project brief" }),
  ).toBeVisible();
  await expect(
    preview.getByRole("link", { name: /Open in Memory stores/ }),
  ).toHaveAttribute(
    "href",
    "/memory-stores/memstore_projectnotes000001?memory=mem_projectbrief000000001",
  );
  await preview.getByRole("button", { name: "Raw", exact: true }).click();
  await expect(preview.locator("pre")).toContainText("# Project brief");
  await preview
    .getByRole("button", { name: "Raw", exact: true })
    .press("Escape");
  await expect(memory).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Resources", exact: true }),
  ).toBeVisible();
  const folder = page.getByRole("treeitem", { name: "decisions", exact: true });
  await folder.focus();
  await page.keyboard.press("ArrowRight");
  const child = page.getByRole("treeitem", { name: /architecture.md/ });
  await child.click();
  await expect(preview).toContainText(
    "Use the platform wire as the source of truth.",
  );
  await expect(page).toHaveURL(`/sessions/${session.id}?inspector=resources`);
});

test("resource metadata and archived previews stay usable at narrow widths", async ({
  page,
}) => {
  const session = await createSession(page);
  const archive = await page.request.post(
    `/api/platform/v1/sessions/${session.id}/archive`,
  );
  expect(archive.ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/sessions/${session.id}?inspector=resources`);
  await page.getByLabel("Filter resources").fill("notes.md");
  await page
    .getByRole("button", {
      name: "Inspect resource /mnt/session/uploads/notes.md",
    })
    .click();
  await expect(page.getByTestId("session-file-preview")).toContainText(
    "research-notes.md",
  );
  await expect(
    page.getByRole("link", { name: "Download", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Attach file" })).toHaveCount(
    0,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Clear resource selection" }).click();
  await page.getByLabel("Filter resources").clear();
  await page
    .getByRole("button", { name: /Inspect resource.*project$/ })
    .click();
  const preview = page.getByRole("region", { name: "Resource preview" });
  await expect(
    preview.getByRole("link", {
      name: "https://github.com/example/project",
      exact: true,
    }),
  ).toBeVisible();
  await expect(preview).not.toContainText("test-only-repository-token");
});
