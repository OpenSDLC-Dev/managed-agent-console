"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  EmptyState,
  ErrorState,
  IdCode,
  Time,
  UnavailableSurface,
} from "@/components/console/bits";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSkills } from "@/lib/platform/queries";
import { isUnimplemented } from "@/lib/platform/surfaces";
import { UploadSkillButton } from "@/components/console/upload-skill-button";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Skill } from "@/lib/platform/types";

const COLUMNS: Column<Skill>[] = [
  { key: "id", header: "ID", cell: (s) => <IdCode id={s.id} /> },
  {
    key: "title",
    header: "Title",
    className: "w-full",
    cell: (s) => s.display_title,
  },
  {
    key: "source",
    header: "Source",
    cell: (s) => (
      <Badge variant="outline" className="font-normal">
        {s.source}
      </Badge>
    ),
  },
  {
    key: "latest",
    header: "Latest version",
    cell: (s) =>
      s.latest_version ? (
        <span className="font-mono text-[13px]">{s.latest_version}</span>
      ) : (
        <span className="text-muted-foreground">none</span>
      ),
  },
  {
    key: "updated",
    header: "Updated",
    cell: (s) => <Time iso={s.updated_at} />,
  },
];

export default function SkillsPage() {
  const router = useRouter();
  const [source, setSource] = useState<"all" | "custom" | "anthropic">("all");
  const pager = useCursorPage(source);
  const { data, error, isPending } = useSkills({
    page: pager.page,
    source: source === "all" ? undefined : source,
  });

  if (isUnimplemented(error)) return <UnavailableSurface surface="skills" />;

  return (
    <div>
      <PageHeader
        title="Skills"
        subtitle="Packaged instructions and scripts agents load on demand."
        actions={<UploadSkillButton />}
      />
      <div className="flex items-center gap-1.5 pb-4 text-sm">
        <span className="text-muted-foreground">Source</span>
        <Select
          value={source}
          onValueChange={(value) => setSource(value as typeof source)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 rounded-lg"
            aria-label="Source filter"

            data-value={source}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="custom">custom</SelectItem>
            <SelectItem value="anthropic">anthropic</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            rows={data?.data ?? []}
            rowKey={(s) => s.id}
            loading={isPending}
            onRowClick={(s) => router.push(`/skills/${s.id}`)}
            empty={
              <EmptyState
                title="No skills yet"
                hint="Skills are uploaded through the API until slice 4 lands."
              />
            }
          />
          <Pager
            hasPrev={pager.hasPrev}
            hasNext={!!data?.next_page}
            onPrev={pager.goPrev}
            onNext={() => data?.next_page && pager.goNext(data.next_page)}
          />
        </>
      )}
    </div>
  );
}
