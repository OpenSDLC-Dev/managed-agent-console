import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DreamsPage from "./page";
import { dreams } from "../../../../test/mock-platform/fixtures.mjs";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

function renderPage() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: dreams.slice(0, 2), next_page: null }),
          {
            status: 200,
          },
        ),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DreamsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DreamsPage", () => {
  it("renders the live rows and opens a selected dream", async () => {
    renderPage();
    expect(await screen.findByText("Update input")).toBeInTheDocument();
    expect(screen.getByText("New store")).toBeInTheDocument();
    expect(
      document.querySelector('[data-session-count="2"]'),
    ).toHaveTextContent("2");

    fireEvent.click(document.querySelector(`[data-id="${dreams[0].id}"]`)!);
    expect(router.push).toHaveBeenCalledWith(`/dreams/${dreams[0].id}`);
  });

  it("opens the create route", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create dream" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create dream" }));
    expect(router.push).toHaveBeenCalledWith("/dreams/new");
  });
});
