"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/console/data-table";
import { Pager } from "@/components/console/pager";
import {
  Day,
  EmptyState,
  ErrorState,
  UnavailableSurface,
} from "@/components/console/bits";
import { IdCell } from "@/components/console/copy-id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkillInspector } from "@/components/console/skill-inspector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSkills } from "@/lib/platform/queries";
import { SURFACES, isUnimplemented } from "@/lib/platform/surfaces";
import { UploadSkillButton } from "@/components/console/upload-skill-button";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Skill } from "@/lib/platform/types";

const COLUMNS: Column<Skill>[] = [
  { key: "id", header: "ID", cell: (s) => <IdCell id={s.id} /> },
  {
    key: "title",
    header: "Name",
    className: "w-full",
    cell: (s) => s.display_name,
  },
  {
    key: "source",
    header: "Source",
    cell: (s) => (
      <Badge variant="outline" className="font-normal">
        {s.source.type}
      </Badge>
    ),
  },
  {
    key: "latest",
    header: "Latest version ID",
    cell: (s) =>
      s.latest_version_id ? (
        <IdCell id={s.latest_version_id} />
      ) : (
        <span className="text-muted-foreground">none</span>
      ),
  },
  {
    key: "updated",
    header: "Updated",
    cell: (s) => <Day iso={s.updated_at} />,
  },
];

export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsList />
    </Suspense>
  );
}

function SkillsList() {
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("skill");
  const lookup = useRef<HTMLInputElement>(null);
  const selectSkill = (id?: string) => {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("skill", id);
    else params.delete("skill");
    router.push(`/skills${params.size ? `?${params}` : ""}`, { scroll: false });
  };
  const [source, setSource] = useState<"all" | "custom" | "anthropic">("all");
  const pager = useCursorPage(source);
  const { data, error, isPending } = useSkills({
    page: pager.page,
    source: source === "all" ? undefined : source,
  });

  if (isUnimplemented(error)) return <UnavailableSurface surface="skills" />;
  const rows = data?.data ?? [];
  const selectedIndex = rows.findIndex((skill) => skill.id === selected);

  return (
    <div>
      <PageHeader
        title="Skills"
        subtitle={SURFACES.skills.blurb}
        actions={<UploadSkillButton />}
      />
      <a
        className="mb-5 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
        href="https://github.com/OpenSDLC-Dev/managed-agent-platform"
        target="_blank"
        rel="noreferrer"
      >
        View documentation
      </a>
      <div className="flex flex-wrap items-center gap-2 pb-4 text-sm">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = lookup.current?.value.trim();
            if (id) selectSkill(id);
          }}
        >
          <Input
            ref={lookup}
            aria-label="Find skill by ID"
            placeholder="Find skill by ID"
            className="h-8 w-56"
          />
          <Button variant="outline" size="sm" type="submit">
            Find
          </Button>
        </form>
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
            activeRowKey={selected ?? undefined}
            loading={isPending}
            onRowClick={(s) => selectSkill(s.id)}
            empty={
              <EmptyState
                title="No skills yet"
                hint="Upload a skill bundle to make it available to agents."
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
      {selected && (
        <SkillInspector
          id={selected}
          previous={selectedIndex > 0 ? rows[selectedIndex - 1].id : undefined}
          next={selectedIndex >= 0 ? rows[selectedIndex + 1]?.id : undefined}
          onSelect={selectSkill}
          fallbackFocus={lookup}
          onClose={() => selectSkill()}
        />
      )}
    </div>
  );
}
