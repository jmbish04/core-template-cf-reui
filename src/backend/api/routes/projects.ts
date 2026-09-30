/**
 * @fileoverview Projects REST API router.
 *
 * Provides full CRUD over the `projects` D1 table plus a star-toggle action.
 * All routes are registered via `app.openapi(createRoute(...), handler)` so
 * every endpoint is reflected in `/openapi.json` and Scalar/Swagger UI.
 *
 * Mount this router at `/api/projects` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /           – list projects (q, status, starred, sort, limit, offset)
 *   POST   /           – create project
 *   GET    /{id}       – get project by id
 *   PATCH  /{id}       – partial update
 *   DELETE /{id}       – hard delete
 *   POST   /{id}/star  – toggle starred flag
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";

import { getDb } from "../../db";
import { insertProjectSchema, projects, selectProjectSchema, tasks } from "../../db/schema";

/**
 * Live task counts per project id.
 *
 * `projects.task_count` is a denormalized column that nothing maintains once
 * the row exists: creating or deleting a task does not touch it, so a project
 * created through the wizard reported "0 tasks" forever even though its
 * starter tasks were written. A card reading zero looks like the create
 * silently failed, which is the worst possible way to be wrong.
 *
 * One grouped count is always right and cannot drift. It is a separate query
 * rather than a correlated subquery so the SQL is plain enough to read.
 *
 * @param db An open Drizzle client.
 * @param ids Project ids to count for. An empty list short-circuits.
 * @returns projectId → number of tasks. Ids with no tasks are absent.
 */
async function taskCountsFor(
  db: ReturnType<typeof getDb>,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ projectId: tasks.projectId, count: sql<number>`count(*)` })
    .from(tasks)
    .where(inArray(tasks.projectId, ids))
    .groupBy(tasks.projectId);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.projectId) counts.set(row.projectId, Number(row.count));
  }
  return counts;
}

/** Replace the stale stored count with the live one. */
function withTaskCount<T extends { id: string; taskCount: number }>(
  row: T,
  counts: Map<string, number>,
): T {
  return { ...row, taskCount: counts.get(row.id) ?? 0 };
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const projectIdParam = z.object({ id: z.string().min(1) });

const projectListQuerySchema = z.object({
  q: z.string().optional().openapi({ description: "Full-text search on name and description." }),
  status: z
    .enum(["active", "archived", "on_hold"])
    .optional()
    .openapi({ description: "Filter by lifecycle status." }),
  starred: z
    .enum(["true", "false"])
    .optional()
    .openapi({ description: "Filter to starred (true) or un-starred (false) projects." }),
  sort: z
    .enum(["name", "createdAt", "updatedAt", "taskCount"])
    .optional()
    .openapi({ description: "Sort field (default: updatedAt desc)." }),
  limit: z
    .string()
    .optional()
    .openapi({ description: "Max rows to return (default 50)." }),
  offset: z
    .string()
    .optional()
    .openapi({ description: "Rows to skip for pagination (default 0)." }),
});

/** Slim insert body — id, createdAt, updatedAt are server-generated. */
const createProjectBody = insertProjectSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ name: z.string().min(1), slug: z.string().min(1) });

/** All project fields are optional for a PATCH. */
const patchProjectBody = createProjectBody.partial();

const projectListResponse = z.object({
  data: z.array(selectProjectSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const deleteResponseSchema = z.object({ ok: z.boolean() });
const starResponseSchema = z.object({ id: z.string(), starred: z.boolean() });

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const projectsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Projects"],
    summary: "List projects",
    operationId: "projectsList",
    request: { query: projectListQuerySchema },
    responses: {
      200: {
        description: "Paginated list of projects.",
        content: { "application/json": { schema: projectListResponse } },
      },
    },
  }),
  async (c) => {
    const { q, status, starred, sort, limit: lStr, offset: oStr } = c.req.valid("query");
    const limit = Math.min(parseInt(lStr ?? "50", 10) || 50, 200);
    const offset = parseInt(oStr ?? "0", 10) || 0;
    const db = getDb(c.env);

    const conditions = [];
    if (q) {
      conditions.push(
        or(like(projects.name, `%${q}%`), like(projects.description, `%${q}%`)),
      );
    }
    if (status) conditions.push(eq(projects.status, status));
    if (starred !== undefined) {
      conditions.push(eq(projects.starred, starred === "true"));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortMap = {
      name: projects.name,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      taskCount: projects.taskCount,
    } as const;
    const sortCol = sortMap[sort as keyof typeof sortMap] ?? projects.updatedAt;
    // Newest-first is right for dates and counts, and wrong for a name: "sort
    // by name" descending hands back Z->A, which reads as a bug.
    const direction = sort === "name" ? asc : desc;

    const [rows, countResult] = await Promise.all([
      db.select().from(projects).where(where).orderBy(direction(sortCol)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(projects).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    const counts = await taskCountsFor(db, rows.map((r) => r.id));
    return c.json({ data: rows.map((r) => withTaskCount(r, counts)), total, limit, offset }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Projects"],
    summary: "Create project",
    operationId: "projectsCreate",
    request: {
      body: { content: { "application/json": { schema: createProjectBody } } },
    },
    responses: {
      201: {
        description: "Created project.",
        content: { "application/json": { schema: selectProjectSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .insert(projects)
      .values({ ...body, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return c.json(row!, 201);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}
// ---------------------------------------------------------------------------

const notFoundSchema = z.object({ error: z.string() });

projectsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Projects"],
    summary: "Get project by ID",
    operationId: "projectsGet",
    request: { params: projectIdParam },
    responses: {
      200: {
        description: "Project record.",
        content: { "application/json": { schema: selectProjectSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!row) {
      return c.json({ error: "Project not found." }, 404);
    }
    const counts = await taskCountsFor(db, [row.id]);
    return c.json(withTaskCount(row, counts), 200);
  },
);

// ---------------------------------------------------------------------------
// PATCH /{id}
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Projects"],
    summary: "Partial update project",
    operationId: "projectsPatch",
    request: {
      params: projectIdParam,
      body: { content: { "application/json": { schema: patchProjectBody } } },
    },
    responses: {
      200: {
        description: "Updated project.",
        content: { "application/json": { schema: selectProjectSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .update(projects)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    if (!row) {
      return c.json({ error: "Project not found." }, 404);
    }
    // Same derivation as the read paths: returning the row as stored would
    // hand the caller taskCount 0 for a project full of tasks, and a card
    // rendered from this response would read as though they were deleted.
    const counts = await taskCountsFor(db, [row.id]);
    return c.json(withTaskCount(row, counts), 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /{id}
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Projects"],
    summary: "Delete project",
    operationId: "projectsDelete",
    request: { params: projectIdParam },
    responses: {
      200: {
        description: "Deletion confirmation.",
        content: { "application/json": { schema: deleteResponseSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const result = await db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    if (result.length === 0) {
      return c.json({ error: "Project not found." }, 404);
    }
    return c.json({ ok: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/star  — toggle starred flag
// ---------------------------------------------------------------------------

projectsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/star",
    tags: ["Projects"],
    summary: "Toggle project starred flag",
    operationId: "projectsToggleStar",
    request: { params: projectIdParam },
    responses: {
      200: {
        description: "New starred state.",
        content: { "application/json": { schema: starResponseSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    // Read current value then flip
    const [current] = await db
      .select({ starred: projects.starred })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!current) {
      return c.json({ error: "Project not found." }, 404);
    }
    const [updated] = await db
      .update(projects)
      .set({ starred: !current.starred, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id, starred: projects.starred });
    return c.json(updated!, 200);
  },
);
