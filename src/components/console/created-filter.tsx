"use client";

import { useState, useRef, useId, type CSSProperties } from "react";
import { DayPicker } from "@daypicker/react";
import "@daypicker/react/style.css";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import {
  CREATED_PRESETS,
  parseCreatedDate,
  dateValue,
  type CreatedPresetKey,
  type CreatedRange,
} from "./created-filter-state";
export {
  createdGte,
  createdSelection,
  parseCreatedDate,
} from "./created-filter-state";
export type {
  CreatedPresetKey,
  CreatedSelection,
  CreatedRange,
} from "./created-filter-state";

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = parseCreatedDate(value);
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Input
          id={id}
          placeholder="YYYY-MM-DD"
          value={value}
          aria-invalid={!!value && !selected}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 min-w-0"
        />
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={"Open " + label + " calendar"}
          aria-expanded={open}
          aria-controls={id + "-calendar"}
          onClick={() => setOpen(!open)}
        >
          <CalendarIcon className="size-4" />
        </Button>
      </div>
      {open && (
        <div
          id={id + "-calendar"}
          role="group"
          aria-label={label + " calendar"}
          className="mt-2 flex justify-center rounded-lg border p-2"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
            }
          }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            showOutsideDays
            navLayout="around"
            onSelect={(date) => {
              onChange(date ? dateValue(date) : "");
              setOpen(false);
              trigger.current?.focus();
            }}
            autoFocus
            formatters={{
              formatWeekdayName: (date) =>
                date.toLocaleDateString("en-US", { weekday: "short" }),
            }}
            className="text-sm"
            style={
              {
                "--rdp-accent-color": "var(--foreground)",
                "--rdp-accent-background-color": "var(--accent)",
                "--rdp-day-height": "36px",
                "--rdp-day-width": "38px",
                "--rdp-day_button-height": "32px",
                "--rdp-day_button-width": "32px",
                "--rdp-nav-height": "32px",
                "--rdp-nav_button-width": "28px",
                "--rdp-nav_button-height": "28px",
              } as CSSProperties
            }
            styles={{ month_caption: { fontSize: 14, fontWeight: 500 } }}
          />
        </div>
      )}
    </div>
  );
}

export function CreatedFilter({
  value,
  range,
  onChange,
  sessionPresets = false,
}: {
  value: CreatedPresetKey;
  range?: CreatedRange;
  onChange: (key: CreatedPresetKey, range?: CreatedRange) => void;
  sessionPresets?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<CreatedRange>({ start: "", end: "" });
  const valid =
    (!draft.start || !!parseCreatedDate(draft.start)) &&
    (!draft.end || !!parseCreatedDate(draft.end));
  const presets = CREATED_PRESETS.filter(
    (preset) => sessionPresets || !["today", "1h"].includes(preset.key),
  );
  const labelDate = (text: string) =>
    parseCreatedDate(text)?.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) ?? text;
  const label =
    value === "custom"
      ? range?.start && range?.end
        ? `${labelDate(range.start)} – ${labelDate(range.end)}`
        : range?.start
          ? `After ${labelDate(range.start)}`
          : range?.end
            ? `Before ${labelDate(range.end)}`
            : "All time"
      : value === "24h" && sessionPresets
        ? "Last day"
        : CREATED_PRESETS.find((preset) => preset.key === value)?.label;
  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Created</span>
      <Select
        value={value}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setDraft(range ?? { start: "", end: "" });
            setCustom(value === "custom");
          }
        }}
        onValueChange={(key) => {
          onChange(key as CreatedPresetKey);
          setOpen(false);
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-8 min-w-0 rounded-lg"
          aria-label="Created filter"
          data-value={value}
        >
          <span className="truncate">{label}</span>
        </SelectTrigger>
        <SelectContent
          role="region"
          aria-label="Created date filter"
          align="start"
          alignItemWithTrigger={false}
          className="w-84 max-w-[calc(100vw-24px)] p-1"
          footer={
            <div className="mt-1 border-t pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                aria-expanded={custom}
                onClick={() => setCustom(!custom)}
              >
                Custom range
              </Button>
              {custom && (
                <form
                  className="space-y-3 p-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!valid) return;
                    onChange(
                      draft.start || draft.end ? "custom" : "all",
                      draft,
                    );
                    setOpen(false);
                  }}
                >
                  <DateField
                    label="Start"
                    value={draft.start}
                    onChange={(start) => setDraft({ ...draft, start })}
                  />
                  <DateField
                    label="End"
                    value={draft.end}
                    onChange={(end) => setDraft({ ...draft, end })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Dates use your local time zone.
                  </p>
                  {!valid && (
                    <p role="alert" className="text-xs text-destructive">
                      Enter a valid date as YYYY-MM-DD.
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      className="flex-1"
                      disabled={!valid}
                    >
                      Apply
                    </Button>
                  </div>
                </form>
              )}
            </div>
          }
        >
          {presets.map((preset) => (
            <SelectItem key={preset.key} value={preset.key}>
              {preset.key === "24h" && sessionPresets
                ? "Last day"
                : preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
