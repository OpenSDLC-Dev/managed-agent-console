"use client";
import type { ComponentProps } from "react";
import { ResourceInspector } from "./resource-inspector";
import { SkillDetail } from "./skill-detail";
export function SkillInspector(
  props: Omit<ComponentProps<typeof ResourceInspector>, "kind" | "children">,
) {
  return (
    <ResourceInspector {...props} kind="skill">
      <SkillDetail
        key={props.id}
        id={props.id}
        inspector
        onDeleted={props.onClose}
      />
    </ResourceInspector>
  );
}
