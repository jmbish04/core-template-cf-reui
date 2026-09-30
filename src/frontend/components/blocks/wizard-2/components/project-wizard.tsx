/**
 * @fileoverview ProjectWizard — the `/projects/new` island.
 *
 * ReUI Pro block `wizard-2`, keeping its Stepper machinery, its per-step
 * validation gate and its review step; the vendor-KYC content is replaced with
 * real project creation.
 *
 * Submit does two things in order: `POST /api/projects`, then one
 * `POST /api/tasks` per titled starter task carrying the new `projectId`. Only
 * once every call has succeeded does it navigate to `/projects` — a failure
 * leaves the wizard where it is and shows the API's own message inline.
 */

import { useCallback, useState, type FormEvent } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, FlagIcon } from "lucide-react";

import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/common";
import type { Project, Task } from "@/components/common";
import { ApiError, apiSend } from "@/lib/api";

import {
  WIZARD_STEPS,
  createDefaultDraft,
  emptyTask,
  filledTasks,
  getAllErrors,
  getFirstInvalidStep,
  getStepErrors,
  slugify,
  type ProjectDraft,
  type StarterTask,
  type WizardErrors,
} from "./project-data";
import { DetailsStepFields, ReviewStepFields, SetupStepFields } from "./project-steps";

/**
 * Create the project and its starter tasks.
 *
 * @param draft The validated draft.
 * @returns The created project row.
 * @throws {ApiError} If the project or any starter task could not be created.
 */
async function createProject(draft: ProjectDraft): Promise<Project> {
  const project = await apiSend<Project>("POST", "projects", {
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    description: draft.description.trim() || null,
    status: draft.status,
    color: draft.color,
    owner: draft.owner.trim(),
    starred: draft.starred,
  });

  for (const task of filledTasks(draft)) {
    await apiSend<Task>("POST", "tasks", {
      projectId: project.id,
      title: task.title.trim(),
      priority: task.priority,
      assignee: task.assignee.trim() || null,
    });
  }

  return project;
}

/** The `/projects/new` island: one screen, one surface (`frame`). */
export function ProjectWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft>(createDefaultDraft);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Once the slug is typed by hand it stops tracking the name. */
  const [slugTouched, setSlugTouched] = useState(false);

  const currentStepConfig = WIZARD_STEPS.find((s) => s.step === currentStep) ?? WIZARD_STEPS[0]!;

  const clearError = useCallback((field: keyof ProjectDraft) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const handleChange = useCallback(
    <K extends keyof ProjectDraft>(field: K, value: ProjectDraft[K]) => {
      setDraft((current) => ({ ...current, [field]: value }));
      if (field === "slug") setSlugTouched(true);
      clearError(field);
    },
    [clearError],
  );

  const handleNameChange = useCallback(
    (name: string) => {
      setDraft((current) => ({
        ...current,
        name,
        slug: slugTouched ? current.slug : slugify(name),
      }));
      clearError("name");
      if (!slugTouched) clearError("slug");
    },
    [clearError, slugTouched],
  );

  const handleTaskChange = useCallback(
    <K extends keyof StarterTask>(id: string, field: K, value: StarterTask[K]) => {
      setDraft((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === id ? { ...task, [field]: value } : task)),
      }));
      clearError("tasks");
    },
    [clearError],
  );

  const handleAddTask = useCallback(() => {
    setDraft((current) => ({ ...current, tasks: [...current.tasks, emptyTask()] }));
  }, []);

  const handleRemoveTask = useCallback(
    (id: string) => {
      setDraft((current) => ({ ...current, tasks: current.tasks.filter((t) => t.id !== id) }));
      clearError("tasks");
    },
    [clearError],
  );

  const handleBack = useCallback(() => setCurrentStep((step) => Math.max(1, step - 1)), []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;

      // Steps 1 and 2 only advance; the gate is the step's own validation.
      if (currentStepConfig.id !== "review") {
        const stepErrors = getStepErrors(currentStepConfig.id, draft);
        if (Object.keys(stepErrors).length > 0) {
          setErrors((current) => ({ ...current, ...stepErrors }));
          return;
        }
        setCurrentStep(Math.min(currentStep + 1, WIZARD_STEPS.length));
        return;
      }

      const allErrors = getAllErrors(draft);
      const invalidStep = getFirstInvalidStep(draft);
      if (invalidStep !== null) {
        setErrors(allErrors);
        setCurrentStep(invalidStep);
        return;
      }

      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await createProject(draft);
        window.location.assign("/projects");
      } catch (e) {
        setSubmitError(
          e instanceof ApiError ? e.message : "Could not create the project. Try again.",
        );
        setIsSubmitting(false);
      }
    },
    [currentStep, currentStepConfig.id, draft, isSubmitting],
  );

  const isLastStep = currentStep === WIZARD_STEPS.length;
  const canGoBack = currentStep > 1 && !isSubmitting;
  const taskCount = filledTasks(draft).length;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-2xl flex-col"
      aria-label="New project wizard"
    >
      <Stepper
        value={currentStep}
        onValueChange={setCurrentStep}
        indicators={{
          completed: <CheckIcon className="size-3.5" aria-hidden="true" />,
          loading: <Spinner className="size-3.5" />,
        }}
        className="w-full"
      >
        <Frame stacked={true} className="w-full">
          <FrameHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-px">
                <FrameTitle>New project</FrameTitle>
                <FrameDescription className="truncate text-sm">
                  {draft.name.trim() || "Unnamed project"}
                </FrameDescription>
              </div>
              <Badge variant="primary-light">
                {taskCount} starter {taskCount === 1 ? "task" : "tasks"}
              </Badge>
            </div>
          </FrameHeader>

          <FramePanel className="flex items-center overflow-x-auto">
            <StepperNav aria-label="Wizard progress" className="min-w-full items-center">
              {WIZARD_STEPS.map((step, index) => (
                <StepperItem
                  key={step.id}
                  step={step.step}
                  loading={isSubmitting && step.step === currentStep}
                  className="relative min-w-0"
                >
                  <StepperTrigger
                    type="button"
                    className="min-w-0 justify-start gap-2 disabled:opacity-100"
                  >
                    <StepperIndicator className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=completed]:bg-primary data-[state=inactive]:border-border data-[state=inactive]:text-foreground data-[state=active]:before:border-primary relative isolate size-6 overflow-visible rounded-full border before:pointer-events-none before:absolute before:inset-0 before:z-10 before:rounded-full before:border before:border-dashed before:border-transparent before:content-[''] data-[state=active]:border-0 data-[state=active]:before:animate-[spin_8s_linear_infinite] motion-reduce:data-[state=active]:before:animate-none">
                      {index + 1}
                    </StepperIndicator>
                    <StepperTitle className="text-foreground hidden truncate text-sm capitalize sm:block">
                      {step.title}
                    </StepperTitle>
                  </StepperTrigger>

                  {WIZARD_STEPS.length > index + 1 ? (
                    <StepperSeparator className="bg-border group-data-[state=completed]/step:bg-primary mx-2" />
                  ) : null}
                </StepperItem>
              ))}
            </StepperNav>
          </FramePanel>

          <FramePanel>
            <StepperPanel className="text-sm">
              {WIZARD_STEPS.map((step) => (
                <StepperContent key={step.id} value={step.step}>
                  {step.id === "details" ? (
                    <DetailsStepFields
                      draft={draft}
                      errors={errors}
                      onChange={handleChange}
                      onNameChange={handleNameChange}
                    />
                  ) : null}

                  {step.id === "setup" ? (
                    <SetupStepFields
                      draft={draft}
                      errors={errors}
                      onChange={handleChange}
                      onTaskChange={handleTaskChange}
                      onAddTask={handleAddTask}
                      onRemoveTask={handleRemoveTask}
                    />
                  ) : null}

                  {step.id === "review" ? <ReviewStepFields draft={draft} /> : null}
                </StepperContent>
              ))}
            </StepperPanel>

            {submitError ? <ErrorState message={submitError} className="mt-4" /> : null}
          </FramePanel>

          <FrameFooter className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FrameDescription className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
              <FlagIcon className="size-4 shrink-0" aria-hidden="true" />
              {currentStepConfig.description}
            </FrameDescription>

            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              {canGoBack ? (
                <Button type="button" variant="outline" onClick={handleBack} className="shrink-0">
                  <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                  Previous
                </Button>
              ) : null}
              <Button type="submit" disabled={isSubmitting} className="shrink-0">
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {isLastStep ? "Create project" : "Next step"}
                {!isLastStep && !isSubmitting ? (
                  <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
                ) : null}
              </Button>
            </div>
          </FrameFooter>
        </Frame>
      </Stepper>
    </form>
  );
}
