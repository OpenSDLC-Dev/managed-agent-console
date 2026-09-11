import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { StrictMode, useState } from "react";
import { UnsavedChangesProvider, useUnsavedChanges } from "./unsaved-changes";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByText("Saved"));
});
