import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionOutcomes } from "./session-outcomes";
import type { OutcomeEvaluation } from "@/lib/platform/types";

const outcome = (over: Partial<OutcomeEvaluation> = {}): OutcomeEvaluation => ({
  type: "outcome_evaluation",
  outcome_id: "outc_000000000000000000000001",
  description: "Produce a comparative survey.",
  explanation: "Six frameworks are compared.",
  iteration: 1,
  result: "satisfied",
  completed_at: "2026-09-09T08:00:00Z",
  ...over,
});

function renderOutcomes(outcomes: OutcomeEvaluation[] = []) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionOutcomes sessionId="sesn_1" outcomes={outcomes} />
    </QueryClientProvider>,
  );
}

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SessionOutcomes", () => {
  it("renders evaluation state and exposes its raw result and iteration", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderOutcomes([outcome()]);

    const list = screen.getByTestId("session-outcomes");
    expect(list).toHaveAttribute("data-outcome-count", "1");
    expect(list).toHaveAttribute("data-active-outcome", "false");
    const row = screen.getByTestId("outcome-evaluation");
    expect(row).toHaveAttribute("data-outcome-result", "satisfied");
    expect(row).toHaveAttribute("data-outcome-iteration", "1");
    expect(row).toHaveTextContent("Iteration 2");
    expect(row).toHaveTextContent("Six frameworks are compared.");
  });

  it("disables defining another outcome while one is active", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderOutcomes([
      outcome({ result: "evaluating", completed_at: null, explanation: "" }),
    ]);

    expect(screen.getByTestId("session-outcomes")).toHaveAttribute(
      "data-active-outcome",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Define outcome" }),
    ).toBeDisabled();
  });

  it("posts the exact text-rubric event and resets after success", async () => {
    const fetchMock = vi.fn(async () => json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderOutcomes();

    await user.click(screen.getByRole("button", { name: "Define outcome" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Build a DCF model" },
    });
    fireEvent.change(within(dialog).getByLabelText("Rubric"), {
      target: { value: "Includes sensitivity analysis" },
    });
    fireEvent.change(within(dialog).getByLabelText("Maximum iterations"), {
      target: { value: "5" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Define outcome" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/platform/v1/sessions/sesn_1/events");
    expect(JSON.parse(init.body as string)).toEqual({
      events: [
        {
          type: "user.define_outcome",
          description: "Build a DCF model",
          rubric: { type: "text", content: "Includes sensitivity analysis" },
          max_iterations: 5,
        },
      ],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("suggests uploaded rubric files while preserving raw ID entry", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json({ data: [] })
        : json({
            data: [
              {
                id: "file_rubric1",
                type: "file",
                filename: "rubric.md",
                mime_type: "text/markdown",
                size_bytes: 42,
                downloadable: false,
                scope: null,
                created_at: "2026-09-09T08:00:00Z",
              },
            ],
            has_more: false,
            first_id: "file_rubric1",
            last_id: "file_rubric1",
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderOutcomes();

    await user.click(screen.getByRole("button", { name: "Define outcome" }));
    await user.click(screen.getByLabelText("Rubric type"));
    await user.click(await screen.findByRole("option", { name: "File" }));
    await waitFor(() =>
      expect(
        document.querySelector(
          'datalist#outcome-rubric-files option[value="file_rubric1"]',
        ),
      ).toHaveTextContent("rubric.md"),
    );
    expect(
      screen.getByText("Choose a suggestion by filename or paste a file ID."),
    ).toHaveAttribute("data-file-options-state", "ready");
  });
});
