import { cn } from "@/lib/utils";

export function DetailSection({
  title,
  children,
  className,
  testId,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /**
   * Marks a section whose *presence* is derived state — a surface the
   * deployment may or may not serve. E2E asserts on this rather than on the
   * heading text, so a copy edit does not redden a feature-detection test
   * (CLAUDE.md: read the attribute, not the sentence).
   */
  testId?: string;
}) {
  return (
    <section className={cn("pb-8", className)} data-testid={testId}>
      <div className="flex items-center justify-between gap-3 pb-3">
        <h2 className="text-base font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FieldList({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm">{children}</dl>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      tabIndex={0}
      className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[12px] leading-relaxed focus-visible:outline-2 focus-visible:outline-ring"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
