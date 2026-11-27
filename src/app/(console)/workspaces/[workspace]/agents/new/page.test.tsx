import { TEST_SESSION, withTestSession } from "@/../test/session-fixture";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { gatewayFixtures } from "@/../test/mock-platform/gateway.mjs";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { generateAgentDraft } from "@/lib/agent-config/generate";
import NewAgentPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/workspaces/default/agents/new",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/agent-config/generate", () => ({ generateAgentDraft: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderPage(
  model?: string | string[],
  grant = false,
  gateway = true,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      withTestSession(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (!gateway && url.endsWith("/aliases"))
          return new Response("Unavailable", { status: 503 });
        const data =
          url.endsWith("/aliases") && model
            ? ["team/model+A", "alternate"].map((name) => ({
                ...gatewayFixtures().aliases[0],
                name,
              }))
            : url.includes("/v1/models?")
              ? [{ id: "team/model+A", display_name: "Team model" }]
              : [];
        return Response.json({ data, has_more: false, last_id: null });
      }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={
          {
            data: { ...TEST_SESSION, playground_access: grant },
          } as React.ContextType<typeof ConsoleSessionContext>
        }
      >
        {await NewAgentPage({ searchParams: Promise.resolve({ model }) })}
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("NewAgentPage", () => {
  it("renders the header and a create-mode editor seeded with defaults", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Create agent" }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Name")).toHaveValue("Untitled agent");
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tools" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Create agent" })).toBeEnabled();
  });

  it("fills an editable draft from the directory templates, then restores the blank starter", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole("radio", { name: "Template" }));
    await user.click(
      screen.getByRole("button", { name: /Structured extractor/ }),
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Structured extractor");
    const point = screen.getByRole("button", { name: /Starting point/ });
    expect(point).toHaveAttribute("aria-expanded", "false");
    await user.click(point);
    await user.click(screen.getByRole("button", { name: "Blank agent" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Untitled agent");
  });

  it("carries the requested gateway alias through template selection without a write", async () => {
    const user = userEvent.setup();
    await renderPage(["team/model+A", "unused"]);
    await waitFor(() =>
      expect(screen.getByLabelText("Model")).toHaveAttribute(
        "data-model",
        "team/model+A",
      ),
    );
    await user.click(screen.getByRole("radio", { name: "Template" }));
    await user.click(screen.getByRole("button", { name: /Deep researcher/ }));
    expect(screen.getByLabelText("Model")).toHaveAttribute(
      "data-model",
      "team/model+A",
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(
          ([, options]) => (options?.method ?? "GET") === "GET",
        ),
    ).toBe(true);
  });
  it("keeps a failed description, generates one editable draft on retry and aborts on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = await renderPage("team/model+A", true);
    const input = await screen.findByRole("textbox", {
      name: "Describe your agent",
    });
    fireEvent.change(input, { target: { value: "Write weekly summaries" } });
    const run = screen.getByRole("button", { name: "Generate" });
    vi.mocked(generateAgentDraft)
      .mockRejectedValueOnce(new Error("Retry this draft"))
      .mockResolvedValueOnce({
        name: "Summary agent",
        description: "Weekly report",
        system: "Report changes.",
      });
    await user.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Retry this draft",
    );
    expect(input).toHaveValue("Write weekly summaries");
    await user.click(run);
    expect(screen.getByLabelText("Name")).toHaveValue("Summary agent");
    const point = screen.getByRole("button", { name: /Starting point/ });
    await user.click(point);
    vi.mocked(generateAgentDraft).mockImplementationOnce(
      () => new Promise(() => {}),
    );
    await user.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("button", { name: "Create agent" })).toBeDisabled();
    const signal = vi.mocked(generateAgentDraft).mock.calls.at(-1)![4];
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("edits model, effort and speed in one menu and round-trips the Raw format", async () => {
    const user = userEvent.setup();
    await renderPage("team/model+A");
    const model = await screen.findByRole("button", { name: "Model" });
    await user.click(model);
    const menu = await screen.findByRole("dialog", { name: "Model settings" });
    await user.click(within(menu).getByRole("radio", { name: "alternate" }));
    await user.selectOptions(within(menu).getByLabelText("Effort"), "max");
    await user.click(within(menu).getByRole("switch", { name: "Fast speed" }));
    await user.keyboard("{Escape}");
    expect(model).toHaveAttribute("data-effort", "max");
    await user.click(screen.getByRole("radio", { name: "raw" }));
    screen.getByRole("button", { name: "Config format: YAML" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(await screen.findByRole("menuitem", { name: "JSON" }));
    const raw = screen.getByLabelText(
      "Raw agent config",
    ) as HTMLTextAreaElement;
    expect(JSON.parse(raw.value).model).toEqual({
      id: "alternate",
      effort: "max",
      speed: "fast",
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    await user.click(
      screen.getByRole("button", { name: "Copy configuration" }),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(raw.value);
  });

  it("allows an operator to specify a model ID when the gateway is unavailable", async () => {
    const user = userEvent.setup();
    await renderPage(undefined, false, false);
    await user.click(await screen.findByRole("button", { name: "Model" }));
    const input = screen.getByRole("textbox", { name: "Model ID" });
    fireEvent.change(input, { target: { value: "self-hosted/model" } });
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Model" })).toHaveAttribute(
      "data-model",
      "self-hosted/model",
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Describe your agent" }),
      { target: { value: "Draft a report" } },
    );
    expect(
      screen.getByText("Generating a draft requires Playground access."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
  });
});
