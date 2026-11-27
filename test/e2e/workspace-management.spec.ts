import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test("a workspace can be created, assigned, selected and archived", async ({
  page,
  context,
}) => {
  const id = "wrkspc_00000000000000000000000002";
  const member = "user_123456789012345678901234";
  const initial = {
    id: "default",
    public_id: "wrkspc_00000000000000000000000001",
    name: "Default",
    role: "admin",
    display_color: "#6C5BB9",
  };
  let space:
    | {
        id: string;
        name: string;
        display_color: string;
        archived_at: string | null;
      }
    | undefined;
  let role: string | undefined;
  await context.route("**/api/auth/workspaces", (route) =>
    route.fulfill({
      json: {
        data: [
          initial,
          ...(space && !space.archived_at
            ? [{ ...space, public_id: id, role: "admin" }]
            : []),
        ],
      },
    }),
  );
  await context.route(
    /\/api\/console\/organizations\/default\/workspaces(?:\?|$|\/wrkspc_)/,
    async (route) => {
      const u = new URL(route.request().url());
      const suffix = u.pathname.split("/workspaces")[1];
      const method = route.request().method();
      if (
        suffix &&
        suffix.startsWith("/" + id) &&
        route.request().headers()["x-workspace-id"] !== id
      )
        return route.fulfill({
          status: 404,
          json: { error: { message: "Workspace not found" } },
        });
      if (suffix === "" && method === "POST") {
        const body = route.request().postDataJSON();
        space = {
          id,
          name: body.name,
          display_color: "#123abc",
          archived_at: null,
        };
        return route.fulfill({ json: space });
      }
      if (suffix === "")
        return route.fulfill({
          json:
            space &&
            (!space.archived_at ||
              u.searchParams.get("include_archived") === "true")
              ? [space]
              : [],
        });
      if (suffix === "/" + id + "/archive" && space) {
        space.archived_at = new Date().toISOString();
        return route.fulfill({ json: space });
      }
      if (suffix === "/" + id && space) return route.fulfill({ json: space });
      if (suffix === "/" + id + "/members") {
        if (method === "POST") {
          role = route.request().postDataJSON().role;
          return route.fulfill({ json: { ok: true } });
        }
        return route.fulfill({
          json: role
            ? [
                {
                  id: member,
                  name: "Researcher",
                  type: "user",
                  role,
                  inherited: false,
                },
              ]
            : [],
        });
      }
      return route.fallback();
    },
  );
  await signIn(page, "/settings/workspaces");
  await page.getByRole("button", { name: "Create workspace" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Research");
  await dialog.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: "Research", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/settings/workspaces/" + id));
  await page.getByLabel("Member or service account ID").fill(member);
  await page.getByLabel("Workspace role").selectOption("limited_developer");
  await page.getByRole("button", { name: "Save grant" }).click();
  await expect(
    page.getByRole("cell", { name: "Limited Developer" }),
  ).toBeVisible();
  await page.goto("/workspaces/default/agents");
  await page.getByRole("combobox", { name: "Workspace" }).click();
  await page.getByRole("option", { name: "Research" }).click();
  await expect(page).toHaveURL(new RegExp("/workspaces/" + id + "/agents$"));
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Workspace" })).toContainText(
    "Research",
  );
  await page.goto("/settings/workspaces/" + id + "?workspace=" + id);
  await page.getByRole("button", { name: "Archive workspace" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive workspace" })
    .click();
  await expect(page).toHaveURL(/\/settings\/workspaces$/);
  await expect(
    page.getByRole("link", { name: "Research", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Show archived").check();
  await expect(
    page.getByRole("cell", { name: "Research", exact: true }),
  ).toBeVisible();
});
