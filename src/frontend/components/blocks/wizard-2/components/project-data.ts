/**
 * @fileoverview The project wizard's option tables, plus the single import
 * point for everything else the wizard needs.
 *
 * The draft shape and all of its decision logic live in `./project-draft` and
 * are re-exported here, so call sites keep importing from one module. The split
 * exists because this file *value*-imports the label maps through the `@/`
 * alias, which bare Node cannot resolve — keeping the pure logic alias-free
 * lets `scripts/selfcheck-wizard.mjs` import and assert on it directly.
 */

import {
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
  type TaskPriority,
} from "@/components/common";

export * from "./project-draft";

/** Project lifecycle options for the step 2 status select. */
export const STATUS_OPTIONS = (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map(
  (value) => ({ value, label: PROJECT_STATUS_LABELS[value] }),
);

/** Task urgency options for each starter-task row. */
export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));
