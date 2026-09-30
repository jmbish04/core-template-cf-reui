/**
 * @fileoverview Canvas-document REST API for a chat thread.
 *
 * Backs the editable side panel on the canvas chat surfaces (`/chat/docked`,
 * `/chat/agentic`, `/chat/branching`): one PlateJS document per thread, stored
 * in `chat_documents`. The row is created lazily on first read so the UI never
 * has to special-case "no document yet".
 *
 * Mounted on the same base as `threadsRouter` (`/api/threads`); every path
 * here is a `/{id}/document` sub-resource.
 *
 * Route inventory:
 *   GET   /{id}/document        – read (creates an empty document on demand)
 *   PUT   /{id}/document        – replace title and/or body
 *   POST  /{id}/document/append – append a block of markdown to the body
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { chatDocuments, chatThreads, selectChatDocumentSchema } from "@/backend/db/schema";

const threadIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });

/**
 * A rich-text body as the editor stores it. `value` is a PlateJS document.
 * Written as a JSON string in D1; parsed/serialised at this boundary only.
 */
const richTextEnvelope = z
  .object({
    v: z.literal(1).default(1),
    format: z.literal("plate").default("plate"),
    value: z.array(z.record(z.string(), z.unknown())),
  })
  .openapi("RichTextEnvelope");

const putDocumentBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    body: z.union([richTextEnvelope, z.string()]).optional(),
  })
  .openapi("PutChatDocumentBody");

const appendDocumentBody = z
  .object({
    /** Plain text / markdown to append as new paragraphs. */
    text: z.string().min(1).max(20000),
  })
  .openapi("AppendChatDocumentBody");

/** Wire shape: `body` is decoded from its stored JSON string. */
const documentResponse = selectChatDocumentSchema
  .omit({ body: true })
  .extend({ body: richTextEnvelope })
  .openapi("ChatDocument");

export const chatDocumentsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

type Envelope = z.infer<typeof richTextEnvelope>;

/** A PlateJS document containing one paragraph per line of `text`. */
function envelopeFromText(text: string): Envelope {
  const lines = text.split("\n");
  return {
    v: 1,
    format: "plate",
    value: lines.map((line) => ({ type: "p", children: [{ text: line }] })),
  };
}

const EMPTY_ENVELOPE: Envelope = { v: 1, format: "plate", value: [{ type: "p", children: [{ text: "" }] }] };

/**
 * Decode a stored `body` column.
 *
 * Anything that is not a well-formed envelope — legacy plain text, an empty
 * column, corrupted JSON — is upgraded to one rather than surfacing as an
 * error, because the editor cannot render a half-shape.
 */
function decodeBody(stored: string): Envelope {
  if (!stored.trim()) return EMPTY_ENVELOPE;
  try {
    const parsed = richTextEnvelope.safeParse(JSON.parse(stored));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to the plain-text upgrade
  }
  return envelopeFromText(stored);
}

/** Read the thread's document, creating an empty one the first time. */
async function loadOrCreate(env: Env, threadId: string) {
  const db = getDb(env);

  const [thread] = await db
    .select({ id: chatThreads.id, title: chatThreads.title })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1);
  if (!thread) return null;

  const [existing] = await db
    .select()
    .from(chatDocuments)
    .where(eq(chatDocuments.threadId, threadId))
    .limit(1);
  if (existing) return existing;

  // `thread_id` is UNIQUE, and a canvas surface mounts more than one reader of
  // this document, so two first-loads can pass the select above together. The
  // conflict is the normal outcome of that race, not an error: ignore it and
  // read back whichever insert won.
  await db
    .insert(chatDocuments)
    .values({ threadId, title: thread.title, body: JSON.stringify(EMPTY_ENVELOPE) })
    .onConflictDoNothing({ target: chatDocuments.threadId });

  const [row] = await db
    .select()
    .from(chatDocuments)
    .where(eq(chatDocuments.threadId, threadId))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// GET /{id}/document
// ---------------------------------------------------------------------------

chatDocumentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/document",
    tags: ["Chat Threads"],
    summary: "Read the thread's canvas document (created on demand)",
    operationId: "threadsDocumentGet",
    request: { params: threadIdParam },
    responses: {
      200: {
        description: "The document.",
        content: { "application/json": { schema: documentResponse } },
      },
      404: {
        description: "Thread not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const row = await loadOrCreate(c.env, id);
    if (!row) return c.json({ error: "Thread not found." }, 404);
    return c.json({ ...row, body: decodeBody(row.body) }, 200);
  },
);

// ---------------------------------------------------------------------------
// PUT /{id}/document
// ---------------------------------------------------------------------------

chatDocumentsRouter.openapi(
  createRoute({
    method: "put",
    path: "/{id}/document",
    tags: ["Chat Threads"],
    summary: "Replace the thread's canvas document",
    operationId: "threadsDocumentPut",
    request: {
      params: threadIdParam,
      body: { content: { "application/json": { schema: putDocumentBody } } },
    },
    responses: {
      200: {
        description: "The saved document.",
        content: { "application/json": { schema: documentResponse } },
      },
      404: {
        description: "Thread not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const row = await loadOrCreate(c.env, id);
    if (!row) return c.json({ error: "Thread not found." }, 404);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.body !== undefined) {
      const envelope = typeof body.body === "string" ? envelopeFromText(body.body) : body.body;
      patch.body = JSON.stringify(envelope);
    }

    const [saved] = await getDb(c.env)
      .update(chatDocuments)
      .set(patch)
      .where(eq(chatDocuments.id, row.id))
      .returning();

    return c.json({ ...saved!, body: decodeBody(saved!.body) }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/document/append
// ---------------------------------------------------------------------------

chatDocumentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/document/append",
    tags: ["Chat Threads"],
    summary: "Append text to the thread's canvas document",
    operationId: "threadsDocumentAppend",
    request: {
      params: threadIdParam,
      body: { content: { "application/json": { schema: appendDocumentBody } } },
    },
    responses: {
      200: {
        description: "The updated document.",
        content: { "application/json": { schema: documentResponse } },
      },
      404: {
        description: "Thread not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { text } = c.req.valid("json");

    const row = await loadOrCreate(c.env, id);
    if (!row) return c.json({ error: "Thread not found." }, 404);

    const current = decodeBody(row.body);
    // An untouched document is a single empty paragraph; appending after it
    // would leave a blank first line, so drop it.
    const isEmpty =
      current.value.length === 1 &&
      JSON.stringify(current.value[0]) === JSON.stringify(EMPTY_ENVELOPE.value[0]);
    const next: Envelope = {
      v: 1,
      format: "plate",
      value: [...(isEmpty ? [] : current.value), ...envelopeFromText(text).value],
    };

    const [saved] = await getDb(c.env)
      .update(chatDocuments)
      .set({ body: JSON.stringify(next), updatedAt: new Date() })
      .where(eq(chatDocuments.id, row.id))
      .returning();

    return c.json({ ...saved!, body: decodeBody(saved!.body) }, 200);
  },
);
