/**
 * Runnable self-check for the task tree model behind /tasks.
 *
 *   node scripts/selfcheck-task-tree.mjs
 *
 * Two behaviours here are invisible to reading and expensive to get wrong:
 *
 *  1. ANCESTOR PRESERVATION. A filter that keeps only the rows that matched
 *     turns a tree into a list of orphans — "Wire the retry" with no epic above
 *     it tells a reader nothing. Every filter case below matches a LEAF three
 *     levels down and asserts the whole path back to the root survived.
 *
 *  2. THE ONE-PASS ROLLUPS. Progress, subtask counts and overdue counts are
 *     derived bottom-up from each child's own resolved figure, never recounted
 *     from the flat list. The arithmetic is asserted against hand-computed
 *     numbers, so a change to the weighting fails here rather than quietly
 *     reporting a plausible-looking wrong percentage.
 *
 * It also pins the absence case that bit us in design: a task whose parent is
 * NOT in the page is promoted to the root, never dropped. "Parent missing" is
 * a fact about the page, not permission to hide a row.
 *
 * No test framework on purpose: one file, plain asserts, runs anywhere Node
 * runs. Node strips the TypeScript types on import.
 */
import assert from "node:assert/strict";

import {
  buildTaskRows,
  buildTaskTree,
  filterTaskNodes,
  isOverdue,
  meanProgress,
  totalOverdue,
  totalTasks,
} from "../src/frontend/components/tasks/task-tree.ts";

/** Fixed clock, so "overdue" never depends on the day the check is run. */
const NOW = Date.parse("2026-06-15T12:00:00Z");
const PAST = Date.parse("2026-06-01T12:00:00Z");
const FUTURE = Date.parse("2026-07-01T12:00:00Z");

/** A task row shaped exactly like `GET /api/tasks` serializes one. */
function task(id, overrides = {}) {
  return {
    id,
    parentId: null,
    projectId: "proj-1",
    title: id,
    description: null,
    status: "todo",
    priority: "medium",
    assignee: null,
    labels: [],
    dueDate: null,
    progress: 0,
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

//   epic
//   ├─ story-a            50%, due in the past, still open  -> overdue
//   │   └─ task-a1       100%, due in the past, done        -> NOT overdue
//   └─ story-b            20%, due in the future            -> NOT overdue
//   orphan                10%, parentId points at a task not in the page
const FLAT = [
  task("epic", { title: "Ship the retry path", assignee: "Ada" }),
  task("story-a", {
    parentId: "epic",
    title: "Wire the retry",
    progress: 50,
    dueDate: PAST,
    labels: ["backend"],
  }),
  task("task-a1", {
    parentId: "story-a",
    title: "Add the backoff",
    progress: 100,
    status: "done",
    dueDate: PAST,
    assignee: "Grace",
  }),
  task("story-b", {
    parentId: "epic",
    title: "Document it",
    progress: 20,
    dueDate: FUTURE,
    projectId: "proj-2",
  }),
  task("orphan", { parentId: "ghost-task", title: "Orphaned work", progress: 10 }),
];

/** Ids of a node list, for terse structural assertions. */
const ids = (nodes) => nodes.map((n) => n.id);

// --- 1. a missing parent promotes, it never deletes --------------------------
{
  const roots = buildTaskTree(FLAT);
  assert.deepEqual(
    ids(roots),
    ["epic", "orphan"],
    "a task whose parent is not in the page must surface at the root, not vanish",
  );
  assert.deepEqual(ids(roots[0].children), ["story-a", "story-b"], "children keep API order");
  assert.deepEqual(ids(roots[0].children[0].children), ["task-a1"], "nesting goes deeper than one level");

  const rows = buildTaskRows(roots, NOW);
  assert.equal(totalTasks(rows), FLAT.length, "every input task must appear exactly once in the tree");
}

// --- 2. overdue is due-in-the-past AND not done ------------------------------
{
  assert.equal(isOverdue(task("x", { dueDate: PAST }), NOW), true);
  assert.equal(
    isOverdue(task("x", { dueDate: PAST, status: "done" }), NOW),
    false,
    "a finished task is late for nothing",
  );
  assert.equal(isOverdue(task("x", { dueDate: FUTURE }), NOW), false);
  assert.equal(isOverdue(task("x", { dueDate: null }), NOW), false, "no due date is not overdue");
}

// --- 3. the rollups, against hand-computed numbers ---------------------------
{
  const rows = buildTaskRows(buildTaskTree(FLAT), NOW);
  const epic = rows.find((r) => r.id === "epic");
  const storyA = epic.children.find((r) => r.id === "story-a");
  const leaf = storyA.children[0];

  assert.equal(epic.subtaskCount, 3, "epic nests story-a, task-a1 and story-b");
  assert.equal(storyA.subtaskCount, 1);
  assert.equal(leaf.subtaskCount, 0, "a leaf nests nothing");

  // story-a subtree = {50, 100} -> 75. epic subtree = {0, 50, 100, 20} over 4
  // nodes -> 42.5, rounded to 43. Weighted by node count, so story-a's two
  // tasks count twice story-b's one.
  assert.equal(leaf.rollupProgress, 100, "a leaf reports its own progress");
  assert.equal(storyA.rollupProgress, 75);
  assert.equal(epic.rollupProgress, 43, "branch progress is the node-weighted subtree mean");

  assert.equal(leaf.overdueCount, 0, "the done leaf is not overdue");
  assert.equal(storyA.overdueCount, 1, "story-a itself is past due and open");
  assert.equal(epic.overdueCount, 1, "overdue counts roll up, and only once");
  assert.equal(totalOverdue(rows), 1);

  // Grand total across roots: {0,50,100,20} + orphan 10 over 5 nodes = 36.
  assert.equal(meanProgress(rows), 36, "the footer mean spans every root, orphans included");
}

// --- 4. a deep leaf match keeps its whole ancestor path ----------------------
{
  const kept = filterTaskNodes(buildTaskTree(FLAT), { query: "backoff" });
  assert.deepEqual(ids(kept), ["epic"], "the root above the match must survive the filter");
  assert.deepEqual(ids(kept[0].children), ["story-a"], "the middle of the path must survive too");
  assert.deepEqual(ids(kept[0].children[0].children), ["task-a1"], "the match itself is the leaf");
  assert.equal(
    kept[0].children.find((n) => n.id === "story-b"),
    undefined,
    "a sibling with nothing matching under it is pruned",
  );
}

// --- 5. the search box reads assignee and labels, not just the title ---------
{
  const byAssignee = filterTaskNodes(buildTaskTree(FLAT), { query: "grace" });
  assert.deepEqual(
    ids(byAssignee[0].children[0].children),
    ["task-a1"],
    "assignee is searchable, case-insensitively",
  );

  const byLabel = filterTaskNodes(buildTaskTree(FLAT), { query: "backend" });
  assert.deepEqual(ids(byLabel[0].children), ["story-a"], "labels are searchable");
}

// --- 6. a facet prunes the subtree but still keeps the ancestors -------------
{
  const kept = filterTaskNodes(buildTaskTree(FLAT), { query: "", status: "done" });
  assert.deepEqual(ids(kept), ["epic"], "a non-matching ancestor is kept for the path");
  assert.deepEqual(ids(kept[0].children), ["story-a"]);
  assert.deepEqual(ids(kept[0].children[0].children), ["task-a1"], "only the done task remains");

  const byProject = filterTaskNodes(buildTaskTree(FLAT), { query: "", projectId: "proj-2" });
  assert.deepEqual(ids(byProject[0].children), ["story-b"], "the project facet prunes siblings");
  assert.equal(byProject.length, 1, "orphan is in proj-1 and has no matching descendant");
}

// --- 7. a branch that matches the query alone keeps its contents -------------
{
  const kept = filterTaskNodes(buildTaskTree(FLAT), { query: "wire the retry" });
  assert.deepEqual(ids(kept[0].children), ["story-a"]);
  assert.deepEqual(
    ids(kept[0].children[0].children),
    ["task-a1"],
    "you searched for the branch, so you get what is inside it",
  );

  // ...but once a facet narrows, the subtree is pruned to matches too.
  const narrowed = filterTaskNodes(buildTaskTree(FLAT), {
    query: "wire the retry",
    priority: "medium",
    status: "todo",
  });
  assert.equal(
    narrowed[0].children[0].children,
    undefined,
    "the done leaf must not ride along under a matching branch when a facet is active",
  );
}

// --- 8. no filter is not the same as a filter that matches everything --------
{
  const tree = buildTaskTree(FLAT);
  assert.equal(filterTaskNodes(tree, { query: "" }), tree, "an empty filter returns the tree untouched");
  assert.equal(
    filterTaskNodes(tree, { query: "no-such-task" }).length,
    0,
    "zero matches is an empty tree, not the whole tree",
  );
}

console.log("selfcheck: all task-tree assertions passed");
