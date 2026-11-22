"use client";

import Link from "next/link";
import { useContext } from "react";
import {
  Boxes,
  FileText,
  Layers3,
  MessagesSquare,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { CreateKeyButton } from "@/components/console/api-keys";
import { DashboardModels } from "@/components/console/dashboard-models";
import { DashboardUsage } from "@/components/console/dashboard-usage";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { buttonVariants } from "@/components/ui/button";
import { PLAYGROUND_LINK } from "@/lib/nav";
import {
  SURFACE_NAMES,
  isSurfaceVisible,
  surfaceRoute,
  useSurfaces,
  type Surface,
} from "@/lib/platform/surfaces";
import { useNow } from "@/lib/session-trace/use-now";
import { cn } from "@/lib/utils";

type Resource = {
  destination: "playground" | Surface;
  label: string;
  description: string;
  action: string;
  icon: LucideIcon;
};

const resources: Resource[] = [
  {
    destination: "playground",
    label: "Playground",
    description: "Try models and prompts in your browser before writing code.",
    action: "Open playground",
    icon: MessagesSquare,
  },
  {
    destination: "models",
    label: "Model gateway",
    description:
      "Explore the model aliases and upstream deployments on your platform.",
    action: "View models",
    icon: Layers3,
  },
  {
    destination: "skills",
    label: "Skills",
    description:
      "Give agents reusable instructions and tools for specific tasks.",
    action: "Browse skills",
    icon: Boxes,
  },
  {
    destination: "files",
    label: "Files",
    description: "Upload and manage the files you use in agent sessions.",
    action: "Browse files",
    icon: FileText,
  },
];

const supportLinks = [
  [
    "API documentation",
    "https://github.com/OpenSDLC-Dev/managed-agent-platform",
  ],
  [
    "Help and support",
    "https://github.com/OpenSDLC-Dev/managed-agent-console/issues",
  ],
  [
    "Feedback",
    "https://github.com/OpenSDLC-Dev/managed-agent-console/issues/new/choose",
  ],
] as const;

function ResourceCard({
  destination,
  label,
  description,
  action,
  icon: Icon,
}: Resource) {
  const href =
    destination === "playground"
      ? PLAYGROUND_LINK.href
      : surfaceRoute(destination);
  return (
    <article className="relative flex min-h-[168px] min-w-0 flex-col items-start rounded-xl bg-muted/55 p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium leading-5">
        <Icon className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
        <Link
          href={href}
          data-dashboard-card={destination}
          className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {label}
        </Link>
      </h3>
      <p className="mt-2 mb-3 text-xs leading-[17px] text-muted-foreground">
        {description}
      </p>
      <Link
        href={href}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "relative mt-auto",
        )}
      >
        {action}
      </Link>
    </article>
  );
}

export default function DashboardPage() {
  const session = useContext(ConsoleSessionContext)?.data;
  const surfaces = useSurfaces();
  const hour = new Date(useNow(60_000)).getHours();
  const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName =
    session?.name?.trim().split(/\s+/)[0] || session?.login_name?.trim();
  const playground = session?.playground_access === true;
  const visibleResources = resources.filter(({ destination }) =>
    destination === "playground"
      ? playground
      : isSurfaceVisible(surfaces?.[destination], destination),
  );
  const noAccess =
    surfaces &&
    !playground &&
    !SURFACE_NAMES.some((surface) =>
      isSurfaceVisible(surfaces[surface], surface),
    ) &&
    Object.values(surfaces).some((entry) => entry.status === "denied");

  return (
    <div
      data-dashboard-layout
      className="@container mx-auto w-full max-w-[960px] sm:px-1"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1
          data-greeting-period={period}
          data-greeting-name={firstName}
          className="min-w-0 pl-1 font-serif text-2xl font-medium leading-7 [overflow-wrap:anywhere]"
        >
          Good {period}
          {firstName && `, ${firstName}`}
        </h1>
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Quick actions"
        >
          {isSurfaceVisible(surfaces?.["api-keys"]) && (
            <CreateKeyButton shortcut />
          )}
          {isSurfaceVisible(surfaces?.agents) && (
            <Link href="/agents/new" className={buttonVariants({ size: "sm" })}>
              <Waypoints aria-hidden />
              Build an agent
            </Link>
          )}
        </div>
      </header>
      <div className="space-y-6">
        {noAccess && (
          <div className="space-y-2 text-sm" data-no-resource-access>
            <p>You are signed in. This account has no resource access.</p>
            <a href="/setup" className="underline">
              Redeem an administrator setup code
            </a>
            <p className="text-muted-foreground">
              Or ask an organization administrator to change your role.
            </p>
          </div>
        )}
        {surfaces?.usage?.status === "available" && <DashboardUsage />}
        <DashboardModels />
        {visibleResources.length > 0 && (
          <section aria-labelledby="dashboard-resources">
            <h2
              id="dashboard-resources"
              className="mb-3 pl-1 text-[15px] font-semibold leading-5"
            >
              Resources
            </h2>
            <div className="grid gap-3 @min-[25rem]:grid-cols-2 @min-[45rem]:grid-cols-4">
              {visibleResources.map((resource) => (
                <ResourceCard key={resource.destination} {...resource} />
              ))}
            </div>
          </section>
        )}
      </div>
      <footer className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        {supportLinks.map(([label, href]) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm underline decoration-muted-foreground/50 underline-offset-4 hover:text-foreground focus-visible:outline-ring"
          >
            {label}
          </a>
        ))}
      </footer>
    </div>
  );
}
