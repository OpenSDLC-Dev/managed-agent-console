import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const research = "wrkspc_00000000000000000000000002";

test("two tabs retain their workspace across navigation, refresh and membership changes", async ({
  page,
  context,
}) => {
  await context.route(
    /\/api\/organizations\/default\/proxy\/v1\/agents(?:\?|$)/,
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const selected = route.request().headers()["x-workspace-id"];
      const rows = body.data?.map((row: { name: string }) => ({
        ...row,
        name: selected + " " + row.name,
      }));
      await route.fulfill({ response, json: { ...body, data: rows } });
    },
  );
  await signIn(page, "/workspaces/default/agents");
  const own = page.getByRole("cell", {
    name: "default Deep researcher",
    exact: true,
  });
  await expect(own).toBeVisible();
  const other = await context.newPage();
  const response = await other.goto("/workspaces/" + research + "/agents");
  expect(response?.status()).toBe(200);
  const researchRow = other.getByRole("cell", {
    name: research + " Deep researcher",
    exact: true,
  });
  await expect(researchRow).toBeVisible();
  await researchRow.click();
  const address = other.url();
  expect(address).toContain("/workspaces/" + research + "/agents?agent=");
  await other.reload();
  await expect(
    other.getByRole("region", { name: "Agent details" }),
  ).toBeVisible();
  await expect(own).toBeVisible();
  await other.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 404,
      json: {
        type: "error",
        error: { type: "not_found_error", message: "Workspace not found" },
      },
    }),
  );
  await other.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(researchRow).toHaveCount(0, { timeout: 22000 });
  await expect(own).toBeVisible();
});
