import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { UnsavedChangesProvider } from "@/components/shell/unsaved-changes";

export const metadata: Metadata = {
  title: "Managed Agents Console",
  description:
    "Web console for managed-agent-platform — self-hosted long-horizon AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes stamps the theme class on <html>
    // before hydration.
    <html
      lang="en"
      className="h-full antialiased"
      data-console-auth={
        process.env.CONSOLE_AUTH_MODE === "platform" ? "platform" : "legacy"
      }
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
