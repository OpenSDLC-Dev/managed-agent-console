"use client";

import { useAgentVersionOptions } from "@/lib/platform/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "./bits";

export function DeploymentAgentVersion({
  id,
  version,
  onChange,
  disabled,
  head,
}: {
  id: string;
  version: number | undefined;
  onChange: (version: number) => void;
  disabled: boolean;
  head?: number;
}) {
  const query = useAgentVersionOptions(id);
  const versions = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">Version</span>
      <Select
        value={version ? String(version) : ""}
        disabled={disabled}
        onValueChange={(value) => {
          if (value) onChange(Number(value));
        }}
      >
        <SelectTrigger aria-label="Agent version" className="h-8 w-full">
          <SelectValue>
            <span
              className="flex items-center gap-2"
              data-agent-version={version}
            >
              {version ? `v${version}` : "Select a version"}
              {head !== undefined && version === head && (
                <Badge variant="secondary">Latest</Badge>
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          role="region"
          aria-label="Agent versions"
          footer={
            <>
              {query.error && <ErrorState error={query.error} />}
              {query.hasNextPage && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Load older versions
                </Button>
              )}
            </>
          }
        >
          {version && !versions.some((item) => item.version === version) && (
            <SelectItem value={String(version)}>v{version} (pinned)</SelectItem>
          )}
          {versions.map((item) => (
            <SelectItem key={item.version} value={String(item.version)}>
              v{item.version}
              {item.version === head ? " Latest" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Runs use this version until you change it.
      </p>
    </div>
  );
}
