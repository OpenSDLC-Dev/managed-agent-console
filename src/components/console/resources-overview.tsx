"use client";

import { surfacePaths } from "@/lib/routes";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Page } from "@/lib/platform/http";
import { useFiles, useSkills, useLibraryCount } from "@/lib/platform/queries";
import { isSurfaceVisible, useSurfaces } from "@/lib/platform/surfaces";
import { ageLabel } from "@/lib/session-trace/timing";
import { useNow } from "@/lib/session-trace/use-now";
import { ErrorState, ListSkeleton } from "./bits";

type Library = "files" | "skills";
const labels = { files: "Files", skills: "Skills" } as const;

function ResourceCount({
  kind,
  first,
}: {
  kind: Library;
  first: Page<unknown>;
}) {
  const total = useLibraryCount(kind, first);
  return (
    <span
      data-count={total ?? undefined}
      data-count-minimum={total === null ? first.data.length : undefined}
      title={
        total === null
          ? "At least " + first.data.length + " " + kind
          : undefined
      }
      className="inline-flex h-[21px] min-w-[21px] items-center justify-center rounded-full bg-foreground/5 px-1.5 text-xs font-normal tabular-nums text-muted-foreground"
    >
      {total ?? first.data.length + "+"}
    </span>
  );
}

function ResourceCard<T extends { id: string }>({
  kind,
  data,
  error,
  name,
  detail,
}: {
  kind: Library;
  data?: Page<T>;
  error: Error | null;
  name: (record: T) => string;
  detail: (record: T) => ReactNode;
}) {
  const label = labels[kind];
  const param = kind === "files" ? "file" : "skill";
  return (
    <section
      aria-label={label}
      className="flex min-w-0 flex-col gap-4 rounded-xl bg-muted/70 p-4 dark:bg-[#202020]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] leading-5 font-medium">
          {label}
          {data && !error && <ResourceCount kind={kind} first={data} />}
        </h2>
        <Link
          href={surfacePaths[kind]}
          className="rounded-sm text-sm text-[#345477] underline decoration-current/40 underline-offset-2 hover:decoration-current dark:text-[#a4bfdb]"
        >
          View all {kind}
        </Link>
      </header>
      {error ? (
        <ErrorState error={error} />
      ) : !data ? (
        <ListSkeleton />
      ) : data.data.length ? (
        <ul className="-mx-3 divide-y divide-border">
          {data.data.slice(0, 3).map((record) => (
            <li key={record.id}>
              <Link
                href={
                  surfacePaths[kind] +
                  "?" +
                  param +
                  "=" +
                  encodeURIComponent(record.id)
                }
                data-resource-id={record.id}
                className="flex min-w-0 flex-col rounded-lg px-3 py-2 hover:bg-foreground/5 focus-visible:outline-ring"
              >
                <span className="truncate text-sm leading-5">
                  {name(record)}
                </span>
                <span className="truncate text-[13px] leading-[17px] text-muted-foreground">
                  {detail(record)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex grow flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <p className="text-sm font-medium">No {kind} yet</p>
          <p className="max-w-[480px] text-[13px] leading-[17px]">
            {kind === "files"
              ? "Upload a file once and reference it across requests."
              : "Create a skill to give agents reusable instructions."}
          </p>
        </div>
      )}
    </section>
  );
}

export function ResourcesOverview() {
  const surfaces = useSurfaces();
  const showFiles = isSurfaceVisible(surfaces?.files, "files");
  const showSkills = isSurfaceVisible(surfaces?.skills, "skills");
  const files = useFiles(undefined, showFiles);
  const skills = useSkills({}, showSkills);
  const addFile = showFiles && files.isSuccess;
  const addSkill = showSkills && skills.isSuccess;
  const now = useNow();
  return (
    <div data-resource-overview="" className="-mx-4 sm:-mx-8">
      <div className="mx-auto w-full max-w-[1600px] px-6">
        <header className="mb-9 grid gap-y-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <h1 className="font-serif text-[22px] leading-7 font-medium">
            Resources
          </h1>
          <p className="text-sm leading-5 text-muted-foreground md:col-span-2 md:row-start-2">
            The files, skills, and other resources set up in this workspace.
          </p>
          {(addFile || addSkill) && (
            <div className="md:col-start-2 md:row-start-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="sm"
                      className="h-7 min-w-[82px] gap-1 rounded-lg px-2 text-sm font-normal"
                    />
                  }
                >
                  <Plus aria-hidden className="size-4" /> Add{" "}
                  <ChevronDown aria-hidden className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={6}
                  className="w-40"
                >
                  {addFile && (
                    <DropdownMenuItem
                      render={<Link href={surfacePaths.files} />}
                    >
                      File
                    </DropdownMenuItem>
                  )}
                  {addSkill && (
                    <DropdownMenuItem
                      render={
                        <Link href={`${surfacePaths.skills}?create=true`} />
                      }
                    >
                      Skill
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </header>
        <div className="@container">
          <div className="grid grid-cols-1 gap-4 @min-[40rem]:grid-cols-2">
            {showFiles && (
              <ResourceCard
                kind="files"
                data={files.data}
                error={files.error}
                name={(file) => file.filename}
                detail={(file) => (
                  <time
                    dateTime={file.created_at}
                    data-timestamp={file.created_at}
                    title={file.created_at}
                  >
                    Added {ageLabel(file.created_at, now)}
                  </time>
                )}
              />
            )}
            {showSkills && (
              <ResourceCard
                kind="skills"
                data={skills.data}
                error={skills.error}
                name={(skill) => skill.display_name}
                detail={(skill) => (
                  <span className="capitalize" data-source={skill.source.type}>
                    {skill.source.type}
                  </span>
                )}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
