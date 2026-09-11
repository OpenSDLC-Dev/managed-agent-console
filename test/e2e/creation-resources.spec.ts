import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});
for (const owner of ["session", "deployment"] as const) {
  test(
    owner +
      " resources menu supports keyboard, file upload and multiline memory bindings",
    async ({ page }) => {
      await signIn(page, "/" + owner + "s");
      await page
        .getByRole("button", { name: "Create " + owner, exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("combobox", { name: "Agent", exact: true })
        .click();
      await page.getByRole("option", { name: /General task agent/ }).click();
      await dialog
        .getByRole("combobox", { name: "Environment", exact: true })
        .click();
      await page.getByRole("option", { name: /byoc-workers/ }).click();
      if (owner === "deployment") {
        await dialog
          .getByLabel("Name", { exact: true })
          .fill("Resource bindings");
        await dialog
          .getByRole("textbox", { name: "Initial message" })
          .fill("Read attached notes");
      }
      const resource = dialog.getByRole("button", {
        name: "Resource",
        exact: true,
      });
      await resource.focus();
      await resource.press("ArrowDown");
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(resource).toBeFocused();
      await expect(dialog).toBeVisible();
      await resource.click();
      await page
        .getByRole("menuitem", { name: "GitHub repository", exact: true })
        .click();
      await dialog
        .getByLabel("Repository URL")
        .fill("https://github.com/example/project");
      await dialog.getByRole("button", { name: "Remove attachment 1" }).click();
      await expect(resource).toBeFocused();
      await resource.click();
      await page
        .getByRole("menuitem", { name: "Memory store", exact: true })
        .click();
      await dialog
        .getByLabel("Memory store ID")
        .fill("memstore_projectnotes000001");
      await dialog
        .getByLabel("Access", { exact: true })
        .selectOption("read_only");
      await dialog
        .getByLabel("Memory instructions (optional)")
        .fill("First line\nSecond line");
      await expect(
        dialog.getByRole("link", { name: /Manage memory stores/ }),
      ).toHaveAttribute("href", "/memory-stores");
      let releaseUpload!: () => void;
      const uploadGate = new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
      await page.route("**/api/platform/v1/files", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await uploadGate;
        await route.continue();
      });
      await resource.click();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("menuitem", { name: "File", exact: true }).click();
      await (
        await chooser
      ).setFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Notes"),
      });
      const submit = dialog.getByRole("button", {
        name: "Create " + owner,
        exact: true,
      });
      await expect(dialog.getByRole("status")).toContainText("Uploading file");
      await expect(submit).toBeDisabled();
      releaseUpload();
      await expect(
        dialog.getByText("notes.txt", { exact: true }),
      ).toBeVisible();
      await expect(submit).toBeEnabled();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth))
        .toBe(true);
      expect(
        (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
          .violations,
      ).toEqual([]);
      const submitted = page.waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.url().endsWith("/api/platform/v1/" + owner + "s"),
      );
      await submit.click();
      expect((await submitted).postDataJSON().resources).toEqual([
        { type: "file", file_id: expect.any(String) },
        {
          type: "memory_store",
          memory_store_id: "memstore_projectnotes000001",
          access: "read_only",
          instructions: "First line\nSecond line",
        },
      ]);
      await expect(page).toHaveURL(new RegExp("/" + owner + "s/"));
    },
  );
}
