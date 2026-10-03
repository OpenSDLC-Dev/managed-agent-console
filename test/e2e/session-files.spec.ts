import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

// A session's own files (platform #578): the copy each file mount mints and
// the outputs harvested from its sandbox, listed only under its scope_id.
const RESEARCH = "sesn_research0000000000001";
const UPLOAD = "file_notes0000000000001";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("Resources lists the session's own files with the reference's request, offering download only for outputs", async ({
  page,
}) => {
  await signIn(page);
  const listed = page.waitForRequest((request) =>
    request.url().includes(`/api/platform/v1/files?scope_id=${RESEARCH}`),
  );
  await page.goto(`/sessions/${RESEARCH}?inspector=resources`);
  const request = await listed;
  // console-141 ui-network idx 243: the same query and beta header.
  expect(new URL(request.url()).searchParams.get("limit")).toBe("1000");
  expect(request.headers()["anthropic-beta"]).toBe("managed-agents-2026-04-01");

  const panel = page.getByTestId("session-resources");
  await expect(panel).toHaveAttribute("data-session-files", "ready");
  await expect(panel).toHaveAttribute("data-session-file-count", "2");
  // The mount's row is its copy, sized from the list.
  await expect(
    panel.getByText(`/mnt/session/uploads/${UPLOAD}`, { exact: true }),
  ).toBeVisible();
  await expect(panel.locator('[data-size-bytes="48213"]')).toBeVisible();
  await expect(
    panel.locator('[data-session-file-id="file_researchcopy0000001"]'),
  ).toHaveCount(0);
  // The harvested output follows, and is the one download offered.
  const output = panel.locator(
    '[data-session-file-id="file_output000000000001"]',
  );
  await expect(output).toHaveAttribute("data-downloadable", "true");
  await expect(output).toContainText("summary.xlsx");
  await expect(output.locator('[data-size-bytes="120400"]')).toBeVisible();
  const download = output.getByRole("link", { name: "Download summary.xlsx" });
  await expect(download).toHaveAttribute(
    "href",
    "/api/platform/v1/files/file_output000000000001/content",
  );
  await expect(download).toHaveAttribute("download", "summary.xlsx");
  await expect(panel.getByRole("link", { name: /^Download/ })).toHaveCount(1);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Session inspector"]')
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("a deployment fire mints its session's copy, shown in that session's Resources", async ({
  page,
}) => {
  await signIn(page);
  const run = (await (
    await page.request.post(
      "/api/platform/v1/deployments/depl_weekresearch00000001/run",
      { data: {} },
    )
  ).json()) as { session_id: string };
  await page.goto(`/sessions/${run.session_id}?inspector=resources`);
  const panel = page.getByTestId("session-resources");
  await expect(panel).toHaveAttribute("data-session-file-count", "1");
  // The deployment names the upload; the fired session mounts its own copy
  // at the path that still names the upload.
  await expect(
    panel.getByText(`/mnt/session/uploads/${UPLOAD}`, { exact: true }),
  ).toBeVisible();
  await expect(panel.locator('[data-size-bytes="48213"]')).toBeVisible();
  await expect(panel.getByText(UPLOAD, { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: /^Download/ })).toHaveCount(0);
});

test("the rubric picker offers uploads and the session's own files, labelled apart", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/sessions/${RESEARCH}`);
  await page.getByTestId("outcome-evaluation").waitFor();
  await page.getByRole("button", { name: "Define outcome" }).click();
  const dialog = page.getByRole("dialog", { name: "Define outcome" });
  await dialog.getByLabel("Rubric type").click();
  await page.getByRole("option", { name: "File" }).click();
  await expect(
    dialog.locator('[data-file-options-state="ready"]'),
  ).toBeVisible();
  const option = (id: string) =>
    dialog.locator(`datalist#outcome-rubric-files option[value="${id}"]`);
  await expect(option(UPLOAD)).toHaveAttribute("data-file-origin", "upload");
  await expect(option("file_researchcopy0000001")).toHaveAttribute(
    "data-file-origin",
    "session file",
  );
  await expect(option("file_output000000000001")).toHaveAttribute(
    "data-file-origin",
    "session file",
  );

  // A rubric naming the session's copy is accepted, as on the platform.
  await dialog.getByLabel("Description").fill("Summarize the notes");
  await dialog.getByLabel("Rubric file ID").fill("file_researchcopy0000001");
  const posted = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/sessions/${RESEARCH}/events`),
  );
  await dialog.getByRole("button", { name: "Define outcome" }).click();
  expect((await posted).status()).toBe(200);
});
