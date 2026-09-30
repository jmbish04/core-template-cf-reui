/**
 * Runnable self-check for the project wizard's decision logic.
 *
 *   pnpm run selfcheck                 # runs every scripts/selfcheck*.mjs
 *   node scripts/selfcheck-wizard.mjs
 *
 * These three functions decide what the wizard actually POSTs to
 * `/api/projects` and `/api/tasks`, which is why they are worth a check:
 *
 *   slugify()       – the slug goes into a UNIQUE NOT NULL column, so a name
 *                     that slugs to "" or to something non-URL-safe is a 500
 *                     or a bad row, not a cosmetic problem.
 *   getStepErrors() – the only thing standing between an empty name and a
 *                     POST; if it stops objecting, the wizard submits junk.
 *   filledTasks()   – decides which starter-task rows become real tasks. If it
 *                     stops filtering, every blank row becomes an empty task.
 *
 * Each assertion below was verified to go red by breaking its function on
 * purpose (see the header of each section), because a check that cannot fail
 * is not a check.
 *
 * No test framework on purpose: plain asserts, runs anywhere Node runs. Node
 * strips the TypeScript types on import, and `project-draft.ts` is kept free of
 * value imports so it loads without the `@/` alias resolver.
 */
import assert from "node:assert/strict";

import {
  createDefaultDraft,
  filledTasks,
  getAllErrors,
  getFirstInvalidStep,
  getStepErrors,
  slugify,
} from "../src/frontend/components/blocks/wizard-2/components/project-draft.ts";

/** A draft that passes every step, as the starting point for each case. */
function validDraft(overrides = {}) {
  return {
    ...createDefaultDraft(),
    name: "Edge Platform",
    slug: "edge-platform",
    owner: "you",
    tasks: [],
    ...overrides,
  };
}

/** A starter-task row. */
function row(title, assignee = "") {
  return { id: `row-${title || "blank"}`, title, priority: "medium", assignee };
}

// --- 1. slugify produces something URL-safe and non-empty -------------------
// Break to verify: `return value` instead of the pipeline — the punctuation,
// accent and whitespace cases all go red.
{
  assert.equal(slugify("  Edge Platform  "), "edge-platform", "outer spaces must not survive");
  assert.equal(
    slugify("Café Résumé"),
    "cafe-resume",
    "accents must fold to base letters, not be dropped with the letter",
  );
  assert.equal(
    slugify("Q4 / 2026 — Migration!"),
    "q4-2026-migration",
    "punctuation must collapse to single hyphens",
  );
  assert.equal(slugify("--Trim--"), "trim", "leading and trailing hyphens must be stripped");
  assert.equal(slugify("a___b"), "a-b", "a run of separators is ONE hyphen, never an empty pair");

  // The shape contract, asserted over a spread of inputs rather than one case.
  for (const name of ["Edge Platform", "Café Résumé", "Q4 / 2026 — Migration!", "A.B.C", "99"]) {
    const slug = slugify(name);
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `"${name}" must slug to a URL-safe value`);
    assert.ok(slug.length > 0, `"${name}" must not slug to an empty string`);
  }

  // A name with nothing alphanumeric in it CANNOT produce a usable slug. The
  // right behaviour is an empty string, which step 1 then refuses (case 2) —
  // not a silently invented one.
  assert.equal(slugify("!!!"), "", "an unsluggable name must yield empty, not a made-up slug");
  assert.equal(slugify(""), "", "an empty name must yield an empty slug");
}

// --- 2. getStepErrors refuses an empty name and passes a valid step ---------
// Break to verify: `return {}` at the top of getStepErrors — every assertion
// in this section that expects an error goes red.
{
  assert.deepEqual(getStepErrors("details", validDraft()), {}, "a valid step 1 must pass clean");

  const noName = getStepErrors("details", validDraft({ name: "" }));
  assert.ok(noName.name, "an empty name must be refused");

  const blankName = getStepErrors("details", validDraft({ name: "   " }));
  assert.ok(blankName.name, "a whitespace-only name must be refused, not trimmed into validity");

  const noSlug = getStepErrors("details", validDraft({ slug: "" }));
  assert.ok(noSlug.slug, "an empty slug must be refused");

  const badSlug = getStepErrors("details", validDraft({ slug: "Edge Platform" }));
  assert.ok(badSlug.slug, "a slug that is not already slugified must be refused");

  assert.deepEqual(getStepErrors("setup", validDraft()), {}, "a valid step 2 must pass clean");

  const noOwner = getStepErrors("setup", validDraft({ owner: " " }));
  assert.ok(noOwner.owner, "a blank owner must be refused");

  // A row carrying an assignee but no title would be dropped by filledTasks,
  // so the user must be told rather than have their input vanish.
  const halfRow = getStepErrors("setup", validDraft({ tasks: [row("", "Sam")] }));
  assert.ok(halfRow.tasks, "a row with an assignee but no title must be refused");

  // A wholly blank row is the wizard's own default and is simply ignored.
  assert.deepEqual(
    getStepErrors("setup", validDraft({ tasks: [row("")] })),
    {},
    "an untouched blank row must NOT block the step",
  );

  // The submit gate routes back to the first bad step, so it must agree.
  assert.equal(getFirstInvalidStep(validDraft()), null, "a valid draft blocks at no step");
  assert.equal(getFirstInvalidStep(validDraft({ name: "" })), 1, "a bad name routes back to 1");
  assert.equal(getFirstInvalidStep(validDraft({ owner: "" })), 2, "a bad owner routes back to 2");
  assert.ok(getAllErrors(validDraft({ name: "", owner: "" })).name, "submit collects every step");
}

// --- 3. filledTasks drops blank rows so no empty task is ever POSTed --------
// Break to verify: `return draft.tasks` — the blank-row and whitespace cases
// go red.
{
  assert.deepEqual(filledTasks(validDraft({ tasks: [] })), [], "no rows means no tasks");

  assert.deepEqual(
    filledTasks(createDefaultDraft()).length,
    0,
    "the wizard's own default blank row must never become a task",
  );

  assert.deepEqual(
    filledTasks(validDraft({ tasks: [row("Ship it"), row(""), row("   ")] })).map((t) => t.title),
    ["Ship it"],
    "blank and whitespace-only rows must be dropped",
  );

  // Every surviving row must carry a title the API will accept, because
  // `POST /api/tasks` requires `title: z.string().min(1)`.
  for (const task of filledTasks(validDraft({ tasks: [row("Ship it"), row(" ")] }))) {
    assert.ok(task.title.trim().length > 0, "a POSTed task must have a non-blank title");
  }
}

console.log("selfcheck: all project-wizard assertions passed");
