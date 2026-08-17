/**
 * THROWAWAY — mockup only (see src/app/mockup/page.tsx).
 *
 * The nav tree the regrouping proposes, shaped after the reference console's
 * own structure as measured 2026-08-17 in Chrome: top-level rows and group
 * headers carry an icon, rows nested inside a group carry none, and every
 * label lines up in one column because the nested rows pad left by exactly the
 * icon's width plus its gap.
 *
 * `Dashboard` is deliberately NOT a platform surface: it is a console-local
 * page, so it never joins the 404 feature probe in lib/platform/surfaces.ts and
 * is always shown. That is the one structural thing this model adds — the real
 * nav is a list of surfaces today, and has to become a tree of
 * (console route | probed surface) entries.
 */
import {
  Hammer,
  House,
  KeyRound,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { Surface } from "@/lib/platform/surfaces";

/** A row that points at a console-local route, always shown. */
interface LocalEntry {
  kind: "local";
  label: string;
  href: string;
  icon: LucideIcon;
}

/** A row that points at a platform surface, hidden when the probe says 404. */
interface SurfaceEntry {
  kind: "surface";
  surface: Surface;
  icon?: LucideIcon;
}

/** A titled group. Its header carries the icon; its children do not. */
interface GroupEntry {
  kind: "group";
  label: string;
  icon: LucideIcon;
  items: SurfaceEntry[];
}

export type NavEntry = LocalEntry | SurfaceEntry | GroupEntry;

/**
 * Order is the reference's, verbatim: Dashboard, API keys, then the Build group,
 * then Managed Agents. Within each group the reference's own order is kept too
 * (Files before Skills), which happens to preserve the order these surfaces
 * already had relative to each other.
 */
export const NAV: NavEntry[] = [
  { kind: "local", label: "Dashboard", href: "/dashboard", icon: House },
  // Top-level, as it is today and as the reference has it — but second now
  // rather than last, which is where the reference puts it.
  { kind: "surface", surface: "api-keys", icon: KeyRound },
  {
    kind: "group",
    label: "Build",
    icon: Hammer,
    items: [
      { kind: "surface", surface: "files" },
      { kind: "surface", surface: "skills" },
    ],
  },
  {
    kind: "group",
    label: "Managed Agents",
    icon: Waypoints,
    items: [
      { kind: "surface", surface: "agents" },
      { kind: "surface", surface: "sessions" },
      { kind: "surface", surface: "environments" },
      { kind: "surface", surface: "vaults" },
    ],
  },
];
