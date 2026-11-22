import type { Page } from "@playwright/test";
import { gatewayFixtures } from "../mock-platform/gateway.mjs";

/** Vendor catalog independently checked by the dashboard browser cases. */
export const dashboardModelCases = [
  {
    brand: "deepseek",
    name: "DeepSeek V4.1 Flash",
    upstream: "deepseek-flash",
    alias: "deepseek-flash",
    docs: "https://api-docs.deepseek.com/news/news261017/",
  },
  {
    brand: "glm",
    name: "GLM-5.3",
    upstream: "glm-5.3",
    alias: null,
    docs: "https://docs.z.ai/guides/llm/glm-5.3",
  },
  {
    brand: "kimi",
    name: "Kimi K3",
    upstream: "kimi-k3",
    alias: null,
    docs: "https://platform.kimi.ai/docs/guide/kimi-k3-quickstart",
  },
  {
    brand: "minimax",
    name: "MiniMax M3",
    upstream: "MiniMax-M3",
    alias: "minimax-m3",
    docs: "https://github.com/MiniMax-AI/MiniMax-M3",
  },
] as const;

/** Preserve the real password session and vary only the claims exercised here. */
export async function setDashboardSession(
  page: Page,
  claims: { role?: "developer" | "user"; playground_access?: boolean },
) {
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const session = await response.json();
    if (session.signed_in !== true) return route.fulfill({ response });
    return route.fulfill({
      response,
      json: { ...session, ...claims },
    });
  });
}

/** The password double serves gateway administration but has no Playground discovery route. */
export async function grantDashboardModelDiscovery(page: Page) {
  await setDashboardSession(page, { playground_access: true });
  // Use the seeded gateway aliases and the fields Playground reads from
  // internal/modelgateway/models.go. A different first model catches a link
  // that opens Playground but silently selects its default.
  const models = gatewayFixtures()
    .aliases.filter(({ name }) =>
      dashboardModelCases.some(({ alias }) => alias === name),
    )
    .map(({ name, display_name, created_at }) => ({
      type: "model",
      id: name,
      display_name,
      created_at,
    }));
  await page.route(
    "**/api/organizations/default/proxy/v1/models?*",
    (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        json: {
          data: models,
          first_id: models[0].id,
          last_id: models[models.length - 1].id,
          has_more: false,
        },
      });
    },
  );
}
