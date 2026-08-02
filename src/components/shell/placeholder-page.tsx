import { PageHeader } from "@/components/shell/page-header";

export function PlaceholderPage({
  title,
  subtitle,
  slice,
}: {
  title: string;
  subtitle: string;
  slice: string;
}) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          Arrives with {slice} of plan 01.
        </p>
      </div>
    </div>
  );
}
