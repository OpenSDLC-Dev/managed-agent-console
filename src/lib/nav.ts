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
  Plus,
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
  AGENTS_CREATE_ROUTE,
  AGENTS_OVERVIEW_ROUTE,
  LANDING_ROUTE,
  MESSAGES_ROUTE,
  MESSAGE_LOGS_ROUTE,
  PLAYGROUND_ROUTE,
  RESOURCES_ROUTE,
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

const surfaceEntry = (
  surface: Surface,
  icon: LucideIcon,
  label: string = SURFACES[surface].label,
): Destination => ({
  key: `nav-${surface}`,
  label,
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
          {
            key: "nav-agents-overview",
            label: "Overview",
            href: AGENTS_OVERVIEW_ROUTE,
            icon: LayoutDashboard,
          },
          {
            key: "nav-agents-create",
            label: "Create",
            href: AGENTS_CREATE_ROUTE,
            icon: Plus,
          },
          surfaceEntry("agents", Bot),
          surfaceEntry("sessions", MessagesSquare),
          surfaceEntry("deployments", Rocket),
          surfaceEntry("environments", Boxes),
          surfaceEntry("memory-stores", Database, "Memory"),
          surfaceEntry("vaults", KeyRound, "Credential vaults"),
          surfaceEntry("dreams", Moon),
        ],
      },
      {
        label: "Resources",
        icon: Boxes,
        items: [
          {
            key: "nav-resource-overview",
            label: "Overview",
            href: RESOURCES_ROUTE,
            icon: LayoutDashboard,
          },
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
        items: [
          surfaceEntry("members", Users),
          {
            key: "nav-workspaces",
            label: "Workspaces",
            href: "/settings/workspaces",
            icon: Settings,
          },
        ],
      },
    ],
  },
];

export const NAV_DESTINATIONS: Destination[] = [
  DASHBOARD_LINK,
  ...NAV_SECTIONS.flatMap(({ groups }) =>
    groups.flatMap((group) =>
      group.items.map((item) => {
        const pageLabel =
          item.surface === "usage"
            ? "Overview"
            : item.surface === "api-keys"
              ? "API keys"
              : item.label;
        return { ...item, label: `${group.label} › ${pageLabel}` };
      }),
    ),
  ),
];
