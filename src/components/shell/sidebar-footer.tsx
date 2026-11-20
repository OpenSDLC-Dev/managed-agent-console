"use client";

import { useContext, type KeyboardEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronDown, UserRound } from "lucide-react";
import { playgroundOnly } from "@/lib/routes";
import {
  ConnectionIndicator,
  ConnectionStatus,
  useConnectionStatus,
} from "./connection-status";
import { ConsoleSessionContext } from "./console-session";
import { accountLabel, SignedInAs } from "./signed-in-as";
import { ThemeToggle } from "./theme-toggle";

function moveAccountFocus(event: KeyboardEvent<HTMLElement>) {
  const down = event.key === "ArrowDown";
  if (!down && event.key !== "ArrowUp") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href]",
    ),
  );
  const index = controls.findIndex(
    (control) => control === document.activeElement,
  );
  const next =
    index === -1
      ? down
        ? 0
        : controls.length - 1
      : (index + (down ? 1 : -1) + controls.length) % controls.length;
  event.preventDefault();
  controls[next]?.focus();
}

export function SidebarFooter({ version }: { version: React.ReactNode }) {
  const data = useContext(ConsoleSessionContext)?.data;
  const limited = playgroundOnly(data);
  // Probe only when the session can use the resource console.
  const connection = useConnectionStatus(!limited);
  if (!data?.signed_in) return null;
  const label = accountLabel(data);

  return (
    <div className="p-2 group-data-[sidebar-state=collapsed]/sidebar:px-1.5">
      <Popover.Root>
        <Popover.Trigger
          aria-label={`${label} ${data.role}, account menu`}
          aria-description={limited ? undefined : connection.label}
          title="Account menu"
          className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-sidebar-foreground hover:bg-sidebar-accent data-popup-open:bg-sidebar-accent group-data-[sidebar-state=collapsed]/sidebar:h-9 group-data-[sidebar-state=collapsed]/sidebar:justify-center group-data-[sidebar-state=collapsed]/sidebar:px-0"
        >
          <span className="relative grid size-8 shrink-0 place-items-center rounded-md border border-sidebar-border bg-sidebar-accent text-muted-foreground">
            <UserRound aria-hidden className="size-4" />
            {!limited && <ConnectionIndicator {...connection} />}
          </span>
          <span className="min-w-0 flex-1 group-data-[sidebar-state=collapsed]/sidebar:hidden">
            <span className="block truncate text-sm font-medium">{label}</span>{" "}
            <span
              className="block truncate text-xs text-muted-foreground"
              data-role={data.role}
            >
              {data.role}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 text-muted-foreground group-data-[sidebar-state=collapsed]/sidebar:hidden"
          />
        </Popover.Trigger>
        <Popover.Portal keepMounted>
          <Popover.Positioner
            side="top"
            align="start"
            sideOffset={6}
            className="z-50"
          >
            <Popover.Popup
              onKeyDown={moveAccountFocus}
              className="max-h-(--available-height) w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
            >
              <Popover.Title className="sr-only">
                Account settings
              </Popover.Title>
              <SignedInAs>
                <div className="mx-2 space-y-2 border-y px-1 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">Theme</span>
                    <ThemeToggle />
                  </div>
                  {!limited && <ConnectionStatus {...connection} />}
                  {version}
                </div>
              </SignedInAs>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
