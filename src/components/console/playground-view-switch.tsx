import { useId } from "react";
import { cn } from "@/lib/utils";

export function PlaygroundViewSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="inline-flex rounded-lg bg-muted/70 p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label key={option} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            className="peer sr-only"
            checked={value === option}
            onChange={() => onChange(option)}
          />
          <span
            className={cn(
              "block rounded-md px-3 py-0.5 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-ring",
              value === option && "bg-background shadow-xs",
            )}
          >
            {option}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
