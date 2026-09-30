/**
 * @fileoverview The three step bodies of the project-creation wizard.
 *
 * Keeps the block's original field grammar (`Field` / `FieldGroup`, the hinted
 * label, the repeatable rows with a trailing remove button, the review summary
 * sections) and swaps the vendor-KYC content for project fields.
 *
 * Selects go through `OptionSelect`, which hands Base UI an `items` map — a
 * bare `<SelectValue placeholder>` would render the raw value (`in_progress`)
 * in the trigger instead of its label.
 */

import { InfoIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PRIORITY_LABELS, PROJECT_STATUS_LABELS } from "@/components/common";

import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  filledTasks,
  type ProjectDraft,
  type StarterTask,
  type WizardErrors,
} from "./project-data";

type DraftChange = <K extends keyof ProjectDraft>(field: K, value: ProjectDraft[K]) => void;

function RequiredMark() {
  return <span className="text-destructive">*</span>;
}

function FieldLabelHint({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor?: string;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-fit items-center gap-1.5 leading-snug">
      <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-background inline-flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label={`${label} hint`}
            />
          }
        >
          <InfoIcon className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56 text-xs text-balance">
          {hint}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground min-w-0 text-right font-medium break-words">{value}</dd>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border/70 flex min-w-0 flex-col gap-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Details
// ---------------------------------------------------------------------------

/**
 * Name, slug, description and accent colour.
 *
 * @param draft Current draft values.
 * @param errors Validation messages for this step.
 * @param onChange Updates one draft field.
 * @param onNameChange Updates the name and, until the slug is edited by hand,
 *   re-derives the slug from it.
 */
export function DetailsStepFields({
  draft,
  errors,
  onChange,
  onNameChange,
}: {
  draft: ProjectDraft;
  errors: WizardErrors;
  onChange: DraftChange;
  onNameChange: (name: string) => void;
}) {
  return (
    <section className="flex flex-col gap-6" aria-labelledby="project-wizard-details-title">
      <SectionHeading
        id="project-wizard-details-title"
        title="Project details"
        description="How the project is named and addressed."
      />

      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.name)} className="gap-2">
          <FieldLabel htmlFor="project-wizard-name">
            Name <RequiredMark />
          </FieldLabel>
          <Input
            id="project-wizard-name"
            value={draft.name}
            onChange={(event) => onNameChange(event.target.value)}
            aria-invalid={Boolean(errors.name)}
            placeholder="Edge migration"
          />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={Boolean(errors.slug)} className="gap-2">
          <FieldLabelHint
            htmlFor="project-wizard-slug"
            label="Slug"
            hint="Derived from the name until you edit it. Must be unique."
          >
            Slug <RequiredMark />
          </FieldLabelHint>
          <Input
            id="project-wizard-slug"
            value={draft.slug}
            onChange={(event) => onChange("slug", event.target.value)}
            aria-invalid={Boolean(errors.slug)}
            placeholder="edge-migration"
            className="font-mono"
          />
          {errors.slug ? <FieldError>{errors.slug}</FieldError> : null}
        </Field>

        <Field className="gap-2 sm:col-span-2">
          <FieldLabel htmlFor="project-wizard-description">Description</FieldLabel>
          <Textarea
            id="project-wizard-description"
            value={draft.description}
            onChange={(event) => onChange("description", event.target.value)}
            className="min-h-24 resize-none"
            placeholder="What this project covers."
          />
        </Field>

        <Field className="gap-2">
          <FieldLabelHint
            htmlFor="project-wizard-color"
            label="Accent colour"
            hint="Stored on the project and used for its tile."
          >
            Accent colour
          </FieldLabelHint>
          <Input
            id="project-wizard-color"
            type="color"
            value={draft.color}
            onChange={(event) => onChange("color", event.target.value)}
            className="h-9 w-20 p-1"
          />
          <FieldDescription className="font-mono">{draft.color}</FieldDescription>
        </Field>
      </FieldGroup>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Setup
// ---------------------------------------------------------------------------

/** The repeatable starter-task rows — the block's beneficial-owner pattern. */
function StarterTaskRows({
  tasks,
  error,
  onTaskChange,
  onAddTask,
  onRemoveTask,
}: {
  tasks: StarterTask[];
  error?: string;
  onTaskChange: <K extends keyof StarterTask>(id: string, field: K, value: StarterTask[K]) => void;
  onAddTask: () => void;
  onRemoveTask: (id: string) => void;
}) {
  return (
    <Field data-invalid={Boolean(error)} className="gap-3 sm:col-span-2">
      <FieldLabelHint
        label="Starter tasks"
        hint="Each titled row is created against the new project."
      >
        Starter tasks
      </FieldLabelHint>

      <div className="flex flex-col gap-2">
        {tasks.map((task, index) => (
          <div
            key={task.id}
            className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1fr)_auto]"
          >
            <Field className="gap-1.5">
              <FieldLabel htmlFor={`${task.id}-title`} className="sr-only">
                Task {index + 1} title
              </FieldLabel>
              <Input
                id={`${task.id}-title`}
                value={task.title}
                onChange={(event) => onTaskChange(task.id, "title", event.target.value)}
                placeholder="Task title"
              />
            </Field>
            <OptionSelect
              value={task.priority}
              options={PRIORITY_OPTIONS}
              ariaLabel={`Task ${index + 1} priority`}
              size="default"
              className="w-full"
              onChange={(next) => onTaskChange(task.id, "priority", next)}
            />
            <Field className="gap-1.5">
              <FieldLabel htmlFor={`${task.id}-assignee`} className="sr-only">
                Task {index + 1} assignee
              </FieldLabel>
              <Input
                id={`${task.id}-assignee`}
                value={task.assignee}
                onChange={(event) => onTaskChange(task.id, "assignee", event.target.value)}
                placeholder="Assignee"
                autoComplete="name"
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive justify-self-start sm:justify-self-end"
              aria-label={`Remove starter task ${index + 1}`}
              onClick={() => onRemoveTask(task.id)}
            >
              <Trash2Icon className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex justify-end">
        <Button type="button" variant="outline" className="w-auto" onClick={onAddTask}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          Add task
        </Button>
      </div>
    </Field>
  );
}

/**
 * Lifecycle status, owner, the star flag and the starter-task rows.
 *
 * @param draft Current draft values.
 * @param errors Validation messages for this step.
 * @param onChange Updates one draft field.
 * @param onTaskChange Updates one field of one starter-task row.
 * @param onAddTask Appends an empty starter-task row.
 * @param onRemoveTask Drops one starter-task row by id.
 */
export function SetupStepFields({
  draft,
  errors,
  onChange,
  onTaskChange,
  onAddTask,
  onRemoveTask,
}: {
  draft: ProjectDraft;
  errors: WizardErrors;
  onChange: DraftChange;
  onTaskChange: <K extends keyof StarterTask>(id: string, field: K, value: StarterTask[K]) => void;
  onAddTask: () => void;
  onRemoveTask: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-6" aria-labelledby="project-wizard-setup-title">
      <SectionHeading
        id="project-wizard-setup-title"
        title="Setup"
        description="Where the project starts and what is already on its list."
      />

      <FieldGroup className="grid gap-5 sm:grid-cols-2">
        <Field className="gap-2">
          <FieldLabel htmlFor="project-wizard-status">Status</FieldLabel>
          <OptionSelect
            value={draft.status}
            options={STATUS_OPTIONS}
            ariaLabel="Project status"
            size="default"
            className="w-full"
            onChange={(next) => onChange("status", next)}
          />
        </Field>

        <Field data-invalid={Boolean(errors.owner)} className="gap-2">
          <FieldLabel htmlFor="project-wizard-owner">
            Owner <RequiredMark />
          </FieldLabel>
          <Input
            id="project-wizard-owner"
            value={draft.owner}
            onChange={(event) => onChange("owner", event.target.value)}
            aria-invalid={Boolean(errors.owner)}
            autoComplete="name"
          />
          {errors.owner ? <FieldError>{errors.owner}</FieldError> : null}
        </Field>

        <Field orientation="horizontal" className="gap-3 sm:col-span-2">
          <Checkbox
            id="project-wizard-starred"
            checked={draft.starred}
            onCheckedChange={(checked) => onChange("starred", checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="project-wizard-starred">Star this project</FieldLabel>
            <FieldDescription>Starred projects are pinned in the projects grid.</FieldDescription>
          </FieldContent>
        </Field>

        <StarterTaskRows
          tasks={draft.tasks}
          error={errors.tasks}
          onTaskChange={onTaskChange}
          onAddTask={onAddTask}
          onRemoveTask={onRemoveTask}
        />
      </FieldGroup>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Review
// ---------------------------------------------------------------------------

/**
 * Read-only summary of everything the wizard will create.
 *
 * @param draft Current draft values.
 */
export function ReviewStepFields({ draft }: { draft: ProjectDraft }) {
  const tasks = filledTasks(draft);

  return (
    <section className="flex flex-col gap-6" aria-labelledby="project-wizard-review-title">
      <SectionHeading
        id="project-wizard-review-title"
        title="Review"
        description="Creating this project also creates each titled starter task."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SummarySection title="Project">
          <dl className="flex flex-col gap-2.5">
            <SummaryLine label="Name" value={draft.name || "Not set"} />
            <SummaryLine label="Slug" value={draft.slug || "Not set"} />
            <SummaryLine label="Status" value={PROJECT_STATUS_LABELS[draft.status]} />
            <SummaryLine label="Owner" value={draft.owner} />
            <SummaryLine label="Starred" value={draft.starred ? "Yes" : "No"} />
          </dl>
        </SummarySection>

        <SummarySection title={`Starter tasks (${tasks.length})`}>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No starter tasks — the project is created empty.
            </p>
          ) : (
            <dl className="flex flex-col gap-2.5">
              {tasks.map((task) => (
                <SummaryLine
                  key={task.id}
                  label={task.title}
                  value={`${PRIORITY_LABELS[task.priority]}${
                    task.assignee.trim() ? ` · ${task.assignee.trim()}` : ""
                  }`}
                />
              ))}
            </dl>
          )}
        </SummarySection>
      </div>

      {draft.description.trim() ? (
        <SummarySection title="Description">
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">{draft.description}</p>
        </SummarySection>
      ) : null}
    </section>
  );
}
