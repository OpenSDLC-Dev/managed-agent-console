import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, type ComponentProps } from "react";
import DreamDetailPage from "./page";
import { dreams } from "../../../../../test/mock-platform/fixtures.mjs";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderPage(index = 0) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify(dreams[index]), { status: 200 }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <DreamDetailPage params={params(dreams[index].id)} />
      </Suspense>
    </QueryClientProvider>,
  );
}

function params(id: string): Promise<{ id: string }> {
  const value = { id };
  return {
    status: "fulfilled",
    value,
    then: (done: (value: { id: string }) => void) => done(value),
  } as unknown as Promise<{ id: string }>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("DreamDetailPage", () => {
  it("renders a completed dream's inputs, outputs and usage", async () => {
    renderPage();
    expect(await screen.findByText("18,400")).toHaveAttribute(
      "data-input-tokens",
      "18400",
    );
    expect(
      document.querySelector('[data-session-count="2"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-output-count="1"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("Create a new memory store")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel dream" })).toBeNull();
  });

  it("offers cancellation for an active dream", async () => {
    renderPage(1);
    expect(
      await screen.findByRole("button", { name: "Cancel dream" }),
    ).toBeEnabled();
    expect(
      document.querySelector('[data-output-count="0"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("Update the input store")).toBeInTheDocument();
  });
});
