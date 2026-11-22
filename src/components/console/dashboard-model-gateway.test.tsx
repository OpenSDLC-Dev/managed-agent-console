import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stubGatewayFetch } from "../../../test/mock-platform/gateway-fetch";
import { gatewayFixtures } from "../../../test/mock-platform/gateway.mjs";
import { TEST_SESSION } from "../../../test/session-fixture";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import { PlatformError } from "@/lib/platform/http";
import type { readAccount } from "@/lib/platform/native";
import type {
  GatewayAlias,
  GatewayDeployment,
  GatewayProvider,
} from "@/lib/platform/types";
import {
  dashboardModels,
  type DashboardModel,
} from "./dashboard-model-catalog";
import { DashboardModelGateway } from "./dashboard-model-gateway";

const probes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/surfaces", async (actual) => ({
  ...(await actual<typeof import("@/lib/platform/surfaces")>()),
  useSurfaces: probes,
}));

const available = { status: "available" };
const denied = { status: "denied", error: new PlatformError(403, null) };
const minimax = dashboardModels.find((m) => m.profile === "minimax")!;
const deepseek = dashboardModels.find((m) => m.profile === "deepseek")!;
const glm = dashboardModels.find((m) => m.profile === "zhipu")!;
const regular = { ...TEST_SESSION, playground_access: true };
type Session = Awaited<ReturnType<typeof readAccount>>;
const catalogue = "/api/organizations/default/proxy/v1/models";
const fixture = gatewayFixtures();
const aliases = fixture.aliases as GatewayAlias[];
const deployments = fixture.deployments as GatewayDeployment[];
const providers = fixture.providers as GatewayProvider[];
const mmAlias = aliases.find((a) => a.name === "minimax-m3")!;
const mmUpstream = deployments.find((d) => d.upstream_model === "MiniMax-M3")!;

function harness(
  model = minimax,
  user: Session = regular,
  mode: "detail" | "popup" = "detail",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (entry: DashboardModel, data: Session, error?: Error) => (
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={{ data, error } as ReturnType<typeof useConsoleSession>}
      >
        <DashboardModelGateway model={entry} mode={mode} />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>
  );
  const view = render(content(model, user));
  return {
    client,
    update: (entry = model, data: Session = user, error?: Error) =>
      view.rerender(content(entry, data, error)),
  };
}

const listed = (...names: string[]) =>
  Response.json({
    data: names.map((id) => ({ id, display_name: id })),
    has_more: false,
    last_id: names.at(-1) ?? null,
  });
const failure = (status: number) =>
  Response.json(
    {
      type: "error",
      error: {
        type: status === 403 ? "permission_error" : "api_error",
        message: "request refused",
      },
    },
    { status },
  );
const paths = (calls: ReturnType<typeof stubGatewayFetch>) =>
  calls.mock.calls.map(([url]) => new URL(url, "http://console").pathname);

beforeEach(() =>
  probes.mockReturnValue({
    providers: available,
    models: available,
    agents: available,
  }),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  probes.mockReset();
});

it("joins the exact profile, upstream and targets across all priorities, and opens only aliases in the session catalogue", async () => {
  const name = "team/research + notes & QA";
  const calls = stubGatewayFetch((_method, route, url) => {
    if (route === "aliases")
      return Response.json({
        data: [
          ...aliases,
          { ...mmAlias, name },
          { ...mmAlias, name: "*" },
          { ...mmAlias, name: "vector-name", kind: "embedding" },
        ],
      });
    if (route === catalogue && !url.searchParams.has("after_id"))
      return Response.json({
        data: [{ id: "another/alias", display_name: "Another" }],
        has_more: true,
        last_id: "another/alias",
      });
    if (
      route === catalogue &&
      url.searchParams.get("after_id") === "another/alias"
    )
      return listed(name, "*", "vector-name", "MiniMax-M3", "deepseek-flash");
  });
  const { update } = harness();
  const launch = await screen.findByRole("link", {
    name: `Open in Playground for ${name}`,
  });
  const region = screen.getByRole("region", { name: "Current deployment" });
  expect(
    within(region).getByRole("link", { name: "MiniMax CN" }),
  ).toHaveAttribute("href", "/providers/gwprov_minimaxcn1");
  expect(within(region).getByText("MiniMax-M3")).toBeVisible();
  const query = new URLSearchParams({ model: name }).toString();
  expect(launch).toHaveAttribute("href", `/playground?${query}`);
  expect(within(region).getByRole("link", { name })).toHaveAttribute(
    "href",
    `/models?${query}`,
  );
  expect(within(region).getByRole("link", { name: "*" })).toBeVisible();
  expect(
    within(region).queryByRole("link", { name: "vector-name" }),
  ).toBeNull();
  expect(
    within(region).getAllByRole("link", { name: /^Open in Playground for / }),
  ).toHaveLength(1);
  const mixed = within(region)
    .getByRole("link", { name: "agent-default" })
    .closest("li")!;
  expect(mixed).toHaveTextContent("Also routes to other upstream models");
  expect(
    within(region).getByRole("link", { name: "minimax-m3" }).closest("li"),
  ).not.toHaveTextContent("other upstream models");
  update(deepseek);
  expect(
    await screen.findByRole("link", {
      name: "Open in Playground for deepseek-flash",
    }),
  ).toBeVisible();
  // This is the DeepSeek fallback target on agent-default, not its primary.
  expect(
    within(region).getByRole("link", { name: "agent-default" }),
  ).toBeVisible();
  expect(within(region).getByText("deepseek-v4-flash")).toBeVisible();
  expect(within(region).queryByRole("link", { name })).toBeNull();
  expect(new Set(paths(calls))).toEqual(
    new Set([
      "/admin/v1/providers",
      "/admin/v1/deployments",
      "/admin/v1/aliases",
      catalogue,
    ]),
  );
  for (const [, init] of calls.mock.calls)
    expect(init?.method ?? "GET").toBe("GET");
});

it.each([
  [undefined, "Checking access"],
  [{ status: "unknown" }, "could not be verified"],
  [{ status: "unimplemented" }, "does not expose"],
  [denied, "cannot view"],
])(
  "does not fetch gateway or session model directories until the provider surface grants access",
  (state, message) => {
    probes.mockReturnValue({ providers: state, models: available });
    const calls = stubGatewayFetch();
    harness();
    expect(screen.getByRole("status")).toHaveTextContent(String(message));
    expect(calls).not.toHaveBeenCalled();
  },
);

it("requires current session identity and authority even when a previous read succeeded", async () => {
  const calls = stubGatewayFetch((_method, path) =>
    path === catalogue ? listed("minimax-m3") : undefined,
  );
  const { update } = harness(minimax, { ...regular, role: undefined });
  expect(screen.getByRole("status")).toHaveTextContent("could not be verified");
  expect(calls).not.toHaveBeenCalled();
  update(minimax, { ...regular, role: "user" });
  expect(screen.getByRole("status")).toHaveTextContent("cannot view");
  expect(calls).not.toHaveBeenCalled();
  update(minimax, regular);
  await screen.findByRole("link", {
    name: "Open in Playground for minimax-m3",
  });
  update(minimax, regular, new Error("session refresh failed"));
  expect(screen.getByRole("status")).toHaveTextContent("could not be verified");
  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

it("reads upstream configuration while keeping denied aliases and Playground endpoints untouched", async () => {
  probes.mockReturnValue({ providers: available, models: denied });
  const calls = stubGatewayFetch();
  harness();
  expect(
    await screen.findByText("Your account cannot view gateway aliases."),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "MiniMax CN" })).toBeVisible();
  expect(paths(calls)).toEqual([
    "/admin/v1/providers",
    "/admin/v1/deployments",
  ]);
});

it("leaves an unconfigured provider distinct from an upstream mismatch and a missing alias", async () => {
  let phase = "mismatch";
  const calls = stubGatewayFetch((_method, path) => {
    if (phase === "mismatch" && path === "deployments")
      return Response.json({
        data: [
          { ...mmUpstream, upstream_model: "minimax-m3" },
          { ...mmUpstream, upstream_model: "MiniMax-M3.1-Flash-Preview" },
          { ...mmUpstream, kind: "embedding" },
          { ...mmUpstream, provider_id: "gwprov_deepseek01" },
        ],
      });
    if (path === "aliases")
      return Response.json({
        data: [
          {
            ...mmAlias,
            targets: [{ deployment_id: "unrelated", priority: 1, weight: 1 }],
          },
        ],
      });
  });
  const { update, client } = harness(glm);
  await screen.findByText(/No matching provider is configured/);
  expect(paths(calls)).toEqual(["/admin/v1/providers"]);
  update(minimax);
  await screen.findByText(/No matching upstream model is configured/);
  expect(paths(calls)).not.toContain("/admin/v1/aliases");
  phase = "no alias";
  await act(() =>
    client.invalidateQueries({ queryKey: ["gateway", "deployments"] }),
  );
  await screen.findByText("No gateway alias routes to this upstream model.");
  expect(paths(calls)).not.toContain(catalogue);
});

it.each(["provider", "upstream"])(
  "retains disabled %s configuration for inspection without issuing a Playground read",
  async (disabled) => {
    const calls = stubGatewayFetch((_method, path) => {
      if (disabled === "provider" && path === "providers")
        return Response.json({
          data: providers.map((p) => ({ ...p, enabled: false })),
        });
      if (disabled === "upstream" && path === "deployments")
        return Response.json({
          data: deployments.map((d) => ({ ...d, enabled: false })),
        });
    });
    harness();
    await screen.findByRole("link", { name: "minimax-m3" });
    expect(
      screen.getByText(
        disabled === "provider" ? "Provider disabled" : "Upstream disabled",
      ),
    ).toBeVisible();
    expect(paths(calls)).not.toContain(catalogue);
    expect(
      screen.queryByRole("link", { name: /^Open in Playground for / }),
    ).toBeNull();
  },
);

it("removes a cached Playground link when its grant or its model list changes", async () => {
  let visible = true;
  const calls = stubGatewayFetch((_method, path) =>
    path === catalogue
      ? visible
        ? listed("minimax-m3")
        : listed()
      : undefined,
  );
  const noAccess = { ...regular, playground_access: false };
  const { update, client } = harness(minimax, noAccess);
  await screen.findByRole("link", { name: "minimax-m3" });
  expect(paths(calls)).not.toContain(catalogue);
  update(minimax, regular);
  await screen.findByRole("link", {
    name: "Open in Playground for minimax-m3",
  });
  update(minimax, noAccess);
  expect(
    screen.queryByRole("link", { name: /^Open in Playground for / }),
  ).toBeNull();
  update(minimax, regular);
  visible = false;
  await act(() =>
    client.invalidateQueries({
      queryKey: ["playground-models", TEST_SESSION.id],
    }),
  );
  await screen.findByText("No matching alias is listed in Playground.");
  expect(
    screen.queryByRole("link", { name: /^Open in Playground for / }),
  ).toBeNull();
});

it("hides cached private values on refusal or failure and supports a successful retry", async () => {
  let broken = "";
  const calls = stubGatewayFetch((_method, path) => {
    if (path === broken) return failure(path === "providers" ? 403 : 503);
    if (path === catalogue) return listed("minimax-m3");
  });
  const { client } = harness();
  const user = userEvent.setup();
  await screen.findByRole("link", {
    name: "Open in Playground for minimax-m3",
  });
  broken = catalogue;
  await act(() =>
    client.invalidateQueries({ queryKey: ["playground-models"] }),
  );
  await screen.findByText(/Could not load Playground models/);
  expect(
    screen.queryByRole("link", { name: /^Open in Playground for / }),
  ).toBeNull();
  broken = "aliases";
  await act(() =>
    client.invalidateQueries({ queryKey: ["gateway", "aliases"] }),
  );
  await screen.findByText(/Could not load gateway aliases/);
  expect(screen.queryByRole("link", { name: "minimax-m3" })).toBeNull();
  broken = "";
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("link", {
    name: "Open in Playground for minimax-m3",
  });
  broken = "providers";
  await act(() =>
    client.invalidateQueries({ queryKey: ["gateway", "providers"] }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your account cannot view provider configuration.",
    ),
  );
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  expect(paths(calls)).not.toContain(
    "/api/organizations/default/proxy/v1/messages",
  );
});

async function openOptions(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: "More options" }));
  await screen.findByRole("menu");
}

it("opens Playground and agent creation with the same exact chat alias, and keeps the model guide local", async () => {
  const alias = "team/research + notes & QA";
  const calls = stubGatewayFetch((_method, path) => {
    if (path === "aliases")
      return Response.json({ data: [{ ...mmAlias, name: alias }] });
    if (path === catalogue) return listed(alias);
  });
  harness(minimax, regular, "popup");
  const query = new URLSearchParams({ model: alias }).toString();
  expect(
    await screen.findByRole("link", { name: "Try in playground" }),
  ).toHaveAttribute("href", `/playground?${query}`);
  expect(screen.queryByRole("combobox")).toBeNull();
  const user = userEvent.setup();
  await openOptions(user);
  expect(
    screen.getByRole("menuitem", { name: "Build an agent" }),
  ).toHaveAttribute("href", `/agents/new?${query}`);
  expect(
    screen.getByRole("menuitem", { name: "View model guide" }),
  ).toHaveAttribute("href", "/dashboard/models/minimax");
  expect(screen.getByText(alias)).toBeVisible();
  for (const [, init] of calls.mock.calls)
    expect(init?.method ?? "GET").toBe("GET");
});

it("requires an explicit alias when the agent and Playground actions have different choices", async () => {
  stubGatewayFetch((_method, path) =>
    path === catalogue ? listed("minimax-m3") : undefined,
  );
  harness(minimax, regular, "popup");
  const selector = await screen.findByRole("combobox", {
    name: "Gateway alias",
  });
  expect(screen.queryByRole("link", { name: "Try in playground" })).toBeNull();
  const user = userEvent.setup();
  await openOptions(user);
  expect(screen.queryByRole("menuitem", { name: "Build an agent" })).toBeNull();
  await user.keyboard("{Escape}");
  await user.selectOptions(selector, "agent-default");
  expect(
    await screen.findByText("Also routes to other upstream models"),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "This alias is not listed in Playground.",
  );
  expect(screen.queryByRole("link", { name: "Try in playground" })).toBeNull();
  await openOptions(user);
  expect(
    screen.getByRole("menuitem", { name: "Build an agent" }),
  ).toHaveAttribute("href", "/agents/new?model=agent-default");
  await user.keyboard("{Escape}");
  await user.selectOptions(selector, "minimax-m3");
  expect(
    screen.getByRole("link", { name: "Try in playground" }),
  ).toHaveAttribute("href", "/playground?model=minimax-m3");
  expect(screen.queryByText("Also routes to other upstream models")).toBeNull();
  await openOptions(user);
  expect(
    screen.getByRole("menuitem", { name: "Build an agent" }),
  ).toHaveAttribute("href", "/agents/new?model=minimax-m3");
});

it("requires a choice even when the only available alias routes to more than one model", async () => {
  const shared = aliases.find((alias) => alias.name === "agent-default")!;
  stubGatewayFetch((_method, path) => {
    if (path === "aliases") return Response.json({ data: [shared] });
    if (path === catalogue) return listed(shared.name);
  });
  harness(minimax, regular, "popup");
  const selector = await screen.findByRole("combobox", {
    name: "Gateway alias",
  });
  expect(
    screen.getByText("Also routes to other upstream models"),
  ).toBeVisible();
  expect(screen.queryByRole("link", { name: "Try in playground" })).toBeNull();
  await userEvent.setup().selectOptions(selector, shared.name);
  expect(
    await screen.findByRole("link", { name: "Try in playground" }),
  ).toHaveAttribute("href", "/playground?model=agent-default");
});

it("checks agent and Playground access independently and hides cached actions on revoked access", async () => {
  const calls = stubGatewayFetch((_method, path) => {
    if (path === "aliases") return Response.json({ data: [mmAlias] });
    if (path === catalogue) return listed(mmAlias.name);
  });
  const { update } = harness(
    minimax,
    { ...regular, playground_access: false },
    "popup",
  );
  await screen.findByText("Playground access is unavailable.");
  expect(paths(calls)).not.toContain(catalogue);
  expect(screen.queryByRole("link", { name: "Try in playground" })).toBeNull();
  const user = userEvent.setup();
  await openOptions(user);
  expect(
    screen.getByRole("menuitem", { name: "Build an agent" }),
  ).toHaveAttribute("href", "/agents/new?model=minimax-m3");
  await user.keyboard("{Escape}");
  probes.mockReturnValue({
    providers: available,
    models: available,
    agents: denied,
  });
  update(minimax, regular);
  expect(
    await screen.findByRole("link", { name: "Try in playground" }),
  ).toBeVisible();
  await openOptions(user);
  expect(screen.queryByRole("menuitem", { name: "Build an agent" })).toBeNull();
  expect(
    screen.getByRole("menuitem", { name: "View model guide" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  update(minimax, { ...regular, playground_access: false });
  expect(screen.queryByRole("link", { name: "Try in playground" })).toBeNull();
});

it("retains a local guide without querying private deployment data when access is unknown", async () => {
  probes.mockReturnValue({
    providers: { status: "unknown" },
    models: available,
    agents: available,
  });
  const calls = stubGatewayFetch();
  harness(minimax, regular, "popup");
  expect(screen.getByRole("status")).toHaveTextContent("could not be verified");
  await openOptions();
  expect(
    screen.getByRole("menuitem", { name: "View model guide" }),
  ).toHaveAttribute("href", "/dashboard/models/minimax");
  expect(screen.queryByRole("menuitem", { name: "Build an agent" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Try in playground" })).toBeNull();
  expect(calls).not.toHaveBeenCalled();
});

it.each(["wildcard", "disabled upstream"])(
  "offers only the guide for a %s even if Playground lists its name",
  async (condition) => {
    const calls = stubGatewayFetch((_method, path) => {
      if (path === "aliases")
        return Response.json({
          data: [
            condition === "wildcard" ? { ...mmAlias, name: "*" } : mmAlias,
          ],
        });
      if (path === "deployments" && condition === "disabled upstream")
        return Response.json({ data: [{ ...mmUpstream, enabled: false }] });
      if (path === catalogue) return listed(mmAlias.name, "*");
    });
    harness(minimax, regular, "popup");
    await screen.findByText("No enabled chat alias routes to this model.");
    expect(paths(calls)).not.toContain(catalogue);
    await openOptions();
    expect(screen.getByRole("menuitem")).toHaveAccessibleName(
      "View model guide",
    );
    expect(
      screen.queryByRole("link", { name: "Try in playground" }),
    ).toBeNull();
  },
);

it("removes a stale Playground action after a discovery failure while allowing the admitted agent action", async () => {
  let failed = false;
  stubGatewayFetch((_method, path) => {
    if (path === "aliases") return Response.json({ data: [mmAlias] });
    if (path === catalogue) return failed ? failure(503) : listed(mmAlias.name);
  });
  const { client } = harness(minimax, regular, "popup");
  await screen.findByRole("link", { name: "Try in playground" });
  failed = true;
  await act(() =>
    client.invalidateQueries({ queryKey: ["playground-models"] }),
  );
  await screen.findByText(/Could not load Playground models/);
  expect(screen.queryByRole("link", { name: "Try in playground" })).toBeNull();
  const user = userEvent.setup();
  await openOptions(user);
  expect(
    screen.getByRole("menuitem", { name: "Build an agent" }),
  ).toHaveAttribute("href", "/agents/new?model=minimax-m3");
  await user.keyboard("{Escape}");
  failed = false;
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByRole("link", { name: "Try in playground" }),
  ).toHaveAttribute("href", "/playground?model=minimax-m3");
});
