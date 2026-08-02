import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";

const { replaceSpy } = vi.hoisted(() => ({ replaceSpy: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: replaceSpy }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  replaceSpy.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function submitPassword(password: string) {
  const user = userEvent.setup();
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("LoginPage", () => {
  it("renders a post form and marks it hydrated on the client", () => {
    const { container } = render(<LoginPage />);
    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("data-hydrated")).toBe("true");
  });

  it("omits the hydration marker from server-rendered HTML", () => {
    const html = renderToString(<LoginPage />);
    expect(html).toContain("<form");
    expect(html).not.toContain("data-hydrated");
  });

  it("posts the password and navigates to /agents on success", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true, gate: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);
    await submitPassword("hunter2");
    expect(fetchMock).toHaveBeenCalledWith("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/agents"));
    expect(screen.queryByText("Wrong password.")).toBeNull();
  });

  it("shows an error for a wrong password and stays put", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "error",
              error: {
                type: "authentication_error",
                message: "wrong password",
              },
            }),
            { status: 401, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    render(<LoginPage />);
    await submitPassword("nope");
    expect(await screen.findByText("Wrong password.")).toBeDefined();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("shows the error when the login request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    render(<LoginPage />);
    await submitPassword("hunter2");
    expect(await screen.findByText("Wrong password.")).toBeDefined();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("disables the submit button while the request is in flight", async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    render(<LoginPage />);
    await submitPassword("hunter2");
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toHaveProperty("disabled", true);
    release(new Response(JSON.stringify({ ok: true, gate: true })));
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith("/agents"));
    expect(button).toHaveProperty("disabled", false);
  });
});
