import { expect, test } from "@playwright/test";
import { setDashboardSession } from "./dashboard-fixture";
import { signIn } from "./sign-in";

test("password login lands a Playground-only user in the Default workspace", async ({
  page,
}) => {
  await setDashboardSession(page, { role: "user", playground_access: true });
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Login name").fill("operator");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/workspaces/default/playground");
  await expect(
    page.getByRole("heading", { name: "Playground", level: 1 }),
  ).toBeVisible();
});

test("retired page addresses return HTTP 404 without redirecting", async ({
  request,
}) => {
  for (const path of [
    "/agents",
    "/agents/overview",
    "/agents/create",
    "/agents/new",
    "/agents/agent_example/edit",
    "/sessions",
    "/deployments",
    "/environments",
    "/memory-stores",
    "/vaults",
    "/dreams",
    "/messages",
    "/messages/logs",
    "/playground",
    "/resources",
    "/files?file=file_example",
    "/skills",
    "/api-keys",
    "/members",
    "/service-accounts/service_example",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }
});

test("an unknown workspace returns 404 before requesting Default resources", async ({
  page,
}) => {
  await signIn(page);
  const tab = await page.context().newPage();
  const reads: string[] = [];
  tab.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      /^\/(?:api\/(?:organizations|console|oauth)\/|admin\/v1\/|v1\/)/.test(
        path,
      )
    ) {
      reads.push(path);
    }
  });
  const response = await tab.goto("/workspaces/unknown/agents");
  expect(response?.status()).toBe(404);
  await expect(tab.getByRole("heading", { name: "404" })).toBeVisible();
  expect(reads).toEqual([]);
});
