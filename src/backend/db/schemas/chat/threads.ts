/**
 * @fileoverview Drizzle schema for the `chat_threads` D1 table.
 *
 * This is the **persistent thread index** for the chat surface. It stores
 * per-conversation METADATA (title, legacy `model` label, archived flag,
 * timestamps); the conversation MESSAGES live in `chat_messages` (see
 * `messages.ts`), keyed by `chat_threads.id`. There is no Durable Object
 * here — every assistant reply is generated via the `CORE_GUARDIAN` service
 * binding (see `backend/ai/guardian/`) and persisted straight to D1.
 *
 * The `/api/threads` router reads/writes this table; `/api/chat` is the
 * send/receive endpoint that also writes `chat_messages`.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `chat_threads` table for the docs UI. */
export const CHAT_THREADS_TABLE_DESCRIPTION =
  "Persistent index of chat conversations. Messages live in chat_messages, keyed by this table's id. Backs /api/threads and /api/chat.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const CHAT_THREADS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Thread id (UUID). Keys the associated chat_messages rows.",
  title: "Short conversation title. Defaults to 'New chat'; auto-generated from the first user turn.",
  model: "Legacy free-text model label. core-guardian now picks the provider/model dynamically per reply; this column is no longer validated against a fixed list.",
  parent_thread_id: "Root thread this one was forked from, or null for a root. A regenerate/edit on the branching chat surface creates a sibling thread rather than overwriting a turn, so a version survives a reload.",
  titled: "Boolean (0/1). True once the thread has a title someone chose — the model's on the first reply, or the user's rename. Guards against re-titling a thread the user deliberately named.",
  archived: "Boolean (0/1). Archived threads are hidden from the default thread list but not deleted.",
  created_at: "Unix timestamp (seconds) when the thread was created.",
  updated_at: "Unix timestamp (seconds) of the last activity (new message / rename / model change).",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const chatThreads = sqliteTable("chat_threads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull().default("New chat"),
  model: text("model"),
  // A forked thread points at the thread it branched from. Null for a root.
  // Deliberately NOT a foreign key: deleting a root must not cascade away the
  // branches taken from it, which are independent conversations.
  parentThreadId: text("parent_thread_id"),
  // Whether this thread's title is settled. Carried explicitly rather than
  // inferred by comparing the title against the placeholder: a user who
  // renames a thread to "New chat" means it, and inferring would silently
  // overwrite them on the next turn.
  titled: integer("titled", { mode: "boolean" }).notNull().default(false),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertChatThreadSchema = createInsertSchema(chatThreads);
export const selectChatThreadSchema = createSelectSchema(chatThreads);
export type ChatThread = typeof chatThreads.$inferSelect;
export type NewChatThread = typeof chatThreads.$inferInsert;
