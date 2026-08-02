import { cn } from "@/lib/utils";

export function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("pb-8", className)}>
      <h2 className="pb-3 text-base font-medium">{title}</h2>
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
    <pre className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-[12px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
