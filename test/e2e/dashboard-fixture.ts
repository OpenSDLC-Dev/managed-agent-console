import type { Page } from "@playwright/test";
import type { GatewayDeployment } from "../../src/lib/platform/types";
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
      json: {
        ...session,
        ...(claims.role && { workspace_role: claims.role }),
        ...claims,
      },
    });
  });
}

/** The password double serves gateway administration but has no Playground discovery route. */
export async function grantDashboardModelDiscovery(
  page: Page,
  unreportedLimitFor?: string,
) {
  await setDashboardSession(page, { playground_access: true });
  // Use the seeded gateway aliases and the fields Playground reads from
  // internal/modelgateway/models.go. A different first model catches a link
  // that opens Playground but silently selects its default.
  const fixtures = gatewayFixtures();
  const models = fixtures.aliases
    .filter(({ name }) =>
      dashboardModelCases.some(({ alias }) => alias === name),
    )
    .map(({ name, display_name, created_at, targets }) => {
      // Both fixture aliases have one configured target.
      const deployment = fixtures.deployments.find(
        ({ id }) => id === targets[0].deployment_id,
      );
      const capabilities: GatewayDeployment["capabilities"] | undefined =
        deployment?.capabilities;
      const thinking = capabilities?.thinking === true;
      return {
        type: "model",
        id: name,
        display_name,
        created_at,
        // /v1/models returns zero when an alias has no shared reported limit.
        max_tokens:
          name === unreportedLimitFor ? 0 : (capabilities?.max_tokens ?? 0),
        capabilities: {
          image_input: { supported: capabilities?.vision === true },
          thinking: {
            supported: thinking,
            types: {
              enabled: { supported: thinking },
              adaptive: { supported: false },
            },
          },
        },
      };
    });
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
