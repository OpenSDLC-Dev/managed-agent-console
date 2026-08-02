import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import userEvent from "@testing-library/user-event";
import { DataTable, type Column } from "./data-table";

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  { key: "id", header: "ID", className: "w-40", cell: (row) => row.id },
  { key: "name", header: "Name", cell: (row) => row.name },
];

const rows: Row[] = [
  { id: "agent_1", name: "Alpha" },
  { id: "agent_2", name: "Beta" },
];

const rowKey = (row: Row) => row.id;

describe("DataTable", () => {
  it("renders headers and one row per item", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={rowKey} />);
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("agent_1")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    // Header row + 2 data rows.
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows skeleton rows while loading with no data", () => {
    const { container } = render(
      <DataTable columns={columns} rows={[]} rowKey={rowKey} loading />,
    );
    // 3 skeleton rows x 2 columns.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      6,
    );
  });

  it("does not show skeletons while refetching with rows present", () => {
    const { container } = render(
      <DataTable columns={columns} rows={rows} rowKey={rowKey} loading />,
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      0,
    );
    expect(screen.getByText("agent_1")).toBeInTheDocument();
  });

  it("renders the empty node only when not loading and there are no rows", () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={rowKey}
        empty={<div>No agents yet</div>}
      />,
    );
    expect(screen.getByText("No agents yet")).toBeInTheDocument();

    rerender(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={rowKey}
        loading
        empty={<div>No agents yet</div>}
      />,
    );
    expect(screen.queryByText("No agents yet")).toBeNull();

    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        empty={<div>No agents yet</div>}
      />,
    );
    expect(screen.queryByText("No agents yet")).toBeNull();
  });

  it("invokes onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        onRowClick={onRowClick}
      />,
    );
    await userEvent.click(screen.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("makes rows focusable and activates them with Enter and Space", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        onRowClick={onRowClick}
      />,
    );
    const row = screen.getByText("agent_1").closest("tr")!;
    expect(row).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(row, { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenLastCalledWith(rows[0]);

    fireEvent.keyDown(row, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(row, { key: "a" });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("leaves rows inert without onRowClick", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={rowKey} />);
    const row = screen.getByText("agent_1").closest("tr")!;
    expect(row).not.toHaveAttribute("tabindex");
    // Clicking without a handler must not throw.
    await userEvent.click(screen.getByText("Alpha"));
    fireEvent.keyDown(row, { key: "Enter" });
  });
});
