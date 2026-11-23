import { withTestSession } from "@/../test/session-fixture";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
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
import { UploadSkillButton } from "./upload-skill-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function setup(
  response: () => Promise<Response> = async () =>
    Response.json({ id: "skill_1" }),
) {
  const fetch =
    vi.fn<(url: string, init: RequestInit) => Promise<Response>>(response);
  vi.stubGlobal("fetch", withTestSession(fetch));
  const created = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UploadSkillButton onCreated={created} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Create skill" }));
  const dialog = within(await screen.findByRole("dialog"));
  const submit = dialog.getByRole("button", { name: "Create skill" });
  return { fetch, user, dialog, submit, created };
}
const manifest = () =>
  new File(
    ["---\nname: deploy\ndescription: Test instructions.\n---\nText"],
    "SKILL.md",
    { type: "text/markdown" },
  );

it("checks an empty form inline and stages multipart files without a display-name override", async () => {
  const { fetch, user, dialog, submit, created } = await setup();
  await user.click(submit);
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Choose files or a folder",
  );
  await user.upload(dialog.getByLabelText("Skill files"), [
    manifest(),
    new File(["Notes"], "notes.txt"),
  ]);
  expect(fetch).not.toHaveBeenCalled();
  await user.click(submit);
  await waitFor(() => expect(created).toHaveBeenCalledOnce());
  const form = fetch.mock.calls[0][1].body as FormData;
  expect(form.getAll("files[]").map((file) => (file as File).name)).toEqual([
    "deploy/SKILL.md",
    "deploy/notes.txt",
  ]);
  expect(form.get("display_name")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("preserves the directory picker's relative paths", async () => {
  const { fetch, dialog, user, submit } = await setup();
  const file = manifest();
  Object.defineProperty(file, "webkitRelativePath", {
    value: "deploy/SKILL.md",
  });
  fireEvent.change(dialog.getByLabelText("Skill folder"), {
    target: { files: [file] },
  });
  await user.click(submit);
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(
    ((fetch.mock.calls[0][1].body as FormData).get("files[]") as File).name,
  ).toBe("deploy/SKILL.md");
});

it("retains staged files on refusal, removes them, and discards the form on Escape", async () => {
  const { dialog, user, submit, created } = await setup(async () =>
    Response.json(
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Invalid skill archive",
        },
      },
      { status: 400 },
    ),
  );
  await user.upload(dialog.getByLabelText("Skill files"), manifest());
  await user.click(submit);
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "Invalid skill archive",
  );
  await user.click(dialog.getByRole("button", { name: "Remove SKILL.md" }));
  expect(dialog.queryByText("SKILL.md")).toBeNull();
  await user.upload(dialog.getByLabelText("Skill files"), manifest());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await user.click(screen.getByRole("button", { name: "Create skill" }));
  expect(screen.queryByRole("button", { name: "Remove SKILL.md" })).toBeNull();
  expect(created).not.toHaveBeenCalled();
});
