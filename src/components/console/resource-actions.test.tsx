import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ResourceActions } from "./resource-actions";

afterEach(cleanup);

describe("ResourceActions", () => {
  it("renders nothing when there is nothing to do", () => {
    const { container } = render(<ResourceActions resource="agent" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hides Archive on an already-archived row and keeps Delete", async () => {
    render(
      <ResourceActions
        resource="environment"
        archived
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("confirms Archive through the same dialog the header button used", async () => {
    const onArchive = vi.fn();
    render(<ResourceActions resource="environment" onArchive={onArchive} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(
      screen.getByRole("heading", { name: "Archive this environment?" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Archive environment" }),
    );
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("moves keyboard focus through the menu and returns it on Escape", async () => {
    const user = userEvent.setup();
    render(
      <ResourceActions
        resource="environment"
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });

    await user.click(trigger);
    const archive = screen.getByRole("menuitem", { name: "Archive" });
    await waitFor(() => expect(archive).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("disables a pending direct archive and keeps keyboard access to Delete", async () => {
    const onArchive = vi.fn();
    const view = render(
      <ResourceActions
        resource="session"
        confirmArchive={false}
        onArchive={onArchive}
        onDelete={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Enter}");
    expect(onArchive).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    view.rerender(
      <ResourceActions
        resource="session"
        confirmArchive={false}
        onArchive={onArchive}
        onDelete={vi.fn()}
        archivePending
      />,
    );
    await userEvent.click(trigger);
    const archive = screen.getByRole("menuitem", { name: "Archive" });
    expect(archive).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus(),
    );
    await userEvent.click(archive);
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("closes the menu and continues the tab sequence", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ResourceActions
          resource="environment"
          onArchive={vi.fn()}
          onDelete={vi.fn()}
        />
        <button type="button">Next control</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });

    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Archive" })).toHaveFocus(),
    );
    await user.keyboard("{Tab}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Next control" })).toHaveFocus();
  });
});
