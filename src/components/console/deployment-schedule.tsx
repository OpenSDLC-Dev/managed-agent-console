"use client";
import { TimezonePicker } from "./timezone-picker";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FREQUENCIES = [
  "Every minute",
  "Every hour",
  "Daily",
  "Weekdays",
  "Weekly",
  "Custom cron",
] as const;
type Frequency = (typeof FREQUENCIES)[number];
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Recognize only our presets; other valid platform expressions remain editable verbatim. */
export function scheduleDraft(expression: string) {
  const [minute, hour, day, month, weekday, extra] = expression
    .trim()
    .split(/\s+/);
  const numericMinute = /^([0-5]?\d)$/.test(minute ?? "");
  const numericHour = /^(\d|1\d|2[0-3])$/.test(hour ?? "");
  let frequency: Frequency = "Custom cron";
  if (!extra && day === "*" && month === "*") {
    if (minute === "*" && hour === "*" && weekday === "*")
      frequency = "Every minute";
    else if (numericMinute && hour === "*" && weekday === "*")
      frequency = "Every hour";
    else if (numericMinute && numericHour) {
      if (weekday === "*") frequency = "Daily";
      else if (weekday === "1-5") frequency = "Weekdays";
      else if (/^[0-6]$/.test(weekday ?? "")) frequency = "Weekly";
    }
  }
  return {
    frequency,
    minute: numericMinute ? String(Number(minute)) : "0",
    time:
      (numericHour ? String(Number(hour) % 12 || 12) : "9") +
      ":" +
      (numericMinute ? minute.padStart(2, "0") : "00"),
    period: numericHour && Number(hour) >= 12 ? "PM" : "AM",
    weekday: /^[0-6]$/.test(weekday ?? "") ? weekday : "1",
  };
}

function expressionFromDraft(draft: ReturnType<typeof scheduleDraft>) {
  if (draft.frequency === "Every minute") return "* * * * *";
  if (draft.frequency === "Every hour") return `${draft.minute} * * * *`;
  if (!/^(0?[1-9]|1[0-2]):[0-5]\d$/.test(draft.time)) return "";
  const [clockHour, minute] = draft.time.split(":");
  const hour = String(
    (Number(clockHour) % 12) + (draft.period === "PM" ? 12 : 0),
  );
  return `${minute ? Number(minute) : ""} ${hour ? Number(hour) : ""} * * ${draft.frequency === "Weekly" ? draft.weekday : draft.frequency === "Weekdays" ? "1-5" : "*"}`;
}

export function DeploymentSchedule({
  expression,
  timezone,
  onExpressionChange,
  onTimezoneChange,
}: {
  expression: string;
  timezone: string;
  onExpressionChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => scheduleDraft(expression));
  const change = (patch: Partial<typeof draft>) => {
    const next = {
      ...(draft.frequency === "Custom cron"
        ? scheduleDraft(expression)
        : draft),
      ...patch,
    };
    setDraft(next);
    if (next.frequency !== "Custom cron")
      onExpressionChange(expressionFromDraft(next));
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deployment-frequency">Frequency</Label>
          <select
            id="deployment-frequency"
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
            value={draft.frequency}
            onChange={(event) =>
              change({ frequency: event.target.value as Frequency })
            }
          >
            {FREQUENCIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <TimezonePicker value={timezone} onChange={onTimezoneChange} />
        </div>
      </div>
      {draft.frequency === "Custom cron" ? (
        <div className="space-y-1.5">
          <Label htmlFor="deployment-cron">Cron expression</Label>
          <Input
            id="deployment-cron"
            className="font-mono"
            value={expression}
            onChange={(event) => onExpressionChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            minute · hour · day · month · weekday
          </p>
        </div>
      ) : (
        <>
          {draft.frequency === "Every hour" && (
            <div className="space-y-1.5">
              <Label htmlFor="deployment-minute">At minute</Label>
              <Input
                id="deployment-minute"
                type="number"
                min={0}
                max={59}
                value={draft.minute}
                onChange={(event) => change({ minute: event.target.value })}
              />
            </div>
          )}
          {["Daily", "Weekdays", "Weekly"].includes(draft.frequency) && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="deployment-at">At</Label>
                <Input
                  id="deployment-at"
                  className="w-24"
                  placeholder="9:00"
                  pattern="(0?[1-9]|1[0-2]):[0-5][0-9]"
                  title="Enter a time from 1:00 to 12:59"
                  required
                  value={draft.time}
                  onChange={(event) => change({ time: event.target.value })}
                />
              </div>
              <fieldset className="flex rounded-lg bg-muted p-0.5">
                <legend className="sr-only">Time period</legend>
                {["AM", "PM"].map((period) => (
                  <label key={period} className="relative flex">
                    <input
                      type="radio"
                      name="deployment-time-period"
                      value={period}
                      checked={draft.period === period}
                      onChange={() => change({ period })}
                      className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                    <span className="pointer-events-none rounded-md px-3 py-1 text-sm text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {period}
                    </span>
                  </label>
                ))}
              </fieldset>
              {draft.frequency === "Weekly" && (
                <div className="space-y-1.5">
                  <Label htmlFor="deployment-weekday">On</Label>
                  <select
                    id="deployment-weekday"
                    className="h-8 rounded-lg border bg-background px-2 text-sm"
                    value={draft.weekday}
                    onChange={(event) =>
                      change({ weekday: event.target.value })
                    }
                  >
                    {DAYS.map((day, index) => (
                      <option value={index} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 text-xs">
            <code>{expression}</code>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => change({ frequency: "Custom cron" })}
            >
              Edit cron
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
