import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateVaultButton } from "./create-vault-button";

const pushSpy = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/vaults",
  useSearchParams: () => new URLSearchParams(),
}));

function renderButton() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <CreateVaultButton />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockReset();
});

describe("CreateVaultButton", () => {
  it("creates the vault at Continue and retains it when the credential step is skipped", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: "vlt_1", type: "vault", display_name: "Prod" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Create vault/ }));
    const dialog = await screen.findByRole("dialog");

    const submit = within(dialog).getByRole("button", {
      name: "Continue",
    });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "  Prod  ");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/platform/v1/vaults");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      display_name: "Prod",
      metadata: {},
    });
    expect(
      await screen.findByRole("dialog", { name: "Add a credential" }),
    ).toBeVisible();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Credential type")).toHaveTextContent(
      "MCP OAuth",
    );
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/vaults/vlt_1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the platform error message and keeps the dialog open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: { type: "invalid_request_error", message: "name taken" },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Create vault/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Name"), "Prod");
    await user.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("name taken")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("cancel closes the dialog", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Create vault/ }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("dismissing the dialog resets the form for the next open", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Create vault/ }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Name"), "scratch");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: /Create vault/ }));
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });
});

// Continue commits the parent; a child failure must not create another vault.
it("retries a failed first credential against the same vault and then opens the vault", async () => {
  let childCalls = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (!url.includes("/credentials"))
      return new Response(
        JSON.stringify({ id: "vlt_new", display_name: "New vault" }),
      );
    childCalls++;
    return childCalls === 1
      ? new Response(
          JSON.stringify({
            error: { type: "invalid_request_error", message: "Try again" },
          }),
          { status: 400 },
        )
      : new Response(JSON.stringify({ id: "vcred_new" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  renderButton();
  await user.click(screen.getByRole("button", { name: "Create vault" }));
  await user.type(screen.getByLabelText("Name"), "New vault");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Add a credential",
  });
  expect(
    within(dialog).getByText(
      /Secrets are sealed when saved and cannot be read back/,
    ),
  ).toBeVisible();
  await user.type(
    screen.getByLabelText("MCP server URL"),
    "https://mcp.example.com",
  );
  await user.type(screen.getByLabelText("Access token"), "synthetic-fixture");
  await user.click(
    within(dialog).getByRole("button", { name: "Add credential" }),
  );
  expect(await screen.findByText("Try again")).toBeVisible();
  expect(pushSpy).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Access token")).toHaveValue(
    "synthetic-fixture",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Add credential" }),
  );
  await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/vaults/vlt_new"));
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/platform/v1/vaults",
    "/api/platform/v1/vaults/vlt_new/credentials",
    "/api/platform/v1/vaults/vlt_new/credentials",
  ]);
});
