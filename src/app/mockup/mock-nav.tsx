"use client";

/**
 * THROWAWAY — mockup only. The row atoms and the grouped nav, shared by
 * /mockup and /mockup/dashboard so both screens show the same sidebar.
 *
 * Geometry is the shipped console's (32px rows, `px-2.5`, `gap-2.5`, `size-4`
 * icons); the structure is the reference's, measured 2026-08-17.
 */

import { useState } from "react";
import { ChevronDown, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SURFACES } from "@/lib/platform/surfaces";
import { NAV } from "./nav-model";

export const ROW = "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm";

export function Row({
  icon: Icon,
  label,
  active,
  muted,
  trailing,
  nested,
}: {
  icon?: LucideIcon;
  label: string;
  active?: boolean;
  muted?: boolean;
  trailing?: React.ReactNode;
  nested?: boolean;
}) {
  return (
    <div
      className={cn(
        ROW,
        // 10px row padding + 16px icon + 10px gap = 36px, so a nested label
        // lands in the same column as an iconned one. The reference's rule.
        nested && "pl-9",
        active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/60",
        muted ? "text-muted-foreground" : "text-sidebar-foreground",
      )}
    >
      {Icon ? (
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
      ) : null}
      <span className="truncate">{label}</span>
      {trailing ? (
        <span className="ml-auto flex items-center">{trailing}</span>
      ) : null}
    </div>
  );
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="px-4 pb-1 pt-5">
      <div className="text-[15px] font-semibold">
        {subtitle ? "Managed Agents" : "Agent Console"}
      </div>
      {subtitle ? (
        <div className="text-[12px] text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  );
}

export function SearchRow() {
  return (
    <div className="px-2 pt-3">
      <div className={cn(ROW, "text-muted-foreground")}>
        <Search className="size-4" strokeWidth={1.75} />
        <span>Search</span>
        <kbd className="ml-auto rounded border px-1 text-[11px]">Ctrl K</kbd>
      </div>
    </div>
  );
}

export function GroupedNav({
  collapsible,
  activeHref = "/dashboard",
}: {
  collapsible: boolean;
  activeHref?: string;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <>
      <Brand />
      <SearchRow />
      <nav className="flex flex-col gap-0.5 px-2 pt-4">
        {NAV.map((entry) => {
          if (entry.kind === "local") {
            return (
              <Row
                key={entry.href}
                icon={entry.icon}
                label={entry.label}
                active={activeHref === entry.href}
              />
            );
          }
          if (entry.kind === "surface") {
            return (
              <Row
                key={entry.surface}
                icon={entry.icon}
                label={SURFACES[entry.surface].label}
              />
            );
          }
          const open = !closed[entry.label];
          return (
            <div key={entry.label} className="flex flex-col gap-0.5">
              {collapsible ? (
                <button
                  type="button"
                  onClick={() =>
                    setClosed((c) => ({ ...c, [entry.label]: !c[entry.label] }))
                  }
                  className="text-left"
                >
                  <Row
                    icon={entry.icon}
                    label={entry.label}
                    muted
                    trailing={
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform",
                          !open && "-rotate-90",
                        )}
                        strokeWidth={1.75}
                      />
                    }
                  />
                </button>
              ) : (
                // A label, not a control: same row shape and icon, no chevron
                // and no hover.
                <div className={cn(ROW, "text-muted-foreground")}>
                  <entry.icon
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <span>{entry.label}</span>
                </div>
              )}
              {(!collapsible || open) &&
                entry.items.map((item) => (
                  <Row
                    key={item.surface}
                    nested
                    label={SURFACES[item.surface].label}
                  />
                ))}
            </div>
          );
        })}
      </nav>
    </>
  );
}
