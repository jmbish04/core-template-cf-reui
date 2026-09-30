/**
 * Runnable self-check for the two hand-written parsers behind /chat/agentic
 * and /chat/voice.
 *
 *   pnpm run selfcheck        # runs every scripts/selfcheck*.mjs
 *   node scripts/selfcheck-chat-shapes.mjs
 *
 * Both parsers stand between a model's free-form reply and a UI that must not
 * go blank. `parsePlan` decides whether there is a run at all; `parseAnswer`
 * decides what an assistant bubble renders, ON EVERY FRAME of a stream, when
 * the JSON fence is still open and the JSON inside it is half written. Those
 * are the cases below, because they are invisible to reading and only show up
 * against a real router.
 *
 * No test framework on purpose: plain asserts, runs anywhere Node runs. Both
 * modules are import-free by design so Node's type stripping is all it takes.
 */
import assert from "node:assert/strict";

import { parsePlan } from "../src/frontend/components/blocks/ai-chat-6/components/parse-plan.ts";
import { parseAnswer } from "../src/frontend/components/blocks/ai-chat-8/components/answer-shape.ts";

// --- parsePlan ---------------------------------------------------------------

assert.deepEqual(
  parsePlan("1. Read the open tasks\n2. Group them by project\n3. Draft the update"),
  ["Read the open tasks", "Group them by project", "Draft the update"],
  "a plain numbered list is the plan",
);

assert.deepEqual(
  parsePlan("Here is the plan:\n\n1) Read the tasks\n2) Draft it\n\nLet me know."),
  ["Read the tasks", "Draft it"],
  "preamble and sign-off around the list are dropped, not parsed as steps",
);

assert.deepEqual(
  parsePlan("- Read the tasks\n- Draft the update"),
  ["Read the tasks", "Draft the update"],
  "a bulleted plan is accepted rather than failing the run over formatting",
);

assert.deepEqual(
  parsePlan("1. Numbered wins\n- bulleted loses"),
  ["Numbered wins"],
  "numbered lines win outright; the two formats are never mixed into one plan",
);

assert.deepEqual(
  parsePlan("I can't plan that without more detail."),
  [],
  "prose yields no steps, so the caller reports it instead of running nothing",
);

assert.equal(
  parsePlan(Array.from({ length: 20 }, (_, i) => `${i + 1}. step`).join("\n")).length,
  8,
  "the plan is capped at MAX_STEPS",
);

// --- parseAnswer: the streaming cases ----------------------------------------

{
  // THE case: mid-stream the fence is open. Rendering must keep the text.
  const partial = '```json\n{"shape":"steps","items":["one","tw';
  const { shape, prose } = parseAnswer(partial);
  assert.equal(shape.shape, "prose", "an unclosed fence is prose, not a shape");
  assert.equal(prose, partial, "the half-written body is kept verbatim — never a blank bubble");
}

{
  // A fence that closed around invalid JSON must degrade the same way.
  const broken = '```json\n{"shape":"steps","items":[1,2,\n```';
  const { shape, prose } = parseAnswer(broken);
  assert.equal(shape.shape, "prose", "unparseable JSON falls back to prose");
  assert.equal(prose, broken, "and keeps the text rather than dropping the answer");
}

{
  // A shape this renderer does not know is not a reason to lose the reply.
  const unknown = '```json\n{"shape":"gantt","items":[]}\n```';
  assert.equal(parseAnswer(unknown).shape.shape, "prose", "an unknown shape degrades to prose");
}

// --- parseAnswer: the three real shapes --------------------------------------

{
  const { shape, prose } = parseAnswer(
    'Here you go.\n\n```json\n{"shape":"steps","title":"Deploy","items":["Build","Ship"]}\n```',
  );
  assert.equal(shape.shape, "steps");
  assert.deepEqual(shape.items, ["Build", "Ship"]);
  assert.equal(shape.title, "Deploy");
  assert.equal(prose, "Here you go.", "prose around the fence survives the fence being lifted out");
}

{
  const { shape } = parseAnswer('```json\n{"shape":"facts","items":[{"label":"Open","value":"12"}]}\n```');
  assert.equal(shape.shape, "facts");
  assert.deepEqual(shape.items, [{ label: "Open", value: "12" }]);
}

{
  const { shape } = parseAnswer('```json\n{"shape":"table","columns":["a","b"],"rows":[["1","2"]]}\n```');
  assert.equal(shape.shape, "table");
  assert.deepEqual(shape.columns, ["a", "b"]);
  assert.deepEqual(shape.rows, [["1", "2"]]);
}

{
  // A shape whose required array is missing is a malformed shape, not a table.
  assert.equal(
    parseAnswer('```json\n{"shape":"table","columns":["a"]}\n```').shape.shape,
    "prose",
    "a table with no rows array is rejected rather than rendered empty",
  );
}

// --- the plain case ----------------------------------------------------------

assert.equal(parseAnswer("Just a sentence.").shape.shape, "prose");
assert.equal(parseAnswer("Just a sentence.").prose, "Just a sentence.");

console.log("selfcheck-chat-shapes: ok");
