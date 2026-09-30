/**
 * @fileoverview Drizzle schema for the `chat_messages` D1 table.
 *
 * Persists every chat turn (user + assistant) for a `chat_threads` row. This
 * replaces the old `ChatBroker` Durable Object's embedded SQLite message log
 * — messages now live in D1 like everything else, and every assistant turn
 * routes through the `CORE_GUARDIAN` service binding (see
 * `backend/ai/guardian/`), never a Workers AI binding directly.
 */

import { real, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

import { chatThreads } from "./threads";

export const CHAT_MESSAGES_TABLE_DESCRIPTION =
  "Chat turns (user + assistant) for a chat_threads conversation. Each assistant row records which provider/model core-guardian routed to and what it cost, for cost visibility per thread.";

export const CHAT_MESSAGES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Message id (UUID).",
  thread_id: "Owning chat_threads.id. Cascade-deletes with the thread.",
  role: "'user' | 'assistant' | 'system'.",
  content: "The message text.",
  provider: "core-guardian's chosen provider for this reply (assistant rows only).",
  model: "core-guardian's chosen model for this reply (assistant rows only).",
  cost_usd: "Cost in USD core-guardian reported for this reply (assistant rows only).",
  latency_ms: "Wall-clock milliseconds the reply took, measured server-side (assistant rows only). Persisted because latency is otherwise a stream-only fact, and every receipt went blank on reload.",
  prompt_tokens: "Prompt tokens the provider reported (assistant rows only). Null means not reported, never zero.",
  completion_tokens: "Completion tokens the provider reported (assistant rows only). Null means not reported, never zero.",
  created_at: "Unix timestamp (seconds) the message was written.",
};

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  provider: text("provider"),
  model: text("model"),
  costUsd: real("cost_usd"),
  // Latency and token counts are facts of the STREAM, not of the row — which
  // meant a reload emptied every receipt, and /chat/stage and /chat/compare
  // exist to show exactly those numbers. Persisted so a resumed conversation
  // still reports what it cost. Null means the provider did not report it;
  // never coerce to 0, which would read as a measured zero.
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const chatThreadsRelations = relations(chatThreads, ({ many }) => ({
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, { fields: [chatMessages.threadId], references: [chatThreads.id] }),
}));

export const insertChatMessageSchema = createInsertSchema(chatMessages);
export const selectChatMessageSchema = createSelectSchema(chatMessages);
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
