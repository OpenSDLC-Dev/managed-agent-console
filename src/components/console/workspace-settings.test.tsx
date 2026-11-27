import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import * as native from "@/lib/platform/native";
import {
  workspaceAPI,
  workspaceSettings,
  type WorkspaceMember,
} from "@/lib/platform/workspaces";
import { WorkspaceDetails, WorkspaceSettings } from "./workspace-settings";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const id = "wrkspc_00000000000000000000000002";
const base = workspaceAPI + "/" + id;
const research = {
  id,
  name: "Research",
  display_color: "#123abc",
  archived_at: null,
};
const inherited: WorkspaceMember = {
  id: "user_billing",
  name: "Billing member",
  role: "billing",
  type: "user",
  inherited: true,
};

function mount(children: ReactNode, role: native.Role = "admin") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const session = {
    data: { id: "user_me", signed_in: true, role },
  } as ReturnType<typeof useConsoleSession>;
  return render(
    <QueryClientProvider client={client}>
      <ConsoleSessionContext.Provider value={session}>
        {children}
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  navigation.replace.mockClear();
});

it("creates and filters workspace rows, preserving history outside the active links", async () => {
  const user = userEvent.setup();
  const entries = [
    {
      id: "default",
      public_id: "wrkspc_00000000000000000000000001",
      name: "Default",
      role: "admin",
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: entries })),
  );
  const rows = [research];
  const list = vi
    .spyOn(native, "nativeGet")
    .mockImplementation(async (_path, params) =>
      params?.include_archived
        ? [
            ...rows,
            {
              ...research,
              id: "old",
              name: "Retired",
              archived_at: "2026-11-26",
            },
          ]
        : [...rows],
    );
  const write = vi
    .spyOn(native, "nativeWrite")
    .mockRejectedValueOnce(new Error("Name is already used"))
    .mockImplementation(async () => {
      rows.push({ ...research, id: "new", name: "Design" });
      return rows[1];
    });
  mount(<WorkspaceSettings />);
  expect(await screen.findByRole("link", { name: "Research" })).toHaveAttribute(
    "href",
    expect.stringContaining(id),
  );
  expect(screen.getByRole("link", { name: "Default" })).toBeVisible();
  await user.type(
    screen.getByRole("textbox", { name: "Search workspaces" }),
    "absent",
  );
  expect(screen.getByText("No workspaces found.")).toBeVisible();
  await user.clear(screen.getByRole("textbox", { name: "Search workspaces" }));
  await user.click(screen.getByRole("button", { name: "Create workspace" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
  );
  await user.click(screen.getByRole("button", { name: "Create workspace" }));
  const form = within(screen.getByRole("dialog"));
  await user.type(form.getByLabelText("Name"), "Design");
  await user.click(form.getByRole("button", { name: "Create workspace" }));
  expect(await screen.findByText("Name is already used")).toBeVisible();
  await user.click(form.getByRole("button", { name: "Create workspace" }));
  expect(await screen.findByRole("link", { name: "Design" })).toBeVisible();
  expect(write).toHaveBeenLastCalledWith(workspaceAPI, { name: "Design" });
  await user.click(screen.getByLabelText("Show archived"));
  expect(await screen.findByText("Retired")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Retired" })).toBeNull();
  expect(list).toHaveBeenCalledWith(
    workspaceAPI,
    { include_archived: true },
    expect.anything(),
  );
});

it("edits the workspace, grants and withdraws membership, and confirms archive", async () => {
  const user = userEvent.setup();
  let row = { ...research };
  let members = [inherited];
  vi.spyOn(native, "nativeGet").mockImplementation(async (path) => {
    if (path === base) return row;
    if (path === base + "/members") return members;
    throw new Error("Unexpected read " + path);
  });
  const write = vi
    .spyOn(native, "nativeWrite")
    .mockImplementation(async (path, body, method) => {
      if (path === base && body) row = { ...row, ...body };
      else if (path === base + "/members")
        members = [
          ...members,
          {
            id: "svac_ci",
            name: "CI service",
            role: "limited_developer",
            type: "service_account",
            inherited: false,
          },
        ];
      else if (path === base + "/members/svac_ci" && method === "DELETE")
        members = [inherited];
      else if (path !== base + "/archive")
        throw new Error("Unexpected write " + path);
      return {};
    });
  mount(<WorkspaceDetails id={id} />);
  expect(
    await screen.findByRole("heading", { name: "Research" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Remove grant for Billing member" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Edit workspace" }));
  const edit = within(screen.getByRole("dialog"));
  await user.clear(edit.getByLabelText("Name"));
  await user.type(edit.getByLabelText("Name"), "Research team");
  fireEvent.change(edit.getByLabelText("Display color"), {
    target: { value: "#114488" },
  });
  await user.click(edit.getByRole("button", { name: "Save changes" }));
  expect(
    await screen.findByRole("heading", { name: "Research team" }),
  ).toBeVisible();
  expect(write).toHaveBeenCalledWith(base, {
    name: "Research team",
    display_color: "#114488",
  });
  await user.type(
    screen.getByLabelText("Member or service account ID"),
    "svac_ci",
  );
  await user.selectOptions(
    screen.getByLabelText("Workspace role"),
    "limited_developer",
  );
  await user.click(screen.getByRole("button", { name: "Save grant" }));
  const remove = await screen.findByRole("button", {
    name: "Remove grant for CI service",
  });
  expect(write).toHaveBeenCalledWith(base + "/members", {
    principal_id: "svac_ci",
    role: "limited_developer",
  });
  await user.click(remove);
  await waitFor(() => expect(screen.queryByText("CI service")).toBeNull());
  expect(write).toHaveBeenCalledWith(
    base + "/members/svac_ci",
    undefined,
    "DELETE",
  );
  await user.click(screen.getByRole("button", { name: "Archive workspace" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
  );
  expect(write).not.toHaveBeenCalledWith(base + "/archive", {});
  await user.click(screen.getByRole("button", { name: "Archive workspace" }));
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Archive workspace",
    }),
  );
  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith(workspaceSettings),
  );
  expect(write).toHaveBeenCalledWith(base + "/archive", {});
});

it("keeps Default permanent and reserves lifecycle controls for the organization administrator", async () => {
  const read = vi.spyOn(native, "nativeGet").mockResolvedValue([inherited]);
  const view = mount(<WorkspaceDetails id="default" />, "developer");
  expect(await screen.findByText("Billing member")).toBeVisible();
  expect(read).toHaveBeenCalledWith(
    workspaceAPI + "/default/members",
    undefined,
    expect.anything(),
  );
  expect(screen.queryByRole("button", { name: "Edit workspace" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Archive workspace" }),
  ).toBeNull();
  view.unmount();
  read.mockResolvedValue([research]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  mount(<WorkspaceSettings />, "developer");
  expect(await screen.findByRole("link", { name: "Research" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Create workspace" })).toBeNull();
  expect(screen.queryByLabelText("Show archived")).toBeNull();
});
