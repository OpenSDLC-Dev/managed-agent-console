import {
  Bot,
  Boxes,
  ChartColumn,
  Cpu,
  Database,
  FileText,
  House,
  KeyRound,
  KeySquare,
  MessagesSquare,
  Moon,
  Network,
  Plug,
  Rocket,
  Settings,
  Sparkles,
  Waypoints,
  Users,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import { SURFACES, surfaceRoute, type Surface } from "./platform/surfaces";
import { LANDING_ROUTE } from "./routes";

export interface SurfaceEntry {
  kind: "surface";
  surface: Surface;
  icon: LucideIcon;
}

export interface GroupEntry {
  kind: "group";
  label: string;
  icon: LucideIcon;
  items: SurfaceEntry[];
  defaultOpen?: boolean;
}

type NavEntry = SurfaceEntry | GroupEntry;

const surfaceEntry = (surface: Surface, icon: LucideIcon): SurfaceEntry => ({
  kind: "surface",
  surface,
  icon,
});

export const DASHBOARD_LINK = {
  key: `nav-${LANDING_ROUTE}`,
  label: "Dashboard",
  href: LANDING_ROUTE,
  icon: House,
};

// The sidebar, Dashboard and command palette share the same destination order.
export const NAV_SECTIONS: { heading: string; entries: NavEntry[] }[] = [
  {
    heading: "Build",
    entries: [
      {
        kind: "group",
        label: "Agents",
        icon: Waypoints,
        items: [
          surfaceEntry("agents", Bot),
          surfaceEntry("sessions", MessagesSquare),
          surfaceEntry("deployments", Rocket),
        ],
      },
      {
        kind: "group",
        label: "Resources",
        icon: Boxes,
        defaultOpen: false,
        items: [
          surfaceEntry("files", FileText),
          surfaceEntry("skills", Sparkles),
          surfaceEntry("environments", Boxes),
          surfaceEntry("vaults", KeyRound),
          surfaceEntry("memory-stores", Database),
          surfaceEntry("dreams", Moon),
        ],
      },
    ],
  },
  {
    heading: "Organization",
    entries: [
      surfaceEntry("api-keys", KeySquare),
      surfaceEntry("usage", ChartColumn),
      {
        kind: "group",
        label: "Settings",
        icon: Settings,
        items: [
          surfaceEntry("members", Users),
          surfaceEntry("service-accounts", UserRoundCog),
        ],
      },
      {
        kind: "group",
        label: "Model Gateway",
        icon: Network,
        items: [surfaceEntry("models", Cpu), surfaceEntry("providers", Plug)],
      },
    ],
  },
];

export interface Destination {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  surface?: Surface;
}

export const DASHBOARD_SECTIONS = NAV_SECTIONS.map(({ heading, entries }) => ({
  heading,
  items: entries.flatMap((entry) =>
    entry.kind === "group" ? entry.items : [entry],
  ),
}));

export const NAV_DESTINATIONS: Destination[] = [
  DASHBOARD_LINK,
  ...DASHBOARD_SECTIONS.flatMap(({ items }) =>
    items.map(({ icon, surface }) => ({
      key: `nav-${surface}`,
      label: SURFACES[surface].label,
      href: surfaceRoute(surface),
      icon,
      surface,
    })),
  ),
];
