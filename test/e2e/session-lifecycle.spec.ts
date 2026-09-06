import { expect, test } from "@playwright/test";
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
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive session" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
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
