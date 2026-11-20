import { ConsoleSessionBoundary } from "@/components/shell/console-session";
import { ConsoleShell } from "@/components/shell/console-shell";
import { Providers } from "@/components/shell/providers";
import { SidebarFooter } from "@/components/shell/sidebar-footer";
import { ConsoleVersion } from "@/components/shell/version";
import { SurfaceGuard } from "@/components/shell/surface-guard";

export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Providers>
      <ConsoleSessionBoundary>
        <ConsoleShell footer={<SidebarFooter version={<ConsoleVersion />} />}>
          <SurfaceGuard>{children}</SurfaceGuard>
        </ConsoleShell>
      </ConsoleSessionBoundary>
    </Providers>
  );
}
