"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { IdCell } from "@/components/console/copy-id";
import type { Column } from "@/components/console/data-table";
import { Badge } from "@/components/ui/badge";
import { SkillInspector } from "@/components/console/skill-inspector";
import { ResourceDate } from "@/components/console/library-format";
import {
  LibraryRowMenu,
  ResourceLibrary,
} from "@/components/console/resource-library";
import {
  UploadSkillButton,
  CreateSkillDialog,
  UpdateSkillDialog,
} from "@/components/console/upload-skill-button";
import { getSkill, useSkills } from "@/lib/platform/queries";
import { useCursorPage } from "@/lib/platform/use-cursor-page";
import type { Skill } from "@/lib/platform/types";

const columns: Column<Skill>[] = [
  { key: "id", header: "ID", cell: (skill) => <IdCell id={skill.id} full /> },
  {
    key: "name",
    header: "Name",
    className: "w-full",
    cell: (skill) => skill.display_name,
  },
  {
    key: "source",
    header: "Source",
    cell: (skill) => (
      <Badge
        variant="secondary"
        className="font-normal capitalize data-[source=anthropic]:bg-blue-500/10 data-[source=anthropic]:text-blue-700 dark:data-[source=anthropic]:text-blue-300"
        data-source={skill.source.type}
      >
        {skill.source.type}
      </Badge>
    ),
  },
  {
    key: "version",
    header: "Latest version ID",
    cell: (skill) =>
      skill.latest_version_id ? <IdCell id={skill.latest_version_id} /> : "—",
  },
  {
    key: "updated",
    header: "Updated",
    cell: (skill) => <ResourceDate iso={skill.updated_at} />,
  },
];

function SkillsList() {
  const params = useSearchParams();
  const router = useRouter();
  const page = useCursorPage("skills");
  const list = useSkills({ page: page.page });
  const [update, setUpdate] = useState<Skill | null>(null);
  return (
    <>
      <ResourceLibrary
        kind="skill"
        title="Skills"
        description="Skills are repeatable and customizable instructions that agents can follow."
        page={page}
        list={list}
        getRecord={getSkill}
        columns={columns}
        name={(skill) => skill.display_name}
        canDelete={(skill) => skill.source.type === "custom"}
        UploadButton={UploadSkillButton}
        action={(skill, remove) =>
          skill.source.type === "custom" ? (
            <LibraryRowMenu
              name={skill.display_name}
              onDelete={remove}
              onUpdate={() => setUpdate(skill)}
            />
          ) : null
        }
        Inspector={SkillInspector}
      />
      {update && (
        <UpdateSkillDialog id={update.id} onClose={() => setUpdate(null)} />
      )}
      {params.get("create") === "true" && (
        <CreateSkillDialog
          onCreated={page.first}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete("create");
            router.replace(
              "/skills" + (next.size ? "?" + next.toString() : ""),
              { scroll: false },
            );
          }}
        />
      )}
    </>
  );
}
export default function SkillsPage() {
  return (
    <Suspense>
      <SkillsList />
    </Suspense>
  );
}
