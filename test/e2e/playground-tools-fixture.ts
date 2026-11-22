import type { Page } from "@playwright/test";
import type {
  PlaygroundBlock,
  PlaygroundRequest,
} from "../../src/lib/platform/playground";
import {
  fixtureModelList,
  fixtureReply,
} from "../mock-platform/playground-tools.mjs";
export {
  toolModels,
  clientCalls,
  hostedResults,
} from "../mock-platform/playground-tools.mjs";
import { setDashboardSession } from "./dashboard-fixture";

export const toolTemplates = [
  {
    id: "search",
    title: "Deep research",
    label: "Web search",
    name: "web_search",
  },
  {
    id: "computer",
    title: "Operate a computer",
    label: "Computer use",
    name: "computer",
  },
  { id: "bash", title: "Analyze a log with bash", label: "Bash", name: "bash" },
  {
    id: "fetch",
    title: "Explain an article",
    label: "Web fetch",
    name: "web_fetch",
  },
  {
    id: "browser",
    title: "Navigate a website",
    label: "Browser use",
    name: "browser",
  },
] as const;

// Mirror the existing cookie-authorized /v1/models wire, including a text-only
// model. Playground-only users can discover these without a gateway admin role.
export async function grantToolModels(page: Page) {
  await setDashboardSession(page, { playground_access: true });
  await page.route("**/api/organizations/default/proxy/v1/models?*", (route) =>
    route.fulfill({ json: fixtureModelList() }),
  );
}

export async function serveToolReply(page: Page, content: PlaygroundBlock[]) {
  const sent: PlaygroundRequest[] = [];
  await page.route(
    "**/api/organizations/default/proxy/v1/messages?*",
    (route) => {
      const body: PlaygroundRequest = route.request().postDataJSON();
      const first = sent.length === 0;
      sent.push(body);
      return route.fulfill({
        json: fixtureReply(body.model, first ? content : undefined),
      });
    },
  );
  return sent;
}

export async function disablePlaygroundStreaming(page: Page) {
  await page.getByRole("button", { name: "Model settings" }).click();
  const panel = page.getByRole("dialog", { name: "Model", exact: true });
  await panel.getByRole("button", { name: "Advanced" }).click();
  await panel.getByRole("switch", { name: "Streaming" }).click();
  await panel.getByRole("button", { name: "Close settings" }).click();
  await panel.waitFor({ state: "hidden" });
}
