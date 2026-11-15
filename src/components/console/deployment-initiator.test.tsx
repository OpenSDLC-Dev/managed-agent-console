import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConsoleSessionContext,
  useConsoleSession,
} from "@/components/shell/console-session";
import { DeploymentInitiator } from "./deployment-initiator";

function mount(role = "admin") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (role: string) => (
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider
        value={
          { data: { signed_in: true, id: "user_self", role } } as ReturnType<
            typeof useConsoleSession
          >
        }
      >
        <DeploymentInitiator id="depl_one" />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>
  );
  const rendered = render(view(role));
  return {
    ...rendered,
    changeRole: (role: string) => rendered.rerender(view(role)),
  };
}
function stub(writeStatus = 200) {
  let principal = "user_creator";
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://console");
      if (url.pathname === "/api/auth/session")
        return Response.json({
          signed_in: true,
          id: "user_self",
          role: "admin",
          csrf_token: "test-csrf",
        });
      if (url.pathname.endsWith("/service_accounts"))
        return Response.json({
          data: [
            {
              id: url.searchParams.has("page") ? "svac_second" : "svac_first",
              name: url.searchParams.has("page")
                ? "Second worker"
                : "First worker",
              archived_at: null,
            },
          ],
          next_page: url.searchParams.has("page") ? null : "next",
        });
      if (init?.method === "POST") {
        if (writeStatus !== 200)
          return Response.json(
            {
              error: {
                type: "permission_error",
                message: "Current role refused",
              },
            },
            { status: writeStatus },
          );
        principal = JSON.parse(String(init.body)).principal_id;
      }
      return Response.json({ principal_id: principal, api_key_id: null });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.consoleAuth;
});

it("admin selects a paginated active service account with a cookie and CSRF", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetcher = stub();
  mount();
  expect(await screen.findByText("user_creator")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Change initiator" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Load more service accounts" }),
  );
  await screen.findByRole("option", { name: "Second worker" });
  await userEvent.selectOptions(
    screen.getByLabelText("Service account"),
    "svac_second",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save initiator" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(await screen.findByText("svac_second")).toBeInTheDocument();
  const write = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
  expect(write?.[0]).toBe(
    "/api/console/organizations/default/deployments/depl_one/initiator",
  );
  expect(JSON.parse(String(write?.[1]?.body))).toEqual({
    principal_id: "svac_second",
  });
  expect(write?.[1]?.headers).toEqual({
    "content-type": "application/json",
    "X-CSRF-Token": "test-csrf",
  });
  expect(
    fetcher.mock.calls.some(([url]) => String(url).includes("/unpause")),
  ).toBe(false);
});

it("permission changes close the draft and legacy or non-admin pages make no private requests", async () => {
  const fetcher = stub();
  const view = mount();
  expect(fetcher).not.toHaveBeenCalled();
  document.documentElement.dataset.consoleAuth = "platform";
  view.changeRole("developer");
  expect(fetcher).not.toHaveBeenCalled();
  view.changeRole("admin");
  await userEvent.click(
    await screen.findByRole("button", { name: "Change initiator" }),
  );
  view.changeRole("user");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Scheduled run initiator")).not.toBeInTheDocument();
});

it("shows a server refusal without changing the saved initiator", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  stub(403);
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Change initiator" }),
  );
  await screen.findByRole("option", { name: "First worker" });
  await userEvent.selectOptions(
    screen.getByLabelText("Service account"),
    "svac_first",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save initiator" }));
  expect(await screen.findByText("Current role refused")).toBeInTheDocument();
  expect(screen.getByText("user_creator")).toBeInTheDocument();
});

it("keeps a dismissed pending write from opening a competing draft", async () => {
  document.documentElement.dataset.consoleAuth = "platform";
  const fetcher = stub();
  const original = fetcher.getMockImplementation()!;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetcher.mockImplementation(async (input, init) => {
    if (init?.method === "POST") await pending;
    return original(input, init);
  });
  mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Change initiator" }),
  );
  await screen.findByRole("option", { name: "First worker" });
  await userEvent.selectOptions(
    screen.getByLabelText("Service account"),
    "svac_first",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save initiator" }));
  await userEvent.keyboard("{Escape}");
  expect(
    screen.getByRole("button", { name: "Change initiator" }),
  ).toBeDisabled();
  release();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Change initiator" }),
    ).toBeEnabled(),
  );
});
