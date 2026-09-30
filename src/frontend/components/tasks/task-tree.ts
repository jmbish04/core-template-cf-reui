/**
 * @fileoverview Task tree model + rolled-up measures for the `/tasks` tree grid.
 *
 * The API hands back a FLAT task list (`GET /api/tasks`); nesting lives in the
 * self-referential `parentId` column. This module turns that flat list into the
 * recursive shape TanStack's `getSubRows` needs, then resolves every
 * tree-derived measure in one pass — never a hardcoded subtotal.
 *
 * Three measures roll up, each answering a question the flat list cannot:
 *  - `subtaskCount` — how much work hides under a collapsed branch.
 *  - `rollupProgress` — the mean progress of the branch and everything in it.
 *  - `overdueCount`  — how many past-due, not-done tasks sit in the subtree.
 *
 * Ported from the ReUI `data-grid-grouping-4` block's `buildBomRows` /
 * `filterBomNodes` machinery, which is where the recursive-rollup and
 * ancestor-preserving-filter patterns come from.
 */

import type { Task, TaskPriority, TaskStatus } from "@/components/common";

// ---------------------------------------------------------------------------
// Wire + tree shapes
// ---------------------------------------------------------------------------

/**
 * A task row as the API actually serializes it. The shared `Task` type in
 * `@/components/common` predates the self-referential parent column, so the
 * hierarchy field is added here rather than by editing a type other surfaces own.
 */
export interface TaskRecord extends Task {
  /** Parent task id, or null for a top-level task. */
  parentId: string | null;
}

/** A task with its direct children resolved. */
export interface TaskNode extends TaskRecord {
  children?: TaskNode[];
}

/** One task node with every tree-derived measure resolved. */
export interface TaskRow {
  id: string;
  task: TaskRecord;
  /** Tasks nested below this one, at every depth. 0 on a leaf. */
  subtaskCount: number;
  /** Mean `progress` of this task and every descendant, 0–100. */
  rollupProgress: number;
  /** Tasks at or below this row that are past due and not `done`. */
  overdueCount: number;
  children?: TaskRow[];
}

/** Facet filters applied alongside the search box. */
export interface TaskTreeFilters {
  query: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Flat list → tree
// ---------------------------------------------------------------------------

/**
 * Build the task tree from the flat list the API returns.
 *
 * A task whose `parentId` is not present in the list (paged out, or orphaned by
 * the `on delete set null` rule on the parent FK) is promoted to the root rather
 * than dropped — a missing parent must never make a task disappear.
 *
 * @param flat Tasks exactly as `GET /api/tasks` returned them, in API order.
 * @returns Root-level nodes with `children` populated, API order preserved.
 */
export function buildTaskTree(flat: TaskRecord[]): TaskNode[] {
  const byId = new Map<string, TaskNode>();
  for (const task of flat) byId.set(task.id, { ...task });

  const roots: TaskNode[] = [];
  for (const task of flat) {
    const node = byId.get(task.id)!;
    const parent = task.parentId ? byId.get(task.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      (parent.children ??= []).push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

/** Whether a task is past its due date and still open. */
export function isOverdue(task: TaskRecord, now = Date.now()): boolean {
  if (task.dueDate === null || task.dueDate === undefined) return false;
  if (task.status === "done") return false;
  const ms = typeof task.dueDate === "number" ? task.dueDate : new Date(task.dueDate).getTime();
  return !Number.isNaN(ms) && ms < now;
}

/**
 * Resolve every tree-derived measure in one bottom-up pass.
 *
 * Progress is a true subtree mean: a branch's figure is the sum of every
 * node's progress (itself included) divided by the node count, reconstructed
 * from each child's own mean and count so the recursion stays single-pass.
 *
 * @param nodes Tree produced by {@link buildTaskTree}.
 * @param now Clock used for the overdue test; injectable for tests.
 * @returns Rows carrying `subtaskCount`, `rollupProgress` and `overdueCount`.
 */
export function buildTaskRows(nodes: TaskNode[], now = Date.now()): TaskRow[] {
  return nodes.map((node) => {
    const { children: rawChildren, ...task } = node;
    const self = task as TaskRecord;
    const selfOverdue = isOverdue(self, now) ? 1 : 0;

    if (!rawChildren?.length) {
      return {
        id: self.id,
        task: self,
        subtaskCount: 0,
        rollupProgress: self.progress,
        overdueCount: selfOverdue,
      };
    }

    const children = buildTaskRows(rawChildren, now);
    let nodeCount = 1;
    let progressSum = self.progress;
    let overdueCount = selfOverdue;

    for (const child of children) {
      const childNodes = child.subtaskCount + 1;
      nodeCount += childNodes;
      progressSum += child.rollupProgress * childNodes;
      overdueCount += child.overdueCount;
    }

    return {
      id: self.id,
      task: self,
      subtaskCount: nodeCount - 1,
      rollupProgress: Math.round(progressSum / nodeCount),
      overdueCount,
      children,
    };
  });
}

// ---------------------------------------------------------------------------
// Filtering — ancestors are always preserved
// ---------------------------------------------------------------------------

/** Text a search query is matched against, lowercased once per node. */
export function taskSearchBlob(task: TaskRecord): string {
  return [task.title, task.assignee, ...(task.labels ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Does this one node satisfy the query and every active facet? */
function nodeMatches(node: TaskNode, filters: TaskTreeFilters): boolean {
  if (filters.status && node.status !== filters.status) return false;
  if (filters.priority && node.priority !== filters.priority) return false;
  if (filters.projectId && node.projectId !== filters.projectId) return false;
  if (filters.query.length > 0 && !taskSearchBlob(node).includes(filters.query)) return false;
  return true;
}

/** True when any facet (not the search box) is narrowing the tree. */
function hasFacets(filters: TaskTreeFilters): boolean {
  return Boolean(filters.status || filters.priority || filters.projectId);
}

/**
 * Prune the tree to matching nodes, KEEPING EVERY ANCESTOR of a hit.
 *
 * A bare leaf lifted out of its tree is unreadable — "Fix the header" tells you
 * nothing without the epic above it — so a non-matching parent survives whenever
 * something under it matched. With only a search query active, a matching branch
 * also keeps its whole subtree (you searched for the branch, you want its
 * contents); once a facet is narrowing, the subtree is pruned to matches too.
 *
 * @param nodes Tree to prune.
 * @param filters Search query (pre-lowercased) plus optional facets.
 * @returns A new tree containing matches and their ancestor paths only.
 */
export function filterTaskNodes(nodes: TaskNode[], filters: TaskTreeFilters): TaskNode[] {
  const facets = hasFacets(filters);
  if (filters.query.length === 0 && !facets) return nodes;

  const kept: TaskNode[] = [];
  for (const node of nodes) {
    const matched = nodeMatches(node, filters);

    if (matched && !facets) {
      kept.push(node);
      continue;
    }

    const children = node.children?.length ? filterTaskNodes(node.children, filters) : [];
    if (children.length > 0) {
      kept.push({ ...node, children });
      continue;
    }
    if (matched) kept.push({ ...node, children: undefined });
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Expansion helpers (generic over anything with `id` + `children`)
// ---------------------------------------------------------------------------

interface TreeLike {
  id: string;
  children?: TreeLike[];
}

/**
 * Open the first branch at every level and nothing else, so the deepest path is
 * on screen at first paint without dumping the whole tree on the reader.
 *
 * @param rows Rows currently in the grid.
 * @returns An expanded-row map for TanStack's `expanded` state.
 */
export function getFirstPathExpandedState(rows: TreeLike[]): Record<string, boolean> {
  const expanded: Record<string, boolean> = {};
  let current: TreeLike[] | undefined = rows;

  while (current?.length) {
    const branch: TreeLike | undefined = current.find((row) => row.children?.length);
    if (!branch) break;
    expanded[branch.id] = true;
    current = branch.children;
  }
  return expanded;
}

/**
 * Ids of every expandable row down to `level`, for the depth control.
 *
 * @param rows Rows currently in the grid.
 * @param level Depth to expand to; `Number.MAX_SAFE_INTEGER` means all.
 * @returns An expanded-row map for TanStack's `expanded` state.
 */
export function getLevelExpandedState(rows: TreeLike[], level: number): Record<string, boolean> {
  const expanded: Record<string, boolean> = {};

  function walk(current: TreeLike[], depth: number) {
    if (depth >= level) return;
    for (const row of current) {
      if (!row.children?.length) continue;
      expanded[row.id] = true;
      walk(row.children, depth + 1);
    }
  }

  walk(rows, 0);
  return expanded;
}

/** Stable fingerprint of an expanded-row map, used to light the depth control. */
export function expandedSignature(expanded: Record<string, boolean>): string {
  return Object.keys(expanded)
    .filter((id) => expanded[id])
    .sort()
    .join("|");
}

// ---------------------------------------------------------------------------
// Grand totals (the footer + header metrics)
// ---------------------------------------------------------------------------

/** Every task in these subtrees, branches included. */
export function totalTasks(rows: TaskRow[]): number {
  return rows.reduce((sum, row) => sum + row.subtaskCount + 1, 0);
}

/** Past-due, not-done tasks anywhere in these subtrees. */
export function totalOverdue(rows: TaskRow[]): number {
  return rows.reduce((sum, row) => sum + row.overdueCount, 0);
}

/**
 * Mean progress across every task in these subtrees, weighted by task count so
 * a ten-task branch counts ten times a lone leaf.
 *
 * @param rows Rows to aggregate.
 * @returns A whole percentage 0–100; 0 when there are no rows.
 */
export function meanProgress(rows: TaskRow[]): number {
  let count = 0;
  let sum = 0;
  for (const row of rows) {
    const nodes = row.subtaskCount + 1;
    count += nodes;
    sum += row.rollupProgress * nodes;
  }
  return count === 0 ? 0 : Math.round(sum / count);
}
