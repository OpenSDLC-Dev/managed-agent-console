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

  it("stops an open dialog from submitting after an outcome becomes active", async () => {
    const fetchMock = vi.fn(async () => json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <SessionOutcomes sessionId="sesn_1" outcomes={[]} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Define outcome" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Description"), {
      target: { value: "Ship a tested patch" },
    });
    fireEvent.change(within(dialog).getByLabelText("Rubric"), {
      target: { value: "Lint and tests pass." },
    });

    view.rerender(
      <QueryClientProvider client={client}>
        <SessionOutcomes
          sessionId="sesn_1"
          outcomes={[
            outcome({
              result: "running",
              completed_at: null,
              explanation: "",
            }),
          ]}
        />
      </QueryClientProvider>,
    );
    const submit = within(dialog).getByRole("button", {
      name: "Define outcome",
    });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("suggests uploads and the session's own files, labelled apart, while preserving raw ID entry", async () => {
    const file = (id: string, filename: string, over = {}) => ({
      id,
      type: "file",
      filename,
      mime_type: "text/markdown",
      size_bytes: 42,
      downloadable: false,
      expires_at: null,
      created_at: "2026-09-09T08:00:00Z",
      ...over,
    });
    const scope = { id: "sesn_1", type: "session" };
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json({ data: [] })
        : json({
            data: input.includes("scope_id=sesn_1")
              ? [
                  file("file_copy1", "rubric.md", { scope }),
                  file("file_output1", "criteria.md", {
                    scope,
                    downloadable: true,
                  }),
                  file("file_bigoutput", "huge.md", {
                    scope,
                    size_bytes: 256 * 1024 + 1,
                  }),
                  file("file_expiredcopy", "stale.md", {
                    scope,
                    expires_at: "2026-01-01T00:00:00Z",
                  }),
                ]
              : [
                  file("file_rubric1", "rubric.md"),
                  file("file_expiredupload", "old.md", {
                    expires_at: "2026-01-01T00:00:00Z",
                  }),
                  file("file_later", "later.md", {
                    expires_at: "2999-01-01T00:00:00Z",
                  }),
                ],
            next_page: null,
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderOutcomes();

    await user.click(screen.getByRole("button", { name: "Define outcome" }));
    await user.click(screen.getByLabelText("Rubric type"));
    await user.click(await screen.findByRole("option", { name: "File" }));
    const option = (id: string) =>
      document.querySelector(
        `datalist#outcome-rubric-files option[value="${id}"]`,
      );
    await waitFor(() => expect(option("file_copy1")).not.toBeNull());
    expect(option("file_rubric1")).toHaveTextContent("rubric.md · upload");
    expect(option("file_rubric1")).toHaveAttribute(
      "data-file-origin",
      "upload",
    );
    expect(option("file_copy1")).toHaveAttribute(
      "data-file-origin",
      "session file",
    );
    expect(option("file_output1")).toHaveAttribute(
      "data-file-origin",
      "session file",
    );
    // The platform's 256 KiB rubric limit applies to a session's files too.
    expect(option("file_bigoutput")).toBeNull();
    // An expired file is no rubric (ValidateDefineOutcomes reads live rows);
    // one that expires later still is.
    expect(option("file_expiredcopy")).toBeNull();
    expect(option("file_expiredupload")).toBeNull();
    expect(option("file_later")).not.toBeNull();
    expect(
      fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith("/api/platform/v1/files")),
    ).toEqual([
      "/api/platform/v1/files?limit=1000",
      "/api/platform/v1/files?scope_id=sesn_1&limit=1000",
    ]);
    expect(
      screen.getByText("Choose a suggestion by filename or paste a file ID."),
    ).toHaveAttribute("data-file-options-state", "ready");
  });

  describe("rubric file suggestions", () => {
    const file = (id: string, over = {}) => ({
      id,
      type: "file",
      filename: `${id}.md`,
      mime_type: "text/markdown",
      size_bytes: 42,
      downloadable: false,
      expires_at: null,
      created_at: "2026-09-09T08:00:00Z",
      ...over,
    });
    const scope = { id: "sesn_1", type: "session" };
    const failure = (status: number) =>
      new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: status === 404 ? "not_found_error" : "api_error",
            message: "down",
          },
        }),
        { status, headers: { "content-type": "application/json" } },
      );
    // Each list's answer: a page, or the status of a refusal. A fresh
    // Response per read, since a body reads once.
    async function openPicker(
      uploads: number | object,
      scoped: number | object,
    ) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
          const answer = input.includes("scope_id=") ? scoped : uploads;
          return typeof answer === "number" ? failure(answer) : json(answer);
        }),
      );
      const user = userEvent.setup();
      renderOutcomes();
      await user.click(screen.getByRole("button", { name: "Define outcome" }));
      await user.click(screen.getByLabelText("Rubric type"));
      await user.click(await screen.findByRole("option", { name: "File" }));
      const hint = () =>
        document.querySelector("[data-file-options-state]") as HTMLElement;
      await waitFor(() =>
        expect(hint()).not.toHaveAttribute(
          "data-file-options-state",
          "loading",
        ),
      );
      return hint();
    }
    const options = () =>
      [
        ...document.querySelectorAll("datalist#outcome-rubric-files option"),
      ].map((option) => [
        option.getAttribute("value"),
        option.getAttribute("data-file-origin"),
      ]);

    it("offers a file both lists carry once, as the session's own", async () => {
      // A platform before #578 lists the session's outputs unfiltered too.
      const output = file("file_output", { scope, downloadable: true });
      const hint = await openPicker(
        { data: [file("file_upload"), output] },
        { data: [output] },
      );
      expect(hint).toHaveAttribute("data-file-options-state", "ready");
      expect(options()).toEqual([
        ["file_upload", "upload"],
        ["file_output", "session file"],
      ]);
    });

    it("keeps the uploads when the session's own files fail, and says which list failed", async () => {
      const hint = await openPicker({ data: [file("file_upload")] }, 500);
      expect(hint).toHaveAttribute("data-file-options-state", "error");
      expect(options()).toEqual([["file_upload", "upload"]]);
      expect(hint.querySelector("[data-file-list]")).toHaveAttribute(
        "data-file-list",
        "session",
      );
      expect(hint.querySelector("[data-file-list]")).toHaveAttribute(
        "data-file-list-state",
        "error",
      );
    });

    it("leaves out a list that is not served, as an absent surface", async () => {
      const hint = await openPicker({ data: [file("file_upload")] }, 404);
      expect(options()).toEqual([["file_upload", "upload"]]);
      expect(hint.querySelector("[data-file-list]")).toBeNull();
    });

    it("keeps the session's own files when the uploads fail", async () => {
      const hint = await openPicker(500, {
        data: [file("file_copy", { scope })],
      });
      expect(options()).toEqual([["file_copy", "session file"]]);
      expect(hint.querySelector("[data-file-list]")).toHaveAttribute(
        "data-file-list",
        "uploads",
      );
    });

    it("keeps the rows each list last read when a later read fails", async () => {
      const answers: Record<"uploads" | "scoped", number | object> = {
        uploads: { data: [file("file_upload")] },
        scoped: { data: [file("file_copy", { scope })] },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
          const answer = input.includes("scope_id=")
            ? answers.scoped
            : answers.uploads;
          return typeof answer === "number" ? failure(answer) : json(answer);
        }),
      );
      const user = userEvent.setup();
      renderOutcomes();
      await user.click(screen.getByRole("button", { name: "Define outcome" }));
      await user.click(screen.getByLabelText("Rubric type"));
      await user.click(await screen.findByRole("option", { name: "File" }));
      await waitFor(() => expect(options()).toHaveLength(2));

      // Reopened, the picker reads both lists again, and both refuse.
      answers.uploads = 500;
      answers.scoped = 500;
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await user.click(screen.getByRole("button", { name: "Define outcome" }));
      const hint = () =>
        document.querySelector("[data-file-options-state]") as HTMLElement;
      await waitFor(() =>
        expect(hint().querySelectorAll("[data-file-list]")).toHaveLength(2),
      );
      expect(
        [...hint().querySelectorAll("[data-file-list]")].map((note) =>
          note.getAttribute("data-file-list-state"),
        ),
      ).toEqual(["error", "error"]);
      expect(hint()).toHaveAttribute("data-file-options-state", "error");
      expect(options()).toEqual([
        ["file_upload", "upload"],
        ["file_copy", "session file"],
      ]);
    });

    it("says a cut list failed, not that it was cut, once a later read fails", async () => {
      let uploads: number | object = {
        data: [file("file_a"), file("file_b")],
        next_page: "more-uploads",
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
          if (input.includes("scope_id=")) return json({ data: [] });
          return typeof uploads === "number" ? failure(uploads) : json(uploads);
        }),
      );
      const user = userEvent.setup();
      renderOutcomes();
      await user.click(screen.getByRole("button", { name: "Define outcome" }));
      await user.click(screen.getByLabelText("Rubric type"));
      await user.click(await screen.findByRole("option", { name: "File" }));
      const hint = () =>
        document.querySelector("[data-file-options-state]") as HTMLElement;
      await waitFor(() =>
        expect(hint()).toHaveAttribute("data-file-options-state", "truncated"),
      );

      // Reopened, the uploads refuse: their last rows stay offered, and the
      // list and the picker both say it failed.
      uploads = 500;
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await user.click(screen.getByRole("button", { name: "Define outcome" }));
      await waitFor(() =>
        expect(hint()).toHaveAttribute("data-file-options-state", "error"),
      );
      const notes = hint().querySelectorAll("[data-file-list]");
      expect(notes).toHaveLength(1);
      expect(notes[0]).toHaveAttribute("data-file-list", "uploads");
      expect(notes[0]).toHaveAttribute("data-file-list-state", "error");
      expect(options()).toEqual([
        ["file_a", "upload"],
        ["file_b", "upload"],
      ]);
    });

    it("falls back to raw ID entry when neither list loads", async () => {
      const hint = await openPicker(500, 500);
      expect(hint).toHaveAttribute("data-file-options-state", "error");
      expect(options()).toEqual([]);
    });

    it("names the list that was cut, at the count it returned", async () => {
      const hint = await openPicker(
        {
          data: [file("file_a"), file("file_b")],
          next_page: "more-uploads",
        },
        { data: [file("file_copy", { scope })], next_page: null },
      );
      expect(hint).toHaveAttribute("data-file-options-state", "truncated");
      const cut = hint.querySelectorAll("[data-file-list]");
      expect(cut).toHaveLength(1);
      expect(cut[0]).toHaveAttribute("data-file-list", "uploads");
      expect(cut[0]).toHaveAttribute("data-file-list-state", "truncated");
      expect(cut[0]).toHaveAttribute("data-file-list-count", "2");
      // The one assertion on the sentence.
      expect(hint).toHaveTextContent(
        "Showing the first 2 uploads. Choose a suggestion by filename or paste a file ID.",
      );
    });

    it("says when the session's own files were cut", async () => {
      const hint = await openPicker(
        { data: [file("file_a")], next_page: null },
        { data: [file("file_copy", { scope })], next_page: "more" },
      );
      expect(hint).toHaveAttribute("data-file-options-state", "truncated");
      expect(hint.querySelector("[data-file-list]")).toHaveAttribute(
        "data-file-list",
        "session",
      );
      expect(hint.querySelector("[data-file-list]")).toHaveAttribute(
        "data-file-list-count",
        "1",
      );
    });
  });
});
