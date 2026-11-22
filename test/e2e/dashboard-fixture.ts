import type { Page } from "@playwright/test";

/** The shared password fixture omits the optional Playground grant. */
export async function grantDashboardPlayground(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const session = await response.json();
    if (session.signed_in !== true) return route.fulfill({ response });
    return route.fulfill({
      response,
      json: { ...session, playground_access: true },
    });
  });
}
