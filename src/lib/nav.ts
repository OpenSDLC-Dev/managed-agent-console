import {
  Bot,
  Boxes,
  FileText,
  Hammer,
  House,
  KeyRound,
  // Not `Lock`: that name collides with the DOM's own global `Lock`, and the
  // import loses — a type error whose message names neither the icon nor lucide.
  KeySquare,
  MessagesSquare,
  Sparkles,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { SURFACES, surfaceRoute, type Surface } from "./platform/surfaces";

/**
 * The console's navigation, in one place.
 *
 * It lives here rather than in `nav.tsx` because two surfaces render it — the
 * sidebar and the command palette's "Go to" section — and each used to carry
 * its own copy of the order and the icons. Two copies of an order is an order
 * that will disagree with itself.
 *
 * Shape and order are the reference console's, measured in Chrome on
 * 2026-08-17: `Dashboard`, `API keys`, then the `Build` group, then
 * `Managed Agents`, with the reference's own order inside each group.
 *
 * An icon here is **data, not a decision to draw one**. The reference puts an
 * icon on top-level rows and on group headers and none on the rows inside a
 * group, so the sidebar skips a nested entry's icon — but the palette lists
 * that entry as a search result and the dashboard gives it a card, and both
 * want it. One icon per destination, wherever it is drawn.
 */

/** A console-local page. No platform route behind it, so never probed. */
export interface LocalEntry {
  kind: "local";
  label: string;
  href: string;
  icon: LucideIcon;
}

/** A platform surface. Hidden once the probe says this deployment lacks it. */
export interface SurfaceEntry {
  kind: "surface";
  surface: Surface;
  icon: LucideIcon;
}

/** A titled group. Its header carries the icon; its children do not. */
export interface GroupEntry {
  kind: "group";
  label: string;
  icon: LucideIcon;
  items: SurfaceEntry[];
}

export type NavEntry = LocalEntry | SurfaceEntry | GroupEntry;

const surfaceEntry = (surface: Surface, icon: LucideIcon): SurfaceEntry => ({
  kind: "surface",
  surface,
  icon,
});

export const NAV: NavEntry[] = [
  { kind: "local", label: "Dashboard", href: "/dashboard", icon: House },
  // Top-level, as it is today and as the reference has it — but second now
  // rather than last, which is the position the reference gives it. Still not
  // filed under a Settings area: a self-hosted console's whole settings story
  // is its environment file, so that section would hold exactly one item
  // (plan 07 D2).
  //
  // `KeySquare` and not the round-bowed key the reference draws, because
  // `KeyRound` is already Credential vaults' and one icon may mean one thing.
  surfaceEntry("api-keys", KeySquare),
  {
    kind: "group",
    label: "Build",
    icon: Hammer,
    items: [surfaceEntry("files", FileText), surfaceEntry("skills", Sparkles)],
  },
  {
    kind: "group",
    label: "Managed Agents",
    icon: Waypoints,
    items: [
      surfaceEntry("agents", Bot),
      surfaceEntry("sessions", MessagesSquare),
      surfaceEntry("environments", Boxes),
      surfaceEntry("vaults", KeyRound),
    ],
  },
];

/** Where a nav entry points. Groups are containers and have no destination. */
export interface Destination {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Absent for a console-local page, which no probe can take away. */
  surface?: Surface;
}

/**
 * Every destination the nav reaches, flattened in nav order — what the command
 * palette lists and what the dashboard builds its cards from. A group
 * contributes its children and not itself.
 */
export const NAV_DESTINATIONS: Destination[] = NAV.flatMap((entry) => {
  if (entry.kind === "local")
    return [
      {
        key: `nav-${entry.href}`,
        label: entry.label,
        href: entry.href,
        icon: entry.icon,
      },
    ];
  const items = entry.kind === "group" ? entry.items : [entry];
  return items.map((item) => ({
    key: `nav-${item.surface}`,
    label: SURFACES[item.surface].label,
    href: surfaceRoute(item.surface),
    icon: item.icon,
    surface: item.surface,
  }));
});

/**
 * The groups as the dashboard lists them: the nav's own order, with the
 * top-level entries gathered under a heading of their own so the landing page
 * and the sidebar cannot drift apart. `Dashboard` is dropped — a landing page
 * does not link to itself.
 */
export const DASHBOARD_SECTIONS: { heading: string; items: SurfaceEntry[] }[] =
  NAV.flatMap((entry) => {
    if (entry.kind === "group")
      return [{ heading: entry.label, items: entry.items }];
    if (entry.kind === "surface")
      // A heading the sidebar does not draw, because the sidebar has the
      // sidebar's own affordance for "top level" — position. A grid of cards
      // has none, so these would otherwise be a headless row above the rest.
      return [{ heading: "Manage", items: [entry] }];
    return [];
  });
