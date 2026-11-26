import { expect, type Page } from "@playwright/test";

export const serviceAccountsPath =
  "/api/console/organizations/default/service_accounts";

export async function openServiceAccountForm(page: Page) {
  await page
    .getByRole("button", { name: "Create service account", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: "Create service account",
    exact: true,
  });
}

export async function openServiceAccountMenu(page: Page, name: string) {
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name, exact: true }) })
    .getByRole("button", { name: `More actions for ${name}`, exact: true })
    .click();
  return page.getByRole("menu");
}

export async function showArchivedServiceAccounts(page: Page) {
  await page
    .getByRole("radiogroup", { name: "Archive filter" })
    .getByText("Archived", { exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Archived", exact: true }),
  ).toBeChecked();
}

/** Walk both implementations through the UI and check the actual private API writes. */
export async function serviceAccountLifecycle(page: Page, name: string) {
  await page.goto("/settings/service-accounts");
  const form = await openServiceAccountForm(page);
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("combobox", { name: "Organization role" }).click();
  await page.getByRole("option", { name: "Admin", exact: true }).click();
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === serviceAccountsPath &&
        r.request().method() === "POST",
    ),
    form
      .getByRole("button", { name: "Create service account", exact: true })
      .click(),
  ]);
  expect(created.status()).toBe(200);
  const account = await created.json();
  expect(account).toMatchObject({
    name,
    organization_role: "admin",
    archived_at: null,
  });
  await expect(form).toHaveCount(0);
  const rowButton = page.getByRole("button", { name, exact: true });
  const inspector = page.getByRole("dialog", { name, exact: true });
  await expect(
    inspector.getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Active", exact: true }),
  ).toBeChecked();
  await inspector.getByRole("button", { name: "Close details" }).click();
  await expect(rowButton).toBeVisible();

  const editMenu = await openServiceAccountMenu(page, name);
  await expect(editMenu.getByRole("menuitem")).toHaveText([
    "Edit",
    "Create API key",
    "Archive",
  ]);
  await editMenu.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name, exact: true });
  await expect(edit.getByLabel("Name", { exact: true })).toHaveCount(0);
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    inspector.getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await inspector.getByRole("button", { name: "Edit", exact: true }).click();
  await edit
    .getByLabel("Description", { exact: false })
    .fill("Release automation");
  await edit.getByRole("combobox", { name: "Organization role" }).click();
  await page.getByRole("option", { name: "Developer", exact: true }).click();
  const path = `${serviceAccountsPath}/${account.id}`;
  const [saved] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path && r.request().method() === "POST",
    ),
    edit.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON()).toEqual({
    description: "Release automation",
    organization_role: "developer",
  });
  await expect(
    edit.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  await expect(
    inspector.getByRole("link", { name: "Open", exact: true }),
  ).toBeVisible();
  await expect(
    inspector.getByText("Release automation", { exact: true }),
  ).toBeVisible();
  await inspector.getByRole("button", { name: "Close details" }).click();

  const archive = page.getByRole("alertdialog", {
    name: "Archive service account",
    exact: true,
  });
  await (
    await openServiceAccountMenu(page, name)
  )
    .getByRole("menuitem", { name: "Archive", exact: true })
    .click();
  await expect(archive).toContainText(name);
  await expect(archive.getByRole("textbox")).toHaveCount(0);
  await expect(
    archive.getByRole("button", { name: "Archive", exact: true }),
  ).toBeFocused();
  await archive.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await (await page.request.get(path)).json()).archived_at).toBeNull();
  await (
    await openServiceAccountMenu(page, name)
  )
    .getByRole("menuitem", { name: "Archive", exact: true })
    .click();
  const [archived] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path + "/archive" &&
        r.request().method() === "POST",
    ),
    archive.getByRole("button", { name: "Archive", exact: true }).click(),
  ]);
  expect(archived.status()).toBe(200);
  await expect(archive).toHaveCount(0);
  await expect(rowButton).toHaveCount(0);
  await showArchivedServiceAccounts(page);
  await expect(rowButton).toBeVisible();
  await expect(
    page.getByRole("button", { name: `More actions for ${name}` }),
  ).toHaveCount(0);
  await rowButton.click();
  await inspector.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp("/settings/service-accounts/" + account.id),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create key", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Organization role", disabled: false }),
  ).toHaveCount(0);
  const read = await page.request.get(path);
  expect(read.status()).toBe(200);
  const record = await read.json();
  expect(record).toMatchObject({
    id: account.id,
    name,
    description: "Release automation",
    organization_role: "developer",
  });
  expect(record.archived_at).toBeTruthy();
  return record;
}
