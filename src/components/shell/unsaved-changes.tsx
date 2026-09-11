"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { installHistoryGuard } from "@/lib/history-guard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Actions = {
  requestLeave: (action: () => void) => void;
  setDirty: (dirty: boolean) => void;
};
const UnsavedContext = createContext<Actions>({
  requestLeave: (action) => action(),
  setDirty: () => {},
});

export function UnsavedChangesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dirty = useRef(false);
  const stay = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const actions = useMemo<Actions>(
    () => ({
      setDirty: (value) => {
        dirty.current = value;
      },
      requestLeave: (action) => {
        if (dirty.current) setPending(() => action);
        else action();
      },
    }),
    [],
  );
  // Install before the App Router's passive popstate listener.
  useLayoutEffect(
    () => installHistoryGuard(() => dirty.current, actions.requestLeave),
    [actions],
  );
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onLink = (event: MouseEvent) => {
      if (
        !dirty.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const target = new URL(link.href);
      if (
        target.origin !== location.origin ||
        (target.pathname === location.pathname &&
          target.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      actions.requestLeave(() =>
        router.push(target.pathname + target.search + target.hash),
      );
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onLink, true);
    };
  }, [actions, router]);
  const reject = () => {
    setPending(null);
  };
  const accept = () => {
    // Authorize this action; a draft that remains mounted still needs protection.
    // Saving, unmounting, or committing sign-out clears it explicitly.
    setPending(null);
    if (pending) pending();
  };
  return (
    <UnsavedContext.Provider value={actions}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) reject();
        }}
      >
        <DialogContent showCloseButton={false} initialFocus={stay}>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. If you leave this page, they will be
              lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button ref={stay} variant="outline" onClick={reject}>
              Stay
            </Button>
            <Button onClick={accept}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedContext.Provider>
  );
}

export function useLeaveConfirmation() {
  return useContext(UnsavedContext);
}

export function useUnsavedChanges(dirty: boolean) {
  const actions = useLeaveConfirmation();
  useEffect(() => {
    actions.setDirty(dirty);
    return () => actions.setDirty(false);
  }, [actions, dirty]);
  return actions;
}
