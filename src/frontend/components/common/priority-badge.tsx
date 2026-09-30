/**
 * @fileoverview PriorityBadge — a task's urgency as a ReUI Badge. Token-only
 * colour language shared by the grid, board cards, and the detail view:
 * low → secondary, medium → info, high → warning, urgent → destructive.
 */

import type { ComponentProps } from "react";

import { Badge } from "@/components/reui/badge";

import { PRIORITY_LABELS, type TaskPriority } from "@/components/common/types";

const PRIORITY_VARIANT: Record<TaskPriority, ComponentProps<typeof Badge>["variant"]> = {
  low: "secondary",
  medium: "info-light",
  high: "warning-light",
  urgent: "destructive-light",
};

export interface PriorityBadgeProps {
  priority: TaskPriority;
  className?: string;
}

/** Render a priority as a coloured pill. */
export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority]} className={className}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
