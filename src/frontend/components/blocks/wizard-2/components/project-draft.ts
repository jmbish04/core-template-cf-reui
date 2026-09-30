/**
 * @fileoverview The project wizard's draft shape and its decision logic —
 * what gets validated, what gets slugged, and which starter-task rows are
 * real enough to POST.
 *
 * Split out of `project-data.ts` for one concrete reason: everything here is
 * pure, and every import is `import type`, which Node's type stripping erases.
 * That makes this module loadable by `scripts/selfcheck-wizard.mjs` under plain
 * `node`. The sibling module keeps the option tables, which need a *value*
 * import of the label maps through the `@/` alias that bare Node cannot
 * resolve.
 *
 * Keep it that way: no value imports in this file.
 */

import type { ProjectStatus, TaskPriority } from "@/components/common";

export type WizardStepId = "details" | "setup" | "review";

export interface WizardStep {
  id: WizardStepId;
  step: number;
  title: string;
  description: string;
}

/** One repeatable starter-task row in step 2. */
export interface StarterTask {
  /** Client-only row key; never sent to the API. */
  id: string;
  title: string;
  priority: TaskPriority;
  assignee: string;
}

/** Every value the wizard collects. */
export interface ProjectDraft {
  name: string;
  slug: string;
  description: string;
  color: string;
  status: ProjectStatus;
  owner: string;
  starred: boolean;
  tasks: StarterTask[];
}

/** Per-field validation messages, keyed by draft field. */
export type WizardErrors = Partial<Record<keyof ProjectDraft, string>>;

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: "details",
    step: 1,
    title: "Details",
    description: "Name the project and give it a URL-safe slug.",
  },
  {
    id: "setup",
    step: 2,
    title: "Setup",
    description: "Lifecycle, owner, and the tasks to start with.",
  },
  {
    id: "review",
    step: 3,
    title: "Review",
    description: "Check everything, then create the project.",
  },
];

/**
 * The accent colour the `projects.color` column defaults to. Mirrored here so
 * the colour input opens on the value the server would have stored anyway.
 */
export const DEFAULT_PROJECT_COLOR = "#6366f1";

/** Value the `projects.owner` column defaults to. */
export const DEFAULT_PROJECT_OWNER = "you";

/** Create a fresh, empty starter-task row. */
export function emptyTask(): StarterTask {
  return {
    id: `task-${crypto.randomUUID()}`,
    title: "",
    priority: "medium",
    assignee: "",
  };
}

/** An empty draft — every wizard run starts here, with no demo content. */
export function createDefaultDraft(): ProjectDraft {
  return {
    name: "",
    slug: "",
    description: "",
    color: DEFAULT_PROJECT_COLOR,
    status: "active",
    owner: DEFAULT_PROJECT_OWNER,
    starred: false,
    tasks: [emptyTask()],
  };
}

/**
 * Lower-case, hyphenate and strip a display name down to a URL-safe slug.
 *
 * Accents are folded to their base letters first (NFD, then drop the combining
 * marks), so "Café Résumé" slugs to `cafe-resume` rather than losing the
 * accented letters to the non-alphanumeric sweep.
 *
 * @param value Free text, typically the project name.
 * @returns A slug of `[a-z0-9-]`, with no leading or trailing hyphen. Empty
 *   when `value` contains nothing alphanumeric at all.
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Starter-task rows the user actually filled in — the exact set that will be
 * POSTed to `/api/tasks`. A row with no title is dropped, so the wizard can
 * never create an untitled task.
 *
 * @param draft The current draft.
 * @returns Only the rows carrying a non-blank title.
 */
export function filledTasks(draft: ProjectDraft): StarterTask[] {
  return draft.tasks.filter((task) => task.title.trim().length > 0);
}

/**
 * Validate one step of the draft.
 *
 * @param stepId Which step to check.
 * @param draft The current draft.
 * @returns Field-keyed messages; empty when the step is valid.
 */
export function getStepErrors(stepId: WizardStepId, draft: ProjectDraft): WizardErrors {
  const errors: WizardErrors = {};

  if (stepId === "details") {
    if (!draft.name.trim()) errors.name = "Enter a project name.";
    if (!draft.slug.trim()) {
      errors.slug = "Enter a slug.";
    } else if (draft.slug !== slugify(draft.slug)) {
      errors.slug = "Use lowercase letters, numbers and hyphens only.";
    }
  }

  if (stepId === "setup") {
    if (!draft.owner.trim()) errors.owner = "Enter an owner.";
    // A row with an assignee but no title would be silently dropped on submit,
    // so it is an error rather than an omission.
    const halfFilled = draft.tasks.some(
      (task) => !task.title.trim() && task.assignee.trim().length > 0,
    );
    if (halfFilled) errors.tasks = "Give every starter task a title, or clear the row.";
  }

  return errors;
}

/** All blocking errors across every step, for the final submit. */
export function getAllErrors(draft: ProjectDraft): WizardErrors {
  return { ...getStepErrors("details", draft), ...getStepErrors("setup", draft) };
}

/** 1-based number of the first step carrying an error, or null when valid. */
export function getFirstInvalidStep(draft: ProjectDraft): number | null {
  if (Object.keys(getStepErrors("details", draft)).length > 0) return 1;
  if (Object.keys(getStepErrors("setup", draft)).length > 0) return 2;
  return null;
}
