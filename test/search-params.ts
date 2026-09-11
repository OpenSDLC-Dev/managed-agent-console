import { useSyncExternalStore } from "react";
import { beforeEach, afterEach, vi } from "vitest";
const event = "test-next-search-params";
const nativePush = window.history.pushState.bind(window.history);
let restore: (() => void) | undefined;
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  const spy = vi
    .spyOn(window.history, "pushState")
    .mockImplementation((...args) => {
      nativePush(...args);
      window.dispatchEvent(new Event(event));
    });
  restore = () => spy.mockRestore();
});
afterEach(() => {
  restore?.();
  window.history.replaceState(null, "", "/");
});
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener("popstate", listener);
  };
}
/** Emulate Next's documented native-history integration in isolated page tests. */
export function useTestSearchParams() {
  return new URLSearchParams(
    useSyncExternalStore(
      subscribe,
      () => window.location.search,
      () => "",
    ),
  );
}
