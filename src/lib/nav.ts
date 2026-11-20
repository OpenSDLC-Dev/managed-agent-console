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
import { LANDING_ROUTE, PLAYGROUND_ROUTE } from "./routes";

export interface SurfaceEntry {
  surface: Surface;
  icon: LucideIcon;
}

export interface GroupEntry {
  label: string;
  icon: LucideIcon;
  items: SurfaceEntry[];
}

const surfaceEntry = (surface: Surface, icon: LucideIcon): SurfaceEntry => ({
  surface,
  icon,
});

export const DASHBOARD_LINK = {
  key: `nav-${LANDING_ROUTE}`,
  label: "Dashboard",
  href: LANDING_ROUTE,
  icon: House,
};

export const PLAYGROUND_LINK = {
  key: `nav-${PLAYGROUND_ROUTE}`,
  label: "Playground",
  href: PLAYGROUND_ROUTE,
  icon: MessagesSquare,
};

// The sidebar, Dashboard and command palette share the same destination order.
export const NAV_SECTIONS: { heading: string; groups: GroupEntry[] }[] = [
  {
    heading: "Build",
    groups: [
      {
        label: "Agents",
        icon: Waypoints,
        items: [
          surfaceEntry("agents", Bot),
          surfaceEntry("sessions", MessagesSquare),
          surfaceEntry("deployments", Rocket),
          surfaceEntry("environments", Boxes),
          surfaceEntry("memory-stores", Database),
          surfaceEntry("vaults", KeyRound),
          surfaceEntry("dreams", Moon),
        ],
      },
      {
        label: "Resources",
        icon: Boxes,
        items: [
          surfaceEntry("files", FileText),
          surfaceEntry("skills", Sparkles),
        ],
      },
    ],
  },
  {
    heading: "Organization",
    groups: [
      {
        label: "Keys",
        icon: KeySquare,
        items: [
          surfaceEntry("api-keys", KeySquare),
          surfaceEntry("service-accounts", UserRoundCog),
        ],
      },
      {
        label: "Spending & usage",
        icon: ChartColumn,
        items: [surfaceEntry("usage", ChartColumn)],
      },
      {
        label: "Settings",
        icon: Settings,
        items: [surfaceEntry("members", Users)],
      },
      {
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

export const DASHBOARD_SECTIONS = NAV_SECTIONS.map(({ heading, groups }) => ({
  heading,
  items: groups.flatMap(({ items }) => items),
}));

export const NAV_DESTINATIONS: Destination[] = [
  DASHBOARD_LINK,
  PLAYGROUND_LINK,
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
