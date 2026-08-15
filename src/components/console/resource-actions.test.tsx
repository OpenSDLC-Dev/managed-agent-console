import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
