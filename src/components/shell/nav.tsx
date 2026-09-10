"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { useNavPreference } from "./nav-preference";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, type GroupEntry, type NavEntry } from "@/lib/nav";
import { SURFACES, surfaceRoute, useSurfaces } from "@/lib/platform/surfaces";
import type { Surface } from "@/lib/platform/surfaces";

/** Shared by every row so the group header sits flush with its neighbours. */
const ROW = "flex h-9 items-center gap-4 rounded-lg px-2 text-sm";

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
  popup,
  onNavigate,
}: {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  surface?: Surface;
  nested?: boolean;
  popup?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-surface={surface}
      aria-current={active ? "page" : undefined}
      className={cn(
        ROW,
        // Align nested labels with 8px padding + 16px icon + 16px gap.
        nested && "pl-10",
        popup && "h-8 px-2.5 py-1.5",
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
  const id = `nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
  const [preference, setOpen] = useNavPreference(id);
  const open = preference ?? true;
  const items = group.items.filter((item) => available(item.surface));
  // A group is its items. With none of them served there is nothing to title,
  // and a header alone would advertise a section this deployment does not have.
  if (items.length === 0) return null;
  const { icon: Icon } = group;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
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

function CompactGroup({
  group,
  available,
}: {
  group: GroupEntry;
  available: Available;
}) {
  const [open, setOpen] = useState(false);
  const { icon: Icon } = group;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={group.label}
        title={group.label}
        className="flex size-9 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/60"
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="right"
          align="start"
          sideOffset={12}
          className="z-50"
        >
          <Popover.Popup className="w-48 max-w-[calc(100vw-64px)] rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
            <Popover.Title className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              {group.label}
            </Popover.Title>
            {group.items
              .filter((item) => available(item.surface))
              .map((item) => (
                <NavLink
                  key={item.surface}
                  popup
                  href={surfaceRoute(item.surface)}
                  label={SURFACES[item.surface].label}
                  surface={item.surface}
                  onNavigate={() => setOpen(false)}
                />
              ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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

export function Nav({ compact = false }: { compact?: boolean }) {
  const surfaces = useSurfaces();
  const pathname = usePathname();
  const available: Available = (surface) => surfaces?.[surface] !== false;
  if (compact) {
    return (
      <nav
        aria-label="Main navigation"
        className="flex flex-col gap-1 px-1.5 pt-4"
      >
        {NAV.map((entry) => {
          if (entry.kind === "surface" && !available(entry.surface))
            return null;
          if (
            entry.kind === "group" &&
            !entry.items.some((item) => available(item.surface))
          )
            return null;
          const { icon: Icon } = entry;
          const label =
            entry.kind === "surface"
              ? SURFACES[entry.surface].label
              : entry.label;
          const className =
            "flex size-9 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/60";
          if (entry.kind === "group")
            return (
              <CompactGroup key={label} group={entry} available={available} />
            );
          const href =
            entry.kind === "local" ? entry.href : surfaceRoute(entry.surface);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={label}
              href={href}
              aria-label={label}
              title={label}
              data-active={active}
              aria-current={active ? "page" : undefined}
              className={cn(className, active && "bg-sidebar-accent")}
            >
              <Icon className="size-4" strokeWidth={1.75} />
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1 px-3 pt-4">
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
