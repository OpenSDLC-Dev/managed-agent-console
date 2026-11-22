import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import { copyText } from "@/lib/copy-text";
import { stubGatewayFetch } from "../../../test/mock-platform/gateway-fetch";
import { gatewayFixtures } from "../../../test/mock-platform/gateway.mjs";
import { TEST_SESSION } from "../../../test/session-fixture";
import { DashboardModels } from "./dashboard-models";

vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn() }));
vi.mock("@/lib/platform/surfaces", async (actual) => ({
  ...(await actual<typeof import("@/lib/platform/surfaces")>()),
  useSurfaces: () => ({ providers: { status: "available" } }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("gives each branded card a local guide fallback and a model dialog", () => {
  render(<DashboardModels />);
  for (const [name, brand] of [
    ["DeepSeek V4.1 Flash", "deepseek"],
    ["GLM-5.3", "glm"],
    ["Kimi K3", "kimi"],
    ["MiniMax M3", "minimax"],
  ]) {
    const card = screen.getByRole("article", { name });
    const link = within(card).getByRole("link", { name });
    expect(link).toHaveAttribute("href", `/dashboard/models/${brand}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("aria-haspopup", "dialog");
    expect(within(card).getByText("1M context")).toBeVisible();
    expect(card.querySelector("p")).toHaveTextContent(/coding/i);
    expect(within(card).getByRole("heading", { name })).toContainElement(link);
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      `/brands/${brand}.svg`,
    );
    expect(within(card).getAllByRole("listitem")).toHaveLength(3);
    expect(within(link).queryByRole("list")).toBeNull();
  }
});

it("opens the selected card with Enter and restores it on Escape", async () => {
  const user = userEvent.setup();
  render(<DashboardModels />);
  const trigger = screen.getByRole("link", { name: "Kimi K3" });
  trigger.focus();
  await user.keyboard("{Enter}");
  const detail = await screen.findByRole("dialog", { name: "Kimi K3" });
  await waitFor(() =>
    expect(within(detail).getByRole("button", { name: "Close" })).toHaveFocus(),
  );
  expect(
    within(detail).getByRole("button", { name: "Copy model ID kimi-k3" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("compares the selected deployments' live rates and restores focus on close", async () => {
  const user = userEvent.setup();
  const { providers, deployments } = gatewayFixtures();
  const provider = {
    ...providers[0],
    profile: "moonshot",
    name: "Moonshot CN",
  };
  const deployment = {
    ...deployments[0],
    provider_id: provider.id,
    upstream_model: "kimi-k3",
    price_currency: "CNY",
    price_note: "5-minute cache writes",
    prices: { input: 19.5, output: 99.5, cache_read: 2, cache_write: 20 },
  };
  const calls = stubGatewayFetch((_method, path) => {
    if (path === "providers") return Response.json({ data: [provider] });
    if (path === "deployments") return Response.json({ data: [deployment] });
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConsoleSessionContext.Provider
        value={{ data: TEST_SESSION } as ReturnType<typeof useConsoleSession>}
      >
        <DashboardModels />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Compare models" });
  await user.click(trigger);
  const dialog = within(
    await screen.findByRole("dialog", { name: "Compare models" }),
  );
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "Close" })).toHaveFocus(),
  );
  expect(dialog.getByRole("radio", { name: "Cost" })).toBeChecked();
  expect(dialog.getByRole("combobox", { name: "Model 1" })).toHaveTextContent(
    "DeepSeek V4.1 Flash",
  );
  expect(dialog.getByRole("combobox", { name: "Model 2" })).toHaveTextContent(
    "GLM-5.3",
  );
  expect(dialog.getByRole("combobox", { name: "Model 3" })).toHaveTextContent(
    "Kimi K3",
  );
  const kimi = within(
    dialog.getByRole("region", { name: "Comparison column 3" }),
  );
  expect(await kimi.findByText("99.5")).toBeVisible();
  expect(kimi.getByText("CNY per million tokens")).toBeVisible();
  expect(kimi.getByText("5-minute cache writes")).toBeVisible();
  expect(
    dialog.getByRole("link", { name: "View pricing for GLM-5.3" }),
  ).toHaveAttribute("href", "/dashboard/models/glm#pricing");
  const glm = within(
    dialog.getByRole("region", { name: "Comparison column 2" }),
  );
  expect(glm.getByRole("status")).toHaveTextContent("No matching provider");
  expect(
    calls.mock.calls.map(([url]) => new URL(url, "http://console").pathname),
  ).toEqual(["/admin/v1/providers", "/admin/v1/deployments"]);
  await user.click(dialog.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("keeps column selections across views and copies the exact upstream ID without requesting a model", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.mocked(copyText).mockResolvedValue(true);
  render(<DashboardModels />);
  await user.click(screen.getByRole("button", { name: "Compare models" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "Compare models" }),
  );
  await user.click(dialog.getByRole("combobox", { name: "Model 3" }));
  await user.click(await screen.findByRole("option", { name: "MiniMax M3" }));
  expect(
    dialog.getByRole("link", { name: "View pricing for MiniMax M3" }),
  ).toHaveAttribute("href", "/dashboard/models/minimax#pricing");
  const third = within(
    dialog.getByRole("region", { name: "Comparison column 3" }),
  );
  expect(third.getByRole("status")).toHaveTextContent("could not be verified");
  await user.click(dialog.getByRole("radio", { name: "Features" }));
  expect(
    third.getByRole("link", { name: "Model documentation for MiniMax M3" }),
  ).toHaveAttribute("href", "/dashboard/models/minimax");
  expect(third.getByText("Upstream model ID")).toBeVisible();
  expect(third.getByText("MiniMax-M3")).toBeVisible();
  expect(third.getByText("512K tokens")).toBeVisible();
  await user.click(third.getByRole("button", { name: "Copy MiniMax-M3" }));
  expect(copyText).toHaveBeenCalledWith("MiniMax-M3");
  await user.click(dialog.getByRole("radio", { name: "Cost" }));
  expect(dialog.getByRole("combobox", { name: "Model 3" })).toHaveTextContent(
    "MiniMax M3",
  );
  expect(dialog.getByRole("combobox", { name: "Model 1" })).toHaveTextContent(
    "DeepSeek V4.1 Flash",
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetch).not.toHaveBeenCalled();
});

it("allows the same model in two columns and dismisses an open selector before the comparison", async () => {
  const user = userEvent.setup();
  render(<DashboardModels />);
  await user.click(screen.getByRole("button", { name: "Compare models" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "Compare models" }),
  );
  const third = dialog.getByRole("combobox", { name: "Model 3" });
  await user.click(third);
  await user.click(await screen.findByRole("option", { name: "GLM-5.3" }));
  expect(third).toHaveTextContent("GLM-5.3");
  expect(dialog.getByRole("combobox", { name: "Model 2" })).toHaveTextContent(
    "GLM-5.3",
  );
  await user.click(third);
  await screen.findByRole("listbox");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(screen.getByRole("dialog", { name: "Compare models" })).toBeVisible();
  expect(third).toHaveFocus();
});
