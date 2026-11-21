import "@testing-library/jest-dom/vitest";
import { useRef, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as native from "@/lib/platform/native";
import {
  ArchiveServiceAccountDialog,
  CreateServiceAccountDialog,
} from "./service-account-dialogs";

const service: native.ServiceAccount = {
  id: "svac_123",
  type: "service_account",
  name: "release-jobs",
  description: null,
  organization_role: "developer",
  created_at: "2026-09-20T10:00:00Z",
  created_by_actor_id: "user_admin",
  updated_at: "2026-09-20T10:00:00Z",
  updated_by_actor_id: "user_admin",
  archived_at: null,
  archived_by_actor_id: null,
};
const clients: QueryClient[] = [];

async function openDialog(kind: "create" | "archive" = "create") {
  const saved = vi.fn();
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  clients.push(client);
  function Page() {
    const opener = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    function close() {
      setOpen(false);
    }
    function accept(item: native.ServiceAccount) {
      saved(item);
      close();
    }
    return (
      <>
        <button ref={opener} onClick={() => setOpen(true)}>
          Open account dialog
        </button>
        {open &&
          (kind === "create" ? (
            <CreateServiceAccountDialog
              onClose={close}
              onCreated={accept}
              returnFocus={opener}
            />
          ) : (
            <ArchiveServiceAccountDialog
              account={service}
              onClose={close}
              onArchived={accept}
              returnFocus={opener}
            />
          ))}
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Open account dialog" });
  await user.click(opener);
  const dialog = await screen.findByRole(
    kind === "archive" ? "alertdialog" : "dialog",
    {
      name:
        kind === "archive"
          ? "Archive service account"
          : "Create service account",
    },
  );
  return { user, opener, dialog, client, saved };
}

function backdrop() {
  return document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!;
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

it("validates names as entered and counts optional descriptions in Unicode code points", async () => {
  const { dialog } = await openDialog();
  const form = within(dialog);
  const name = form.getByRole("textbox", { name: "Name" });
  const description = form.getByRole("textbox", { name: /Description/ });
  const submit = form.getByRole("button", { name: "Create service account" });
  await waitFor(() => expect(name).toHaveFocus());
  expect(submit).toBeDisabled();
  expect(form.queryByRole("alert")).toBeNull();
  expect(
    form.getByRole("combobox", { name: "Organization role" }),
  ).toHaveTextContent("Developer");
  fireEvent.change(name, { target: { value: "Bad name!" } });
  expect(name).toHaveAttribute("aria-invalid", "true");
  expect(form.getByRole("alert")).toHaveTextContent(
    "Only lowercase letters, numbers, and hyphens allowed",
  );
  expect(submit).toBeDisabled();
  fireEvent.change(name, { target: { value: "z".repeat(256) } });
  expect(form.getByRole("alert")).toHaveTextContent("255");
  fireEvent.change(name, { target: { value: "z".repeat(255) } });
  expect(submit).toBeEnabled();
  // The wire permits hyphens at either edge and even a single hyphen.
  fireEvent.change(name, { target: { value: "-" } });
  expect(submit).toBeEnabled();
  fireEvent.change(description, { target: { value: "😃".repeat(2000) } });
  expect(submit).toBeEnabled();
  fireEvent.change(description, { target: { value: "😃".repeat(2001) } });
  expect(description).toHaveAttribute("aria-invalid", "true");
  expect(form.getByRole("alert")).toHaveTextContent("2000");
  expect(submit).toBeDisabled();
});

it.each(["Close", "Escape", "outside"] as const)(
  "guards a dirty draft on %s and restores focus after discard",
  async (action) => {
    const write = vi.spyOn(native, "nativeWrite");
    const { dialog, opener, user } = await openDialog();
    const form = within(dialog);
    const name = form.getByRole("textbox", { name: "Name" });
    const description = form.getByRole("textbox", { name: /Description/ });
    const role = form.getByRole("combobox");
    if (action === "Close") {
      await user.type(name, "release-jobs");
      await user.click(form.getByRole("button", { name: "Close" }));
    } else if (action === "Escape") {
      await user.type(description, "Release jobs");
      await user.keyboard("{Escape}");
    } else {
      await user.click(role);
      await user.click(await screen.findByRole("option", { name: "Admin" }));
      await user.click(backdrop());
    }
    const prompt = within(
      await screen.findByRole("alertdialog", {
        name: "Discard unsaved changes?",
      }),
    );
    await waitFor(() =>
      expect(
        prompt.getByRole("button", { name: "Keep editing" }),
      ).toHaveFocus(),
    );
    if (action === "Escape") await user.keyboard("{Escape}");
    else await user.click(prompt.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    if (action === "Close") expect(name).toHaveValue("release-jobs");
    if (action === "Escape") expect(description).toHaveValue("Release jobs");
    if (action === "outside") expect(role).toHaveTextContent("Admin");
    await user.keyboard("{Escape}");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Discard",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(write).not.toHaveBeenCalled();
  },
);

it("closes a reverted draft directly and opens the next form with defaults", async () => {
  const { user, opener, dialog } = await openDialog();
  const name = within(dialog).getByRole("textbox", { name: "Name" });
  await user.type(name, "temp");
  await user.clear(name);
  await user.click(backdrop());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await user.click(opener);
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("");
  expect(screen.getByRole("combobox")).toHaveTextContent("Developer");
  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(opener).toHaveFocus());
});

it("submits a name-only draft once when two submit events precede the pending render", async () => {
  const write = vi.spyOn(native, "nativeWrite").mockResolvedValue(service);
  const { dialog, user, saved } = await openDialog();
  await user.type(
    within(dialog).getByRole("textbox", { name: "Name" }),
    service.name,
  );
  const form = within(dialog)
    .getByRole("button", { name: "Create service account" })
    .closest("form")!;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => expect(saved).toHaveBeenCalledExactlyOnceWith(service));
  expect(write).toHaveBeenCalledExactlyOnceWith(
    `${native.ORGANIZATION}/service_accounts`,
    { name: service.name, description: "", organization_role: "developer" },
    "POST",
    false,
    undefined,
  );
});

it("refreshes a directory whose first read was already in flight when the account was created", async () => {
  vi.spyOn(native, "nativeWrite").mockResolvedValue(service);
  const { client, dialog, saved, user } = await openDialog();
  const directory = ["service-accounts", "directory", false];
  let finishOldRead!: (rows: native.ServiceAccount[]) => void;
  const oldRead = new Promise<native.ServiceAccount[]>((resolve) => {
    finishOldRead = resolve;
  });
  const read = vi
    .fn()
    .mockReturnValueOnce(oldRead)
    .mockResolvedValue([service]);
  const unsubscribe = new QueryObserver(client, {
    queryKey: directory,
    queryFn: read,
  }).subscribe(() => {});
  try {
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      service.name,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create service account" }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalledExactlyOnceWith(service));
    await act(async () => finishOldRead([]));
    await waitFor(() =>
      expect(client.getQueryData(directory)).toEqual([service]),
    );
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});

it("retains refused values, retries once, and publishes the returned account to the detail and directories", async () => {
  const returned = {
    ...service,
    description: "Deploy releases",
    organization_role: "admin" as const,
  };
  let resolve!: (account: native.ServiceAccount) => void;
  const pending = new Promise<native.ServiceAccount>((accept) => {
    resolve = accept;
  });
  const write = vi
    .spyOn(native, "nativeWrite")
    .mockRejectedValueOnce(new Error("Name already exists"))
    .mockReturnValueOnce(pending);
  const { dialog, user, client, saved, opener } = await openDialog();
  const dirs = [
    ["service-accounts", "directory"],
    ["key-owner-service-accounts"],
    ["deployment-initiator-service-accounts"],
  ];
  dirs.forEach((queryKey) => client.setQueryData(queryKey, []));
  client.setQueryData(["api-keys"], []);
  const form = within(dialog);
  const name = form.getByRole("textbox", { name: "Name" });
  const description = form.getByRole("textbox", { name: /Description/ });
  const submit = form.getByRole("button", { name: "Create service account" });
  await user.type(name, "stale-name");
  await user.type(description, "Deploy releases");
  await user.click(form.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: "Admin" }));
  await user.click(submit);
  expect(await form.findByRole("alert")).toHaveTextContent(
    "Name already exists",
  );
  expect(description).toHaveValue("Deploy releases");
  expect(form.getByRole("combobox")).toHaveTextContent("Admin");
  await user.clear(name);
  await user.type(name, "release-jobs");
  await user.click(submit);
  await waitFor(() => expect(submit).toBeDisabled());
  await user.keyboard("{Escape}");
  await user.click(form.getByRole("button", { name: "Close" }));
  await user.click(backdrop());
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(dialog).toBeVisible();
  fireEvent.submit(submit.closest("form")!);
  expect(write).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenLastCalledWith(
    `${native.ORGANIZATION}/service_accounts`,
    {
      name: "release-jobs",
      description: "Deploy releases",
      organization_role: "admin",
    },
    "POST",
    false,
    undefined,
  );
  await act(async () => resolve(returned));
  await waitFor(() => expect(saved).toHaveBeenCalledExactlyOnceWith(returned));
  expect(
    client.getQueryData(["service-accounts", "detail", returned.id]),
  ).toEqual(returned);
  for (const queryKey of dirs)
    expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["api-keys"])?.isInvalidated).toBe(false);
  await waitFor(() => expect(opener).toHaveFocus());
});

it("allows safe cancellation and keeps a refused archive open for retry before refreshing owned keys", async () => {
  const archived = {
    ...service,
    archived_at: "2026-10-02T19:00:00Z",
    archived_by_actor_id: "user_admin",
  };
  let resolve!: (account: native.ServiceAccount) => void;
  const pending = new Promise<native.ServiceAccount>((accept) => {
    resolve = accept;
  });
  const write = vi
    .spyOn(native, "nativeWrite")
    .mockRejectedValueOnce(new Error("Archive refused"))
    .mockReturnValueOnce(pending);
  const { user, saved, client, opener, dialog } = await openDialog("archive");
  const cancel = within(dialog).getByRole("button", { name: "Cancel" });
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "Archive" }),
    ).toHaveFocus(),
  );
  expect(within(dialog).getAllByRole("button")).toHaveLength(2);
  expect(within(dialog).queryByRole("textbox")).toBeNull();
  expect(dialog).toHaveTextContent(service.name);
  expect(dialog).toHaveTextContent("move to Archived");
  await user.click(cancel);
  await waitFor(() => expect(opener).toHaveFocus());
  expect(write).not.toHaveBeenCalled();
  await user.click(opener);
  client.setQueryData(["api-keys", "all"], []);
  const confirm = within(
    await screen.findByRole("alertdialog", { name: "Archive service account" }),
  ).getByRole("button", { name: "Archive" });
  await user.click(confirm);
  expect(await screen.findByRole("alert")).toHaveTextContent("Archive refused");
  await user.click(confirm);
  await waitFor(() => expect(confirm).toBeDisabled());
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeVisible();
  expect(write).toHaveBeenLastCalledWith(
    `${native.ORGANIZATION}/service_accounts/${service.id}/archive`,
    undefined,
    "POST",
    false,
    undefined,
  );
  await act(async () => resolve(archived));
  await waitFor(() => expect(saved).toHaveBeenCalledExactlyOnceWith(archived));
  expect(
    client.getQueryData(["service-accounts", "detail", archived.id]),
  ).toEqual(archived);
  expect(client.getQueryState(["api-keys", "all"])?.isInvalidated).toBe(true);
  await waitFor(() => expect(opener).toHaveFocus());
});
