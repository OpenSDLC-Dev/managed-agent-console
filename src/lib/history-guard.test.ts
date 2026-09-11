import { afterEach, expect, it, vi } from "vitest";
import { installHistoryGuard } from "./history-guard";
let remove: (() => void) | undefined;
afterEach(() => {
  remove?.();
  remove = undefined;
  vi.restoreAllMocks();
});

it("keeps router fields and URL replacements on the same traversal index", () => {
  history.replaceState({ __NA: true, tree: "initial" }, "", "/agents");
  remove = installHistoryGuard(() => false, vi.fn());
  const start = history.state.__consoleHistoryIndex;
  history.pushState({ __NA: true, tree: "detail" }, "", "/agents/a");
  expect(history.state).toEqual({
    __NA: true,
    tree: "detail",
    __consoleHistoryIndex: start + 1,
  });
  history.replaceState({ __NA: true, tree: "query" }, "", "/agents/a?view=raw");
  expect(history.state).toEqual({
    __NA: true,
    tree: "query",
    __consoleHistoryIndex: start + 1,
  });
});

it.each([-1, 1])(
  "restores the current entry then replays traversal %i only after Leave",
  (delta) => {
    const confirm = vi.fn();
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    remove = installHistoryGuard(() => true, confirm);
    const index = history.state.__consoleHistoryIndex;
    const downstream = vi.fn();
    window.addEventListener("popstate", downstream);
    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { __consoleHistoryIndex: index + delta },
      }),
    );
    expect(go).toHaveBeenCalledWith(-delta);
    expect(confirm).not.toHaveBeenCalled();
    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { __consoleHistoryIndex: index },
      }),
    );
    expect(downstream).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mock.calls[0][0]();
    expect(go).toHaveBeenLastCalledWith(delta);
    window.dispatchEvent(
      new PopStateEvent("popstate", {
        state: { __consoleHistoryIndex: index + delta },
      }),
    );
    expect(downstream).toHaveBeenCalledOnce();
    window.removeEventListener("popstate", downstream);
  },
);

it("allows clean and untracked entries and leaves a later history wrapper installed", () => {
  const confirm = vi.fn();
  remove = installHistoryGuard(() => false, confirm);
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  window.dispatchEvent(
    new PopStateEvent("popstate", { state: { __consoleHistoryIndex: 2 } }),
  );
  expect(confirm).not.toHaveBeenCalled();
  const ours = history.pushState;
  const later: History["pushState"] = function (...args) {
    ours.apply(history, args);
  };
  history.pushState = later;
  remove();
  remove = undefined;
  expect(history.pushState).toBe(later);
  history.pushState = History.prototype.pushState;
});
