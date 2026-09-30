/**
 * @fileoverview Chat threads REST API router.
 *
 * The persistent thread index for the chat surface. Backs the frontend's
 * thread list (list / create / rename / archive / delete) and the dynamic
 * follow-up suggestions endpoint. Messages live in `chat_messages` (see
 * `messages.ts` schema); the actual chat send/receive endpoint is
 * `POST /api/chat`, mounted separately in `api/index.ts`.
 *
 * Every LLM call in this router routes through `guardianChat` — no Workers
 * AI binding, no Durable Object. `chat_threads.model` is legacy free text
 * (core-guardian picks the provider/model dynamically); it is no longer
 * validated against a fixed model list.
 *
 * Mount this router at `/api/threads` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /                – list non-archived threads, newest activity first
 *   POST   /                – create a thread → { id, ... }
 *   GET    /{id}            – get one thread
 *   PATCH  /{id}            – partial update (title / model / archived)
 *   DELETE /{id}            – hard delete
 *   POST   /followups       – generate 3 follow-up prompts from recent messages
 *   POST   /{id}/title      – generate + persist a short title
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  chatThreads,
  chatMessages,
  insertChatThreadSchema,
  selectChatThreadSchema,
  selectChatMessageSchema,
} from "../../db/schema";
import { guardianFollowups, guardianTitle } from "@/backend/ai/guardian";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const threadIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });

/** Slim create body — every field optional; server generates id + timestamps. */
const createThreadBody = insertChatThreadSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial()
  .openapi("CreateThreadBody");

/** PATCH body — title / model / parent / archived. */
const patchThreadBody = z
  .object({
    title: z.string().min(1).optional(),
    model: z.string().nullable().optional(),
    /** Root thread this one branched from; null detaches it into a root. */
    parentThreadId: z.string().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .openapi("PatchThreadBody");

const threadListResponse = z.object({ data: z.array(selectChatThreadSchema) });
const deleteResponseSchema = z.object({ ok: z.boolean() });

// ---------------------------------------------------------------------------
// Followups schemas
// ---------------------------------------------------------------------------

const followupMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const followupsBody = z
  .object({
    /** Thread id (used to resolve the thread's selected model). */
    threadId: z.string().optional(),
    /** Recent conversation turns (most-recent last). */
    messages: z.array(followupMessage).min(1),
  })
  .openapi("FollowupsBody");

const followupsResponse = z.object({ suggestions: z.array(z.string()) });

const titleBody = z
  .object({
    /** Recent conversation turns used to derive the title (most-recent last). */
    messages: z.array(followupMessage).min(1),
  })
  .openapi("TitleBody");

const titleResponse = z.object({ title: z.string() });


/**
 * Check that a thread may be used as a fork parent.
 *
 * `parent_thread_id` is deliberately not a foreign key (deleting a root must
 * not cascade away independent branches), so nothing in the database stops a
 * dangling or circular parent — this is the guard.
 *
 * Two rules, both of which the branching surface depends on:
 *  - the parent must exist, or the branch groups under a root that is in no
 *    thread list and the branch appears in no fork rail;
 *  - the parent must itself be a root, because `forkRootId` walks exactly one
 *    hop; a branch of a branch would report the wrong root.
 *
 * @param env The Worker environment.
 * @param parentThreadId The proposed parent.
 * @param selfId The thread being written, when it already exists.
 * @returns null when the parent is usable, otherwise a message to return.
 */
async function rejectBadParent(
  env: Env,
  parentThreadId: string,
  selfId?: string,
): Promise<string | null> {
  if (selfId && parentThreadId === selfId) return "A thread cannot be its own parent.";

  const [parent] = await getDb(env)
    .select({ id: chatThreads.id, parentThreadId: chatThreads.parentThreadId })
    .from(chatThreads)
    .where(eq(chatThreads.id, parentThreadId))
    .limit(1);

  if (!parent) return "Parent thread not found.";
  if (parent.parentThreadId) {
    return "A thread can only branch from a root thread, not from another branch.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const threadsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET / — list non-archived threads
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Chat Threads"],
    summary: "List chat threads",
    operationId: "threadsList",
    responses: {
      200: {
        description: "Non-archived threads, newest activity first.",
        content: { "application/json": { schema: threadListResponse } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.archived, false))
      .orderBy(desc(chatThreads.updatedAt));
    return c.json({ data: rows }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST / — create a thread
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Chat Threads"],
    summary: "Create a chat thread",
    operationId: "threadsCreate",
    request: {
      body: { content: { "application/json": { schema: createThreadBody } } },
    },
    responses: {
      201: {
        description: "Created thread.",
        content: { "application/json": { schema: selectChatThreadSchema } },
      },
      400: {
        description:
          "The parentThreadId does not exist, is this thread, or is itself a branch. " +
          "Rejected rather than written, because a dangling parent puts the branch in no " +
          "fork rail and nothing in the schema would catch it later.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    if (body.parentThreadId) {
      const rejection = await rejectBadParent(c.env, body.parentThreadId);
      if (rejection) return c.json({ error: rejection }, 400);
    }

    const now = new Date();
    const [row] = await db
      .insert(chatThreads)
      .values({
        title: body.title ?? "New chat",
        model: body.model ?? null,
        parentThreadId: body.parentThreadId ?? null,
        archived: body.archived ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return c.json(row!, 201);
  },
);

// ---------------------------------------------------------------------------
// POST /followups — dynamic follow-up suggestions
// ---------------------------------------------------------------------------
//
// Declared BEFORE GET /{id} so "/followups" is not swallowed by the id param.

threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/followups",
    tags: ["Chat Threads"],
    summary: "Generate 3 short follow-up prompts from recent messages",
    operationId: "threadsFollowups",
    request: {
      body: { content: { "application/json": { schema: followupsBody } } },
    },
    responses: {
      200: {
        description: "Up to 3 suggested next prompts (may be empty on failure).",
        content: { "application/json": { schema: followupsResponse } },
      },
    },
  }),
  async (c) => {
    const { messages } = c.req.valid("json");

    // The prompt, the context window and the parser all live in
    // `ai/guardian/followups.ts`; this route only carries the HTTP shape.
    // It never throws: follow-ups are a convenience, and a degraded router
    // must not fail the request that asked for them.
    return c.json({ suggestions: await guardianFollowups(c.env, messages) }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/title — generate + persist a short title from recent messages
// ---------------------------------------------------------------------------
//
// Declared before GET /{id} is irrelevant here (distinct path), but kept with
// the followups family. Used by the frontend adapter's `generateTitle`.

threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/title",
    tags: ["Chat Threads"],
    summary: "Generate and persist a short title for a thread",
    operationId: "threadsGenerateTitle",
    request: {
      params: threadIdParam,
      body: { content: { "application/json": { schema: titleBody } } },
    },
    responses: {
      200: {
        description: "The generated (and persisted) title.",
        content: { "application/json": { schema: titleResponse } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
      503: {
        description:
          "The router could not produce a title. The thread keeps the title it had; " +
          "this is never reported as success, because a caller that believed it would " +
          "show a title that was never written.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { messages } = c.req.valid("json");
    const db = getDb(c.env);

    const [row] = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(eq(chatThreads.id, id))
      .limit(1);
    if (!row) return c.json({ error: "Thread not found." }, 404);

    const firstUser = messages.find((m) => m.role === "user")?.content ?? messages[0]!.content;

    // The prompt lives in `ai/guardian/title.ts`. A degraded router yields
    // null, and the thread keeps whatever title it already had rather than
    // being stamped back to the placeholder.
    const generated = await guardianTitle(c.env, firstUser);
    if (!generated) {
      return c.json({ error: "Could not generate a title right now." }, 503);
    }

    await db
      .update(chatThreads)
      .set({ title: generated, titled: true, updatedAt: new Date() })
      .where(eq(chatThreads.id, id));

    const title = generated;
    return c.json({ title }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /{id} — get one thread
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Chat Threads"],
    summary: "Get a chat thread by id",
    operationId: "threadsGet",
    request: { params: threadIdParam },
    responses: {
      200: {
        description: "Thread record.",
        content: { "application/json": { schema: selectChatThreadSchema } },
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
    const [row] = await db.select().from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
    if (!row) return c.json({ error: "Thread not found." }, 404);
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}/messages — oldest first
// ---------------------------------------------------------------------------

const messagesResponse = z.object({ data: z.array(selectChatMessageSchema) });

threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/messages",
    tags: ["Chat Threads"],
    summary: "List a thread's messages, oldest first",
    operationId: "threadsMessagesList",
    request: { params: threadIdParam },
    responses: {
      200: {
        description: "Messages oldest first.",
        content: { "application/json": { schema: messagesResponse } },
      },
      404: {
        description: "Thread not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [thread] = await db.select({ id: chatThreads.id }).from(chatThreads).where(eq(chatThreads.id, id)).limit(1);
    if (!thread) return c.json({ error: "Thread not found." }, 404);
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, id))
      .orderBy(asc(chatMessages.createdAt));
    return c.json({ data: rows }, 200);
  },
);

// ---------------------------------------------------------------------------
// PATCH /{id} — partial update
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Chat Threads"],
    summary: "Update a chat thread (title / model / archived)",
    operationId: "threadsPatch",
    request: {
      params: threadIdParam,
      body: { content: { "application/json": { schema: patchThreadBody } } },
    },
    responses: {
      200: {
        description: "Updated thread.",
        content: { "application/json": { schema: selectChatThreadSchema } },
      },
      400: {
        description:
          "The parentThreadId does not exist, is this thread, or is itself a branch. " +
          "Rejected rather than written, because a dangling parent puts the branch in no " +
          "fork rail and nothing in the schema would catch it later.",
        content: { "application/json": { schema: notFoundSchema } },
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

    if (body.parentThreadId) {
      const rejection = await rejectBadParent(c.env, body.parentThreadId, id);
      if (rejection) return c.json({ error: rejection }, 400);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    // A deliberate rename settles the title, so the next turn does not
    // generate over it — including a rename back to the placeholder text.
    if (body.title !== undefined) {
      patch.title = body.title;
      patch.titled = true;
    }
    if (body.archived !== undefined) patch.archived = body.archived;
    // Model is free text; core-guardian picks the real one per request.
    if (body.model !== undefined) patch.model = body.model;
    if (body.parentThreadId !== undefined) patch.parentThreadId = body.parentThreadId;

    const [row] = await db
      .update(chatThreads)
      .set(patch)
      .where(eq(chatThreads.id, id))
      .returning();
    if (!row) return c.json({ error: "Thread not found." }, 404);
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /{id} — hard delete
// ---------------------------------------------------------------------------

threadsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    tags: ["Chat Threads"],
    summary: "Delete a chat thread",
    operationId: "threadsDelete",
    request: { params: threadIdParam },
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
      .delete(chatThreads)
      .where(eq(chatThreads.id, id))
      .returning({ id: chatThreads.id });
    if (result.length === 0) return c.json({ error: "Thread not found." }, 404);
    return c.json({ ok: true }, 200);
  },
);
