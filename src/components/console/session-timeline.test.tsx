import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionEvent, SessionThread } from "@/lib/platform/types";
import {
  sessionEvents,
  sessionThreads,
} from "../../../test/mock-platform/fixtures.mjs";
import { SessionTimeline } from "./session-timeline";
import { SessionThreadPreview } from "./session-thread-preview";

afterEach(cleanup);
const events = sessionEvents.sesn_gatedbash00000000001 as SessionEvent[];
const thread = sessionThreads.sesn_gatedbash00000000001[0] as SessionThread;
function timeline(items: SessionEvent[] = events) {
  const onSelect = vi.fn();
  render(
    <SessionTimeline
      events={items}
      scopeId="sesn_test"
      selectedId={null}
      onSelect={onSelect}
      actions={null}
    >
      {null}
    </SessionTimeline>,
  );
  return onSelect;
}

it("plots only stamped events, pairs model spans and selects the exact persisted event", async () => {
  const select = timeline([
    ...events,
    { id: "pending", type: "user.message", processed_at: null },
    { id: "bad-stamp", type: "user.message", processed_at: "invalid" },
  ]);
  const bar = screen.getByRole("group", { name: "Event timeline" });
  expect(bar).toHaveAttribute("data-timed-events", String(events.length));
  const end = within(bar).getByRole("button", {
    name: /^span.model_request_end/,
  });
  expect(end).toHaveAttribute("data-duration-ms", "3000");
  await userEvent.click(end);
  expect(select).toHaveBeenCalledWith(events[5].id);
});

it("zooms the loaded timeline with bounded native keyboard controls and resets to fit", async () => {
  timeline();
  const zoom = screen.getByRole("button", { name: "Reset timeline zoom" });
  const plus = screen.getByRole("button", { name: "Zoom in" });
  expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  plus.focus();
  await userEvent.keyboard("{Enter}");
  expect(zoom).toHaveAttribute("data-zoom", "2");
  expect(zoom).toHaveTextContent("2.00×");
  await userEvent.click(plus);
  await userEvent.click(plus);
  expect(plus).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
  expect(zoom).toHaveAttribute("data-zoom", "4");
  await userEvent.click(zoom);
  expect(zoom).toHaveAttribute("data-zoom", "1");
});

it("handles empty and coincident timelines without inventing elapsed time", () => {
  const { unmount } = render(
    <SessionTimeline
      events={[]}
      scopeId="empty"
      selectedId={null}
      onSelect={vi.fn()}
      actions={null}
    >
      {null}
    </SessionTimeline>,
  );
  expect(
    screen.getByRole("button", { name: "Download events" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  expect(screen.getByText("No timestamped events yet.")).toBeVisible();
  unmount();
  timeline([events[0]]);
  const button = within(
    screen.getByRole("group", { name: "Event timeline" }),
  ).getByRole("button");
  expect(button).toHaveStyle({ left: "calc(0% - 0px)" });
  expect(button).toHaveAttribute("data-duration-ms", "0");
});

it("shows the pinned thread Agent and model with server usage and inspectable model requests", async () => {
  const select = vi.fn();
  render(
    <SessionThreadPreview
      thread={thread}
      events={events}
      onSelectEvent={select}
    />,
  );
  const preview = screen.getByRole("region", { name: "Thread details" });
  expect(within(preview).getByRole("link", { name: /v/ })).toHaveAttribute(
    "href",
    `/agents/${thread.agent.id}?version=${thread.agent.version}`,
  );
  expect(preview).toHaveTextContent(thread.agent.model.id);
  expect(preview.querySelector("[data-input-tokens]")).toHaveAttribute(
    "data-input-tokens",
    String(events[5].model_usage!.input_tokens),
  );
  expect(preview.querySelector("dl [data-output-tokens]")).toHaveAttribute(
    "data-output-tokens",
    String(thread.usage.output_tokens),
  );
  await userEvent.click(screen.getByText("Inspect model requests"));
  await userEvent.click(
    preview.querySelector<HTMLButtonElement>("[data-event-id]")!,
  );
  expect(select).toHaveBeenCalledWith(events[5].id);
  expect(preview).not.toHaveTextContent(/Cost|Active time|Context usage/);
  await userEvent.click(screen.getByText("Thread API response"));
  expect(preview.querySelector("pre")).toHaveTextContent(thread.id);
});

it("retains a zero-token model request and leaves an absent counter unavailable", () => {
  render(
    <SessionThreadPreview
      thread={{ ...thread, usage: undefined } as unknown as SessionThread}
      events={[
        {
          ...events[5],
          model_usage: { ...events[5].model_usage!, input_tokens: 0 },
        },
      ]}
      onSelectEvent={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("img", { name: "Input tokens at each model request" }),
  ).toBeVisible();
  expect(document.querySelector("[data-event-id]")).toHaveAttribute(
    "data-input-tokens",
    "0",
  );
  expect(
    screen.getByText("Input tokens").nextElementSibling!.querySelector("span"),
  ).not.toHaveAttribute("data-input-tokens");
});

it("keeps a thread without finite model usage inspectable", () => {
  render(
    <SessionThreadPreview
      thread={thread}
      events={[
        events[0],
        {
          ...events[5],
          model_usage: { ...events[5].model_usage!, input_tokens: Infinity },
        },
      ]}
      onSelectEvent={vi.fn()}
    />,
  );
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(
    screen.getByText("No model usage in the loaded thread view."),
  ).toBeVisible();
});
