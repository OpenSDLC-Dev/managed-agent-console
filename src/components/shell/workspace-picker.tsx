"use client";
import { useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConsoleSessionContext } from "./console-session";
import { useLeaveConfirmation } from "./unsaved-changes";
import {
  switchDestination,
  useWorkspaceIndex,
} from "@/lib/platform/workspaces";

export function WorkspacePicker({
  multipleOnly = false,
}: {
  multipleOnly?: boolean;
}) {
  const session = useContext(ConsoleSessionContext)?.data;
  const index = useWorkspaceIndex(!!session?.signed_in);
  const router = useRouter();
  const path = usePathname();
  const { requestLeave } = useLeaveConfirmation();
  const rows = index.data ?? [];
  const active = rows.find((w) => w.id === session?.workspace_id);
  if (multipleOnly && rows.length < 2) return null;
  const name = active?.name ?? session?.workspace_name ?? "Default";
  const id = active?.id ?? session?.workspace_id ?? "default";
  return (
    <Select
      value={id}
      onValueChange={(value) => {
        const target = rows.find((w) => w.id === value);
        if (target && target.id !== id)
          requestLeave(() =>
            router.push(switchDestination(path ?? "/dashboard", target)),
          );
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Workspace"
        className="mb-3 w-full border-0 bg-muted px-3 shadow-none"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-[3px]"
            style={{ backgroundColor: active?.display_color ?? "#9b89f5" }}
          />
          <SelectValue className="truncate">{name}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        sideOffset={6}
        className="w-64 p-1.5"
      >
        {(rows.length ? rows : [{ id, name, display_color: "#9b89f5" }]).map(
          (w) => (
            <SelectItem key={w.id} value={w.id} className="h-7 px-2">
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-[3px]"
                style={{ backgroundColor: w.display_color }}
              />
              {w.name}
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
