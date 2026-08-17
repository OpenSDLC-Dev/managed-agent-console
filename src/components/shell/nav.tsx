"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, type GroupEntry, type NavEntry } from "@/lib/nav";
import { SURFACES, surfaceRoute, useSurfaces } from "@/lib/platform/surfaces";
import type { Surface } from "@/lib/platform/surfaces";

/** Shared by every row so the group header sits flush with its neighbours. */
const ROW = "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm";

/**
 * Whether a surface should be drawn. Unknown means shown: an item disappears
 * only once the platform has said it does not serve that surface (CLAUDE.md
 * principle 3).
 */
type Available = (surface: Surface) => boolean;

function NavLink({
  href,
  label,
  icon: Icon,
  surface,
  nested,
}: {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  surface?: Surface;
  nested?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      data-surface={surface}
      aria-current={active ? "page" : undefined}
      className={cn(
        ROW,
        // A nested row draws no icon, so it pads left by what an icon would
        // have cost — 10px of row padding + 16px icon + 10px gap = 36px — and
        // its label lands in the same column as an iconned row's. The
        // reference's rule, measured 2026-08-17.
        nested && "pl-9",
        "text-sidebar-foreground",
        active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/60",
      )}
    >
      {Icon ? (
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
      ) : null}
      {label}
    </Link>
  );
}

function Group({
  group,
  available,
}: {
  group: GroupEntry;
  available: Available;
}) {
  const [open, setOpen] = useState(true);
  const items = group.items.filter((item) => available(item.surface));
  // A group is its items. With none of them served there is nothing to title,
  // and a header alone would advertise a section this deployment does not have.
  if (items.length === 0) return null;
  const id = `nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
  const { icon: Icon } = group;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        data-nav-group={group.label}
        // Whether the group is open is derived state, so it is readable as an
        // attribute and not only as a rotated chevron — the same contract
        // `ConnectionStatus` carries and e2e already reads there. `aria-expanded`
        // says it too, but for the assistive tree rather than for a test.
        data-state={open ? "open" : "closed"}
        className={cn(ROW, "text-muted-foreground hover:bg-sidebar-accent/60")}
      >
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
        {group.label}
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 transition-transform",
            !open && "-rotate-90",
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      {/* Unmounted rather than hidden when closed: a collapsed group's links
          should not be tabbable, and `hidden` on the container is one more
          state to keep in step with aria-expanded. */}
      {open ? (
        <div id={id} className="flex flex-col gap-0.5">
          {items.map((item) => (
            <NavLink
              key={item.surface}
              nested
              href={surfaceRoute(item.surface)}
              label={SURFACES[item.surface].label}
              surface={item.surface}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Entry({
  entry,
  available,
}: {
  entry: NavEntry;
  available: Available;
}) {
  if (entry.kind === "local")
    return <NavLink href={entry.href} label={entry.label} icon={entry.icon} />;
  if (entry.kind === "surface")
    return available(entry.surface) ? (
      <NavLink
        href={surfaceRoute(entry.surface)}
        label={SURFACES[entry.surface].label}
        icon={entry.icon}
        surface={entry.surface}
      />
    ) : null;
  return <Group group={entry} available={available} />;
}

export function Nav() {
  const surfaces = useSurfaces();
  const available: Available = (surface) => surfaces?.[surface] !== false;
  return (
    <nav className="flex flex-col gap-0.5 px-2 pt-4">
      {NAV.map((entry) => (
        <Entry
          key={
            entry.kind === "group"
              ? entry.label
              : entry.kind === "local"
                ? entry.href
                : entry.surface
          }
          entry={entry}
          available={available}
        />
      ))}
    </nav>
  );
}
