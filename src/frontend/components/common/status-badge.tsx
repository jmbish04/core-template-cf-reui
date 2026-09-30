/**
 * @fileoverview StatusBadge — pills for task workflow status and project
 * lifecycle status, drawn with ReUI Badge `-light` variants so every colour is a
 * design token (info / success / warning / primary) and reads in both themes.
 */

import type { ComponentProps } from "react";

import { Badge } from "@/components/reui/badge";

import {
  PROJECT_STATUS_LABELS,
  STATUS_LABELS,
  type ProjectStatus,
  type TaskStatus,
} from "@/components/common/types";

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

/** Task status → ReUI Badge variant. Also used for dots/tones elsewhere. */
export const TASK_STATUS_VARIANT: Record<TaskStatus, BadgeVariant> = {
  todo: "secondary",
  in_progress: "info-light",
  in_review: "primary-light",
  done: "success-light",
};

/** Task status → token background for small status dots. */
export const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/60",
  in_progress: "bg-info",
  in_review: "bg-primary",
  done: "bg-success",
};

const PROJECT_STATUS_VARIANT: Record<ProjectStatus, BadgeVariant> = {
  active: "success-light",
  on_hold: "warning-light",
  archived: "secondary",
};

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <Badge variant={TASK_STATUS_VARIANT[status]} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <Badge variant={PROJECT_STATUS_VARIANT[status]} className={className}>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}
