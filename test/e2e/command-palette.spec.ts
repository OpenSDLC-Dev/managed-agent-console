import { expect, test } from "@playwright/test";
import { setDashboardSession } from "./dashboard-fixture";
import { signIn } from "./sign-in";

const research = "wrkspc_00000000000000000000000002";

test("header search groups pages and docs and opens the selected result with Enter", async ({
  page,
  context,
}) => {
  await setDashboardSession(page, { playground_access: true });
  const guide =
    "https://platform.claude.com/docs/en/build-with-claude/prompt-caching";
  await context.route(guide, (route) =>
    route.fulfill({ contentType: "text/plain", body: "Prompt caching" }),
  );
  await signIn(page, `/workspaces/${research}/agents`);
  await page.getByRole("button", { name: /^Search Console/ }).click();
  const input = page.getByRole("combobox", { name: "Command palette" });
  const list = page.getByRole("listbox", { name: "Suggestions" });
  const pages = list.getByRole("group", { name: "Pages" });
  const pageLabel = pages.getByText("Pages", { exact: true });
  await expect(pageLabel).toBeVisible();
  await expect(pageLabel).toHaveCSS("text-transform", "none");
  await expect(list.getByText("Go to", { exact: true })).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute(
    "placeholder",
    "Search docs, pages, workspaces, agents",
  );
  await expect(pages.getByRole("option").nth(0)).toHaveText("Dashboard");
  await expect(pages.getByRole("option").nth(1)).toHaveText(
    "Messages › Overview",
  );
  await expect(pages.getByRole("option").nth(2)).toHaveText(
    "Messages › Playground",
  );
  await expect(pages.getByRole("option").nth(3)).toHaveText("Messages › Logs");
  await expect(pages.getByRole("option").nth(4)).toHaveText(
    "Agents › Overview",
  );
  await expect(
    list.getByRole("group", { name: "Popular docs" }).getByRole("option"),
  ).toHaveCount(3);
  await input.fill("playground");
  const playground = pages.getByRole("option", {
    name: "Messages › Playground",
  });
  await expect(pages.getByRole("option")).toHaveCount(1);
  await expect(playground).toHaveAttribute("aria-selected", "true");
  await expect(
    list
      .getByRole("group", { name: "Documentation" })
      .getByRole("option", { name: /API overview/ }),
  ).toBeVisible();
  await input.press("ArrowDown");
  await expect(
    list
      .getByRole("group", { name: "Documentation" })
      .getByRole("option")
      .first(),
  ).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await expect(playground).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page).toHaveURL(
    (url) => url.pathname === `/workspaces/${research}/playground`,
  );
  await page.getByRole("button", { name: /^Search Console/ }).click();
  await expect(input).toHaveValue("");
  await input.fill("prompt caching");
  await expect(
    list.getByRole("option", { name: /Prompt caching/ }),
  ).toHaveAttribute("href", guide);
  const popup = page.waitForEvent("popup");
  await input.press("Enter");
  await expect(await popup).toHaveURL(guide);
});

test("workspace results open the chosen workspace with its own role", async ({
  page,
}) => {
  const entries = [
    {
      id: "default",
      public_id: "wrkspc_00000000000000000000000001",
      name: "Default",
      role: "admin",
      display_color: "#6c5bb9",
    },
    {
      id: research,
      public_id: research,
      name: "Research",
      role: "developer",
      display_color: "#123abc",
    },
  ];
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    if (!session.signed_in) return route.fulfill({ response });
    return route.fulfill({
      response,
      json: {
        ...session,
        role: "developer",
        workspace_role:
          session.workspace_id === "default" ? "admin" : "developer",
      },
    });
  });
  await page.route("**/api/auth/workspaces", (route) =>
    route.fulfill({ json: { data: entries } }),
  );
  await page.route(
    /\/api\/console\/organizations\/default\/workspaces(?:\?|$)/,
    (route) => route.fulfill({ json: [] }),
  );
  await signIn(page, `/workspaces/${research}/agents`);
  const input = page.getByRole("combobox", { name: "Command palette" });
  const workspaces = page.getByRole("group", {
    name: "Workspaces",
    exact: true,
  });
  const trigger = page.getByRole("button", { name: /^Search Console/ });
  await trigger.click();
  await input.fill("default");
  const home = workspaces.getByRole("option", { name: "Default", exact: true });
  await expect(home).toHaveAttribute(
    "href",
    "/settings/workspaces/default?workspace=default",
  );
  await input.press("Enter");
  await expect(page).toHaveURL(
    /\/settings\/workspaces\/default\?workspace=default$/,
  );
  await expect(
    page.getByRole("heading", { name: "Default", exact: true }),
  ).toBeVisible();
  await trigger.click();
  await input.fill("Research");
  const other = workspaces.getByRole("option", {
    name: "Research",
    exact: true,
  });
  await other.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === `/workspaces/${research}/agents`,
  );
});
