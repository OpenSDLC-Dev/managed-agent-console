import type { ComponentProps } from "react";

/** Style single-choice dropdowns while preserving native form and listbox behavior. */
export function NativeSelect({
  multiple,
  size,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      {...props}
      multiple={multiple}
      size={size}
      data-slot={multiple || (size ?? 1) > 1 ? undefined : "native-select"}
    />
  );
}
