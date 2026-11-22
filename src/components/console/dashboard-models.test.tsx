import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { copyText } from "@/lib/copy-text";
import { DashboardModels } from "./dashboard-models";

vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("gives each branded card a local guide fallback and a model dialog", () => {
  render(<DashboardModels />);
  for (const [name, brand] of [
    ["DeepSeek V4.1 Flash", "deepseek"],
    ["GLM-5.3", "glm"],
    ["Kimi K3", "kimi"],
    ["MiniMax M3", "minimax"],
  ]) {
    const card = screen.getByRole("article", { name });
    const link = within(card).getByRole("link", { name });
    expect(link).toHaveAttribute("href", `/dashboard/models/${brand}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("aria-haspopup", "dialog");
    expect(within(card).getByText("1M context")).toBeVisible();
    expect(card.querySelector("p")).toHaveTextContent(/coding/i);
    expect(within(card).getByRole("heading", { name })).toContainElement(link);
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      `/brands/${brand}.svg`,
    );
    expect(within(card).getAllByRole("listitem")).toHaveLength(3);
    expect(within(link).queryByRole("list")).toBeNull();
  }
});

it("opens the selected card with Enter and restores it on Escape", async () => {
  const user = userEvent.setup();
  render(<DashboardModels />);
  const trigger = screen.getByRole("link", { name: "Kimi K3" });
  trigger.focus();
  await user.keyboard("{Enter}");
  const detail = await screen.findByRole("dialog", { name: "Kimi K3" });
  await waitFor(() =>
    expect(within(detail).getByRole("button", { name: "Close" })).toHaveFocus(),
  );
  expect(
    within(detail).getByRole("button", { name: "Copy model ID kimi-k3" }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("opens the provider cost comparison and restores focus on close", async () => {
  const user = userEvent.setup();
  render(<DashboardModels />);
  const trigger = screen.getByRole("button", { name: "Compare models" });
  await user.click(trigger);
  const dialog = within(
    await screen.findByRole("dialog", { name: "Compare models" }),
  );
  await waitFor(() =>
    expect(dialog.getByRole("button", { name: "Close" })).toHaveFocus(),
  );
  expect(dialog.getByRole("radio", { name: "Cost" })).toBeChecked();
  expect(dialog.getByRole("combobox", { name: "Model 1" })).toHaveTextContent(
    "DeepSeek V4.1 Flash",
  );
  expect(dialog.getByRole("combobox", { name: "Model 2" })).toHaveTextContent(
    "GLM-5.3",
  );
  expect(dialog.getByRole("combobox", { name: "Model 3" })).toHaveTextContent(
    "Kimi K3",
  );
  const kimi = within(
    dialog.getByRole("region", { name: "Comparison column 3" }),
  );
  expect(kimi.getByText("$15.00")).toBeVisible();
  expect(kimi.getByText(/Cache writes cost \$3 for 5 min/)).toBeVisible();
  expect(
    dialog.getByRole("link", { name: "View pricing for GLM-5.3" }),
  ).toHaveAttribute("href", "/dashboard/models/glm#pricing");
  expect(
    dialog.getByText(
      "Z.ai international API rates, in USD per million tokens.",
    ),
  ).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("keeps column selections across views and copies the exact upstream ID without requesting a model", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.mocked(copyText).mockResolvedValue(true);
  render(<DashboardModels />);
  await user.click(screen.getByRole("button", { name: "Compare models" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "Compare models" }),
  );
  await user.click(dialog.getByRole("combobox", { name: "Model 3" }));
  await user.click(await screen.findByRole("option", { name: "MiniMax M3" }));
  expect(
    dialog.getByRole("link", { name: "View pricing for MiniMax M3" }),
  ).toHaveAttribute("href", "/dashboard/models/minimax#pricing");
  const third = within(
    dialog.getByRole("region", { name: "Comparison column 3" }),
  );
  expect(third.getByText("$1.20")).toBeVisible();
  expect(
    third.getByText(/Standard tier, up to 512K input tokens/),
  ).toBeVisible();
  await user.click(dialog.getByRole("radio", { name: "Features" }));
  expect(
    third.getByRole("link", { name: "Model documentation for MiniMax M3" }),
  ).toHaveAttribute("href", "/dashboard/models/minimax");
  expect(third.getByText("Upstream model ID")).toBeVisible();
  expect(third.getByText("MiniMax-M3")).toBeVisible();
  expect(third.getByText("512K tokens")).toBeVisible();
  await user.click(third.getByRole("button", { name: "Copy MiniMax-M3" }));
  expect(copyText).toHaveBeenCalledWith("MiniMax-M3");
  await user.click(dialog.getByRole("radio", { name: "Cost" }));
  expect(dialog.getByRole("combobox", { name: "Model 3" })).toHaveTextContent(
    "MiniMax M3",
  );
  expect(dialog.getByRole("combobox", { name: "Model 1" })).toHaveTextContent(
    "DeepSeek V4.1 Flash",
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetch).not.toHaveBeenCalled();
});

it("allows the same model in two columns and dismisses an open selector before the comparison", async () => {
  const user = userEvent.setup();
  render(<DashboardModels />);
  await user.click(screen.getByRole("button", { name: "Compare models" }));
  const dialog = within(
    await screen.findByRole("dialog", { name: "Compare models" }),
  );
  const third = dialog.getByRole("combobox", { name: "Model 3" });
  await user.click(third);
  await user.click(await screen.findByRole("option", { name: "GLM-5.3" }));
  expect(third).toHaveTextContent("GLM-5.3");
  expect(dialog.getByRole("combobox", { name: "Model 2" })).toHaveTextContent(
    "GLM-5.3",
  );
  await user.click(third);
  await screen.findByRole("listbox");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(screen.getByRole("dialog", { name: "Compare models" })).toBeVisible();
  expect(third).toHaveFocus();
});
