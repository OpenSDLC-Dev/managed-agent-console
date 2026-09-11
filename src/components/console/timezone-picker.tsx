"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";

/** Suggestions assist selection; the platform still validates the timezone. */
export function TimezonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const items = useMemo(
    () =>
      [
        ...new Set(["UTC", value, ...zones, ...(search ? [search] : [])]),
      ].filter((zone) => zone.toLowerCase().includes(search.toLowerCase())),
    [zones, value, search],
  );
  return (
    <Combobox.Root
      items={items}
      filter={null}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      inputValue={search}
      onInputValueChange={setSearch}
      onOpenChange={(open) => {
        if (open) setZones(Intl.supportedValuesOf?.("timeZone") ?? []);
        else setSearch("");
      }}
    >
      <Combobox.Label className="text-sm font-medium">
        IANA timezone
      </Combobox.Label>
      <Combobox.Trigger className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="truncate">{value || "Select timezone"}</span>
        <ChevronDown className="size-4 shrink-0" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={4}
          className="z-50 max-w-[calc(100vw-2rem)]"
        >
          <Combobox.Popup className="w-80 max-w-full rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            <Combobox.Input
              aria-label="Search timezones"
              placeholder="Search timezones…"
              className="mb-1 h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Combobox.List className="max-h-64 overflow-y-auto">
              {(zone: string) => (
                <Combobox.Item
                  key={zone}
                  value={zone}
                  className="flex cursor-default items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="break-all">{zone}</span>
                  <Combobox.ItemIndicator>
                    <Check className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">
              Type another timezone to use its exact value.
            </p>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
