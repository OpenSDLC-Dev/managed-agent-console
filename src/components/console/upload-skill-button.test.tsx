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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadSkillButton } from "./upload-skill-button";

const pushSpy = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/skills",
  useSearchParams: () => new URLSearchParams(),
}));

function renderButton() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <UploadSkillButton />
    </QueryClientProvider>,
  );
}

const skillMd = () =>
  new File(["# skill"], "SKILL.md", { type: "text/markdown" });
const script = () => new File(["echo hi"], "run.sh", { type: "text/x-sh" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pushSpy.mockReset();
});

describe("UploadSkillButton", () => {
  it("posts multipart files[] plus display_title and navigates to the skill", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "skill_1", type: "skill" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Upload skill/ }));
    const dialog = await screen.findByRole("dialog");

    const submit = within(dialog).getByRole("button", { name: "Upload skill" });
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByLabelText("Display title (optional)"),
      "Deploy",
    );
    await user.upload(screen.getByLabelText("Skill files"), [
      skillMd(),
      script(),
    ]);
    expect(screen.getByText("2 files selected")).toBeDefined();
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/platform/v1/skills");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.getAll("files[]").map((f) => (f as File).name)).toEqual([
      "SKILL.md",
      "run.sh",
    ]);
    expect(form.get("display_title")).toBe("Deploy");
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/skills/skill_1"),
    );
  });

  it("omits display_title when blank and pluralizes the file count", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "skill_2", type: "skill" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Upload skill/ }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(screen.getByLabelText("Skill files"), skillMd());
    expect(screen.getByText("1 file selected")).toBeDefined();
    await user.click(
      within(dialog).getByRole("button", { name: "Upload skill" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect((init.body as FormData).get("display_title")).toBeNull();
  });

  it("shows Uploading… while the request is in flight", async () => {
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (resolveFetch = r))),
    );
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Upload skill/ }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(screen.getByLabelText("Skill files"), skillMd());
    await user.click(
      within(dialog).getByRole("button", { name: "Upload skill" }),
    );

    const pendingButton = await within(dialog).findByRole("button", {
      name: "Uploading…",
    });
    expect(pendingButton).toBeDisabled();

    resolveFetch(
      new Response(JSON.stringify({ id: "skill_3", type: "skill" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await waitFor(() =>
      expect(pushSpy).toHaveBeenCalledWith("/skills/skill_3"),
    );
  });

  it("surfaces the platform error and stays open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "invalid_request_error",
                message: "zip exceeds 32 MiB",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Upload skill/ }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(screen.getByLabelText("Skill files"), skillMd());
    await user.click(
      within(dialog).getByRole("button", { name: "Upload skill" }),
    );

    expect(await screen.findByText("zip exceeds 32 MiB")).toBeDefined();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("dismissing the dialog clears title and file selection", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Upload skill/ }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Display title (optional)"), "x");
    await user.upload(screen.getByLabelText("Skill files"), skillMd());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: /Upload skill/ }));
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("Display title (optional)")).toHaveValue("");
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("cancel closes the dialog without uploading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /Upload skill/ }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
