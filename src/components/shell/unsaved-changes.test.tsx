import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignedInAs } from "./signed-in-as";
import { StrictMode, useState } from "react";
import { UnsavedChangesProvider, useUnsavedChanges } from "./unsaved-changes";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function Draft({ leave }: { leave: () => void }) {
  const [dirty, setDirty] = useState(false);
  const actions = useUnsavedChanges(dirty);
  return (
    <>
      <input
        aria-label="Draft"
        type="checkbox"
        checked={dirty}
        onChange={(e) => setDirty(e.target.checked)}
      />
      <button onClick={() => actions.requestLeave(leave)}>Cancel edit</button>
      <button onClick={() => actions.setDirty(false)}>Saved</button>
      <Link href="/memory-stores">Memory stores</Link>
    </>
  );
}
function mount() {
  const leave = vi.fn();
  render(
    <StrictMode>
      <UnsavedChangesProvider>
        <Draft leave={leave} />
      </UnsavedChangesProvider>
    </StrictMode>,
  );
  return leave;
}

it("lets clean cancellations through and preserves dirty state on Stay", async () => {
  const user = userEvent.setup();
  const leave = mount();
  await user.click(screen.getByText("Cancel edit"));
  expect(leave).toHaveBeenCalledOnce();
  await user.click(screen.getByLabelText("Draft"));
  await user.click(screen.getByText("Cancel edit"));
  await user.click(await screen.findByRole("button", { name: "Stay" }));
  expect(screen.getByLabelText("Draft")).toBeChecked();
  await user.click(screen.getByText("Cancel edit"));
  await user.click(await screen.findByRole("button", { name: "Leave" }));
  expect(leave).toHaveBeenCalledTimes(2);
});

it("guards internal links and clears the browser unload guard after saving", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByLabelText("Draft"));
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await user.click(screen.getByText("Memory stores"));
  expect(push).not.toHaveBeenCalled();
  await user.click(await screen.findByRole("button", { name: "Leave" }));
  expect(push).toHaveBeenCalledWith("/memory-stores");
  const retained = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(retained);
  expect(retained.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByText("Saved"));
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
});

it("does not destroy the sign-in session while an operator chooses Stay", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ signed_in: true, name: "Operator" }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <UnsavedChangesProvider>
        <Draft leave={vi.fn()} />
        <SignedInAs />
      </UnsavedChangesProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Draft"));
  await user.click(await screen.findByRole("button", { name: "Sign out" }));
  await user.click(await screen.findByRole("button", { name: "Stay" }));
  expect(fetchMock.mock.calls).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Sign out" }));
  await user.click(await screen.findByRole("button", { name: "Leave" }));
  expect(fetchMock.mock.calls).toHaveLength(2);
  const unloading = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unloading);
  expect(unloading.defaultPrevented).toBe(false);
});

it("keeps a mounted dirty editor guarded when an accepted action does not leave", async () => {
  const user = userEvent.setup();
  const leave = mount();
  await user.click(screen.getByLabelText("Draft"));
  await user.click(screen.getByText("Cancel edit"));
  await user.click(await screen.findByRole("button", { name: "Leave" }));
  expect(leave).toHaveBeenCalledOnce();
  await user.click(screen.getByText("Cancel edit"));
  expect(await screen.findByRole("button", { name: "Stay" })).toBeVisible();
  expect(leave).toHaveBeenCalledOnce();
});
