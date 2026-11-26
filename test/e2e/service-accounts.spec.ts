import { expect, test, type Page } from "@playwright/test";
import {
  openServiceAccountForm,
  openServiceAccountMenu,
  serviceAccountLifecycle,
  serviceAccountsPath,
  showArchivedServiceAccounts,
} from "../service-account-flow";
import { browserPost } from "./browser-write";
import { signIn } from "./sign-in";

test.use({ trace: "off", screenshot: "off", video: "off" });
const mock = "http://127.0.0.1:18080";
const keysPath =
  "/api/console/organizations/default/workspaces/default/api_keys";
test.beforeEach(async ({ request }) => {
  expect((await request.post(mock + "/__reset")).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  expect((await request.post(mock + "/__reset")).ok()).toBe(true);
});

test("create validates the name and description, keeps dismissed drafts and displays duplicate-name refusals", async ({
  page,
}) => {
  await signIn(page, "/settings/service-accounts");
  const form = await openServiceAccountForm(page);
  const name = form.getByRole("textbox", { name: "Name", exact: true });
  const description = form.getByRole("textbox", { name: /Description/ });
  const submit = form.getByRole("button", {
    name: "Create service account",
    exact: true,
  });
  const role = form.getByRole("combobox", { name: "Organization role" });
  await expect(name).toBeFocused();
  await expect(submit).toBeDisabled();
  await expect(role).toContainText("Developer");
  await name.fill("Bad_Name");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(submit).toBeDisabled();
  await name.fill("a".repeat(255));
  await expect(submit).toBeEnabled();
  await name.fill("a".repeat(256));
  await expect(submit).toBeDisabled();
  await name.fill("ci-deploy");
  await description.fill("🚀".repeat(2000));
  await expect(submit).toBeEnabled();
  await description.fill("🚀".repeat(2001));
  await expect(submit).toBeDisabled();
  await description.fill("Existing name; preserve this draft");
  await role.click();
  await page.getByRole("option", { name: "Admin" }).click();
  await page.keyboard.press("Escape");
  const discard = page.getByRole("alertdialog", {
    name: "Discard unsaved changes?",
  });
  await expect(
    discard.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  await discard.getByRole("button", { name: "Keep editing" }).click();
  // A pointer dismissal uses the same draft protection as Escape and Close.
  await page.mouse.click(5, 5);
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing" }).click();
  const [refusal] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === serviceAccountsPath &&
        r.request().method() === "POST",
    ),
    submit.click(),
  ]);
  expect(refusal.status()).toBe(409);
  await expect(form.getByRole("alert")).toContainText(
    "this name is unavailable",
  );
  await expect(name).toHaveValue("ci-deploy");
  await expect(description).toHaveValue("Existing name; preserve this draft");
  await expect(role).toContainText("Admin");
  await form.getByRole("button", { name: "Close", exact: true }).click();
  await discard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(form).toHaveCount(0);
  await openServiceAccountForm(page);
  await expect(name).toHaveValue("");
  await expect(description).toHaveValue("");
  await expect(role).toContainText("Developer");
  await page.keyboard.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(discard).toHaveCount(0);
});

test("create, edit, cancel archive and archive preserve the account ID and updated metadata", async ({
  page,
}) => {
  await signIn(page);
  await serviceAccountLifecycle(page, "release-runner");
});

async function seedAccount(page: Page, name: string) {
  const response = await browserPost(page, serviceAccountsPath, {
    data: { name },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ id: string; name: string }>;
}

test("search follows opaque pages and preserves the selected status through Open, refresh and return", async ({
  page,
}) => {
  await signIn(page);
  const retired = await seedAccount(page, "late-retired");
  expect(
    (
      await browserPost(
        page,
        serviceAccountsPath + "/" + retired.id + "/archive",
      )
    ).status(),
  ).toBe(200);
  // The existing active ci-deploy and late-retired must *both* be beyond every permitted first page.
  for (let batch = 0; batch < 10; batch++) {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        seedAccount(page, `runner-${batch * 10 + i}`),
      ),
    );
  }
  const requestedCursors: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === serviceAccountsPath && url.searchParams.has("page"))
      requestedCursors.push(url.searchParams.get("page")!);
  });
  await page.goto("/settings/service-accounts");
  const search = page.getByLabel("Search service accounts", { exact: true });
  const retiredButton = page.getByRole("button", {
    name: retired.name,
    exact: true,
  });
  await search.fill("ci-deploy");
  await expect(
    page.getByRole("button", { name: "ci-deploy", exact: true }),
  ).toBeVisible();
  expect(
    requestedCursors.some(
      (cursor) => cursor.length > 1 && !/^\d+$/.test(cursor),
    ),
  ).toBe(true);
  await search.fill(retired.name);
  await expect(retiredButton).toHaveCount(0);
  const archived = page.getByRole("radio", { name: "Archived", exact: true });
  await showArchivedServiceAccounts(page);
  await expect(
    page
      .getByRole("table", { name: "Service accounts" })
      .getByRole("columnheader"),
  ).toHaveText(["ID", "Name", "Role", "Created", "Archived"]);
  await expect(retiredButton).toBeVisible();
  await search.fill(retired.id);
  await expect(
    page.getByRole("table", { name: "Service accounts" }).getByRole("row"),
  ).toHaveCount(2);
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === retired.id &&
      url.searchParams.get("status") === "archived",
  );
  await retiredButton.click();
  const inspector = page.getByRole("dialog", {
    name: retired.name,
    exact: true,
  });
  await inspector.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/settings/service-accounts/" + retired.id,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: retired.name }),
  ).toBeVisible();
  const sharedUrl = new URL(page.url());
  sharedUrl.searchParams.append("status", "active");
  sharedUrl.searchParams.append("q", "other");
  await page.goto(sharedUrl.href);
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Service accounts", exact: true })
    .click();
  await expect(search).toHaveValue(retired.id);
  await expect(archived).toBeChecked();
  await search.fill("runner-");
  await expect(
    page.getByRole("button", { name: "runner-0", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reset search", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(archived).toBeChecked();
  await expect(retiredButton).toBeVisible();
});

test("copy ID, navigate the inspector and open only visible keys belonging to that exact account", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const other = await seedAccount(page, "other-bot");
  const id = "svac_mockci01";
  async function key(name: string, owner: string) {
    const response = await browserPost(page, keysPath, {
      data: { name, principal_id: owner },
    });
    expect(response.status()).toBe(200);
    const keyId: string = (await response.json()).id;
    await response.dispose();
    return keyId;
  }
  await key("other-service-key", other.id);
  await key("human-key", "user_mockadmin01");
  const removed = await key("retired-key", id);
  expect(
    (
      await browserPost(page, keysPath + "/" + removed, {
        data: { status: "archived" },
      })
    ).status(),
  ).toBe(200);
  const disabled = await key("disabled-release-key", id);
  expect(
    (
      await browserPost(page, keysPath + "/" + disabled, {
        data: { status: "inactive" },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/settings/service-accounts");
  const table = page.getByRole("table", { name: "Service accounts" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "ID",
    "Name",
    "Role",
    "Created",
    "Actions",
  ]);
  // The cell abbreviates this ID. A copy of the visible text would lose its middle.
  await expect(table.getByText(other.id, { exact: true })).toHaveCount(0);
  await table
    .getByRole("button", { name: "Copy " + other.id, exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(other.id);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const names = table.locator("tbody tr");
  await expect(names).toHaveCount(2);
  await names
    .first()
    .getByRole("button", { name: /^(ci-deploy|other-bot)$/ })
    .press("Enter");
  const inspector = page.getByRole("dialog", {
    name: /^(ci-deploy|other-bot)$/,
  });
  const next = inspector.getByRole("button", { name: "Next service account" });
  const previous = inspector.getByRole("button", {
    name: "Previous service account",
  });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(previous).toBeDisabled();
  await inspector.getByRole("button", { name: "Close details" }).click();
  await table.getByRole("button", { name: "ci-deploy", exact: true }).click();
  for (const absent of [
    "human-key",
    "other-service-key",
    "retired-key",
    "historical-unowned",
  ]) {
    await expect(inspector.getByText(absent, { exact: true })).toHaveCount(0);
  }
  const activeKey = inspector.getByRole("link", { name: /^ci-deploy\b/ });
  await expect(activeKey).toHaveAttribute(
    "href",
    "/settings/keys?key=apikey_ci01",
  );
  await expect(
    inspector.getByRole("link", { name: /^disabled-release-key\b/ }),
  ).toHaveAttribute("href", "/settings/keys?key=" + disabled);
  await activeKey.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/settings/keys" &&
      url.searchParams.get("key") === "apikey_ci01",
  );
  const keyDetails = page.getByRole("dialog");
  await expect(keyDetails).toHaveAccessibleName("ci-deploy");
  const nextKey = keyDetails.getByRole("button", { name: "Next", exact: true });
  if (await nextKey.isEnabled()) await nextKey.click();
  else
    await keyDetails
      .getByRole("button", { name: "Previous", exact: true })
      .click();
  await expect(keyDetails).not.toHaveAttribute(
    "data-api-key-detail",
    "apikey_ci01",
  );
  const navigatedId = await keyDetails.getAttribute("data-api-key-detail");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("key") === navigatedId,
  );
  await page.reload();
  await expect(keyDetails).toHaveAttribute("data-api-key-detail", navigatedId!);
  await keyDetails.getByRole("button", { name: "Close details" }).click();
  await expect(page).toHaveURL((url) => !url.searchParams.has("key"));
  await expect(
    page.getByRole("searchbox", { name: "Search keys" }),
  ).toBeFocused();
});

test("Create API key assigns the selected account and the new key appears in its details", async ({
  page,
}) => {
  await signIn(page, "/settings/service-accounts");
  const menu = await openServiceAccountMenu(page, "ci-deploy");
  await menu.getByRole("menuitem", { name: "Create API key" }).click();
  const form = page.getByRole("dialog", {
    name: "Create API key",
    exact: true,
  });
  await expect(
    form.getByText("This key acts as", { exact: true }),
  ).toBeVisible();
  await expect(form.getByText("ci-deploy", { exact: true })).toBeVisible();
  await expect(
    form.getByRole("combobox", { name: "Linked account" }),
  ).toHaveCount(0);
  await form.getByLabel("Name", { exact: true }).fill("pipeline-runner");
  const expires = form.getByLabel("Expires", { exact: true });
  const add = form.getByRole("button", { name: "Add", exact: true });
  await expect(expires).toHaveValue("");
  await expect(add).toBeDisabled();
  await expires.selectOption("30d");
  const [created] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === keysPath &&
        r.request().method() === "POST",
    ),
    add.click(),
  ]);
  expect(created.status()).toBe(200);
  expect(created.request().postDataJSON()).toHaveProperty(
    "principal_id",
    "svac_mockci01",
  );
  await page.getByTestId("close-revealed-api-key").click();
  await page.getByRole("button", { name: "ci-deploy", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "ci-deploy", exact: true })
      .getByRole("link", { name: /^pipeline-runner\b/ }),
  ).toBeVisible();
});
