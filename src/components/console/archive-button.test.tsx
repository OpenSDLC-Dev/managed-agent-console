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
import { Trash2 } from "lucide-react";
import {
  ArchiveButton,
  ConfirmButton,
  ConfirmIconButton,
  DeleteButton,
} from "./archive-button";

afterEach(cleanup);

describe("ConfirmButton", () => {
  it("opens the confirm dialog, confirms, and closes", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmButton
        action="Detach"
        resource="thing"
        description="This cannot be undone."
        icon={<span />}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Detach" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Detach this thing?")).toBeDefined();
    expect(within(dialog).getByText("This cannot be undone.")).toBeDefined();

    await user.click(
      within(dialog).getByRole("button", { name: "Detach thing" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancel closes without confirming", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmButton
        action="Detach"
        resource="thing"
        description="d"
        icon={<span />}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Detach" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables the confirm action while pending and applies the trigger class", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmButton
        action="Detach"
        resource="thing"
        description="d"
        icon={<span />}
        onConfirm={vi.fn()}
        pending
        triggerClassName="text-destructive"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Detach" });
    expect(trigger.className).toContain("text-destructive");
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Detach thing" }),
    ).toBeDisabled();
  });
});

describe("ArchiveButton", () => {
  it("shows the terminal-archive copy and confirms", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ArchiveButton resource="agent" onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Archive this agent?")).toBeDefined();
    expect(
      within(dialog).getByText(
        "Archiving is terminal on the platform — the agent becomes read-only and cannot be unarchived.",
      ),
    ).toBeDefined();

    await user.click(
      within(dialog).getByRole("button", { name: "Archive agent" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("appends the extra warning when given", async () => {
    const user = userEvent.setup();
    render(
      <ArchiveButton
        resource="vault"
        warning="Sessions holding it lose access."
        onConfirm={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Archiving is terminal on the platform — the vault becomes read-only and cannot be unarchived. Sessions holding it lose access.",
      ),
    ).toBeDefined();
  });
});

describe("DeleteButton", () => {
  it("renders a destructive trigger and confirms with the given description", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteButton
        resource="environment"
        description="Deletes it permanently."
        onConfirm={onConfirm}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Delete" });
    expect(trigger.className).toContain("text-destructive");
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this environment?")).toBeDefined();
    expect(within(dialog).getByText("Deletes it permanently.")).toBeDefined();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete environment" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("ConfirmIconButton", () => {
  it("opens from the labeled icon trigger, confirms, and closes", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmIconButton
        label="Delete credential"
        title="Delete credential"
        description="The secret is destroyed."
        onConfirm={onConfirm}
      >
        <Trash2 />
      </ConfirmIconButton>,
    );

    await user.click(screen.getByRole("button", { name: "Delete credential" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The secret is destroyed.")).toBeDefined();

    await user.click(
      within(dialog).getByRole("button", { name: "Delete credential" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancel closes without confirming", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmIconButton
        label="Delete file"
        title="Delete file"
        description="d"
        onConfirm={onConfirm}
      >
        <Trash2 />
      </ConfirmIconButton>,
    );

    await user.click(screen.getByRole("button", { name: "Delete file" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables the trigger while pending", () => {
    render(
      <ConfirmIconButton
        label="Delete file"
        title="Delete file"
        description="d"
        onConfirm={vi.fn()}
        pending
      >
        <Trash2 />
      </ConfirmIconButton>,
    );
    expect(screen.getByRole("button", { name: "Delete file" })).toBeDisabled();
  });
});
