/** Keep Next's history state intact while giving entries a traversal index. */
export function installHistoryGuard(
  isDirty: () => boolean,
  confirm: (leave: () => void) => void,
) {
  const key = "__consoleHistoryIndex";
  const push = history.pushState;
  const replace = history.replaceState;
  let index: number = history.state?.[key] ?? 0;
  let restoring = false;
  let accepted = false;
  let afterRestore: (() => void) | undefined;
  replace.call(history, { ...history.state, [key]: index }, "");
  const pushState: History["pushState"] = function (state, unused, url) {
    const next = index + 1;
    push.call(history, { ...state, [key]: next }, unused, url);
    index = next;
  };
  const replaceState: History["replaceState"] = function (state, unused, url) {
    replace.call(history, { ...state, [key]: index }, unused, url);
  };
  history.pushState = pushState;
  history.replaceState = replaceState;
  const onPop = (event: PopStateEvent) => {
    const next = event.state?.[key];
    if (typeof next !== "number") return;
    if (restoring) {
      restoring = false;
      event.stopImmediatePropagation();
      afterRestore?.();
      afterRestore = undefined;
      return;
    }
    const delta = next - index;
    if (accepted || !isDirty() || delta === 0) {
      accepted = false;
      index = next;
      return;
    }
    event.stopImmediatePropagation();
    // Return to the current URL before showing the prompt. Stay requires no
    // further traversal; Leave replays precisely the requested back/forward.
    restoring = true;
    afterRestore = () => {
      confirm(() => {
        accepted = true;
        history.go(delta);
      });
    };
    history.go(-delta);
  };
  window.addEventListener("popstate", onPop);
  return () => {
    window.removeEventListener("popstate", onPop);
    if (history.pushState === pushState) history.pushState = push;
    if (history.replaceState === replaceState) history.replaceState = replace;
  };
}
