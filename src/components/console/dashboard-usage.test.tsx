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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { stubGatewayFetch } from "../../../test/mock-platform/gateway-fetch";
import type { GatewayDailyUsage } from "@/lib/platform/types";
import { DashboardUsage } from "./dashboard-usage";

const first = "2028-03-01";
const seven = "2028-02-25";
const today = "2028-03-02";

function row(
  day: string,
  counts: Partial<GatewayDailyUsage> = {},
): GatewayDailyUsage {
  return {
    day,
    api_key_id: "",
    alias: "agent-default",
    deployment_id: "example",
    requests: 1,
    errors: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost: 0,
    ...counts,
  };
}

function serve(result: (from: string) => Response) {
  return stubGatewayFetch((_method, path, url) => {
    if (path !== "usage/daily") return undefined;
    return result(url.searchParams.get("from")!);
  });
}

function renderUsage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DashboardUsage />
    </QueryClientProvider>,
  );
  return client;
}

const card = (name: string) =>
  screen.getByRole("link", { name }).closest("[data-dashboard-metric]")!;
const metric = (name: string) => card(name).querySelector("[data-value]");
const refuse = (status: number) =>
  Response.json(
    {
      type: "error",
      error: {
        type: status === 403 ? "permission_error" : "api_error",
        message: "Usage read failed",
      },
    },
    { status },
  );

beforeEach(() => {
  vi.setSystemTime(new Date("2028-03-01T22:20:00-02:00"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("links UTC month and week totals to their matching Usage view and charts reported days", async () => {
  const rows = [
    row(seven, { input_tokens: 3 }),
    row("2028-02-27"),
    row(first, {
      requests: 2,
      input_tokens: 10,
      output_tokens: 5,
      cache_read_tokens: 6,
      cache_write_tokens: 4,
      cost: 0.006,
    }),
    row(first, { alias: "another", input_tokens: 2, output_tokens: 3 }),
  ];
  const fetchMock = serve((from) =>
    Response.json({ data: rows.filter((r) => r.day >= from) }),
  );
  renderUsage();
  const chart = await screen.findByRole("img", {
    name: /Reported tokens per UTC day/,
  });
  const cache = screen.getByRole("img", {
    name: /Cache read tokens per UTC day/,
  });
  expect(cache.querySelector(`[data-day="${first}"]`)).toHaveAttribute(
    "data-cache-read",
    "6",
  );
  expect(cache.querySelector('[data-day="2028-02-27"]')).toBeNull();
  expect(chart.querySelector("rect")).not.toBeNull();
  const overview = screen.getByRole("region", { name: "Usage overview" });
  expect(within(overview).getByRole("heading", { level: 2 })).toHaveTextContent(
    "Usage overview",
  );
  const headings = within(overview).getAllByRole("heading", { level: 3 });
  expect(
    headings.map((heading) => within(heading).getByRole("link").textContent),
  ).toEqual([
    "Requests this month",
    "Spend this month",
    "Prompt caching",
    "Token volume",
  ]);
  for (const heading of headings)
    expect(within(heading).queryByRole("button")).toBeNull();
  expect(metric("Requests this month")).toHaveAttribute("data-value", "3");
  expect(metric("Spend this month")).toHaveAttribute("data-value", "0.006");
  expect(
    screen.getByRole("link", { name: "Spend this month" }),
  ).toHaveAccessibleDescription("0.006 Priced usage only");
  expect(metric("Prompt caching")).toHaveAttribute("data-value", "6");
  expect(metric("Token volume")).toHaveAttribute("data-value", "33");
  expect(chart.querySelector(`[data-day="${first}"]`)).toHaveAttribute(
    "data-tokens",
    "30",
  );
  expect(chart.querySelector('[data-day="2028-02-26"]')).toHaveAttribute(
    "data-tokens",
    "0",
  );
  expect(chart.querySelector('[data-day="2028-02-27"]')).toBeNull();
  expect(chart).toHaveAccessibleName(/Feb 27: no tokens recorded/);
  expect(screen.getByRole("link", { name: "Token volume" })).toHaveAttribute(
    "href",
    "/usage?range=7",
  );
  for (const name of [
    "Requests this month",
    "Spend this month",
    "Prompt caching",
  ])
    expect(screen.getByRole("link", { name })).toHaveAttribute(
      "href",
      "/usage?range=mtd",
    );
  const ranges = fetchMock.mock.calls.map(([input]) => {
    const url = new URL(input, "http://console");
    expect(url.pathname).toBe("/admin/v1/usage/daily");
    return [url.searchParams.get("from"), url.searchParams.get("to")];
  });
  expect(ranges).toEqual(
    expect.arrayContaining([
      [first, today],
      [seven, today],
    ]),
  );
  expect(ranges).toHaveLength(2);
});

it("distinguishes an empty range from requests without recorded tokens or cost", async () => {
  serve((from) => Response.json({ data: from === first ? [] : [row(seven)] }));
  renderUsage();
  await waitFor(() =>
    expect(metric("Requests this month")).toHaveAttribute("data-value", "0"),
  );
  expect(metric("Spend this month")).toHaveAttribute("data-value", "0");
  expect(metric("Prompt caching")).toHaveAttribute("data-value", "0");
  expect(metric("Token volume")).toBeNull();
  expect(card("Token volume")).toHaveTextContent(
    "No tokens recorded in the last 7 days",
  );
  expect(screen.queryByRole("img")).toBeNull();
});

it("shows measured cache reads without pricing and leaves missing token reports unknown", async () => {
  const rows = [row(first, { cache_read_tokens: 31 })];
  serve(() => Response.json({ data: rows }));
  const client = renderUsage();
  await waitFor(() =>
    expect(metric("Prompt caching")).toHaveAttribute("data-value", "31"),
  );
  expect(metric("Spend this month")).toBeNull();
  expect(card("Spend this month")).toHaveTextContent("No cost recorded");

  rows[0] = row(first);
  await client.invalidateQueries({ queryKey: ["gateway", "usage", "daily"] });
  await waitFor(() => expect(metric("Prompt caching")).toBeNull());
  expect(card("Prompt caching")).toHaveTextContent("No tokens recorded");
});

it("keeps each period independent when a read fails and clears old values on a failed refresh", async () => {
  let failWeek = false;
  serve((from) =>
    from === first || failWeek
      ? refuse(503)
      : Response.json({ data: [row(today, { output_tokens: 213 })] }),
  );
  const client = renderUsage();
  await waitFor(() =>
    expect(metric("Token volume")).toHaveAttribute("data-value", "213"),
  );
  expect(metric("Requests this month")).toBeNull();
  expect(card("Requests this month")).toHaveTextContent("Usage unavailable");
  failWeek = true;
  await client.invalidateQueries({ queryKey: ["gateway", "usage", "daily"] });
  await waitFor(() =>
    expect(card("Token volume")).toHaveTextContent("Usage unavailable"),
  );
  expect(metric("Token volume")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
});

it.each([401, 403])(
  "withholds cached metrics and their links when access changes (%s)",
  async (status) => {
    let denied = false;
    serve((from) =>
      denied && from === first
        ? refuse(status)
        : Response.json({ data: [row(today, { input_tokens: 8 })] }),
    );
    const client = renderUsage();
    await waitFor(() =>
      expect(metric("Token volume")).toHaveAttribute("data-value", "8"),
    );
    denied = true;
    await client.invalidateQueries({ queryKey: ["gateway", "usage", "daily"] });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You do not have access to usage.",
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("img")).toBeNull();
  },
);

it("explains the recorded token measure on keyboard focus and returns to the same card", async () => {
  serve(() => Response.json({ data: [] }));
  const user = userEvent.setup();
  renderUsage();
  await waitFor(() =>
    expect(metric("Token volume")).toHaveAttribute("data-value", "0"),
  );
  const volume = card("Token volume") as HTMLElement;
  within(volume).getByRole("link").focus();
  await user.tab();
  const info = within(volume).getByRole("button", {
    name: "About token volume",
  });
  expect(info).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "seven UTC days",
  );
  expect(info).toHaveAccessibleDescription(/seven UTC days/);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  expect(info).toHaveFocus();
});
