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
  LayoutDashboard,
  List,
  MessageSquare,
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
import {
  LANDING_ROUTE,
  MESSAGES_ROUTE,
  MESSAGE_LOGS_ROUTE,
  PLAYGROUND_ROUTE,
} from "./routes";

export interface Destination {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  surface?: Surface;
}

export interface GroupEntry {
  label: string;
  icon: LucideIcon;
  items: Destination[];
}

const surfaceEntry = (surface: Surface, icon: LucideIcon): Destination => ({
  key: `nav-${surface}`,
  label: SURFACES[surface].label,
  href: surfaceRoute(surface),
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
  icon: MessageSquare,
};

// The sidebar and command palette share the same destination order.
export const NAV_SECTIONS: { heading: string; groups: GroupEntry[] }[] = [
  {
    heading: "Build",
    groups: [
      {
        label: "Messages",
        icon: MessageSquare,
        items: [
          {
            key: "nav-message-overview",
            label: "Overview",
            href: MESSAGES_ROUTE,
            icon: LayoutDashboard,
          },
          PLAYGROUND_LINK,
          {
            key: "nav-message-logs",
            label: "Logs",
            href: MESSAGE_LOGS_ROUTE,
            icon: List,
          },
        ],
      },
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
        label: "Model Gateway",
        icon: Network,
        items: [surfaceEntry("models", Cpu), surfaceEntry("providers", Plug)],
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
    ],
  },
];

export const NAV_DESTINATIONS: Destination[] = [
  DASHBOARD_LINK,
  ...NAV_SECTIONS.flatMap(({ groups }) => groups.flatMap(({ items }) => items)),
];
