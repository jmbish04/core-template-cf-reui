/**
 * @fileoverview Drizzle schema for the `chat_documents` D1 table — the canvas
 * document that sits beside a chat thread.
 *
 * Several of the ReUI `ai-chat-*` surfaces pair the transcript with an
 * editable document (ai-chat-2's "Insert into draft", ai-chat-6's run
 * artifacts, ai-chat-9's answer documents). That document is a real, persisted
 * PlateJS value — one row per thread — so the canvas survives a reload and can
 * be edited by hand as well as appended to by the assistant.
 *
 * `body` stores the same versioned envelope the `/notes` editor uses:
 *   { v: 1, format: "plate", value: PlateValue }
 * A plain string is accepted on write and upgraded to the envelope on read,
 * so a caller that only has markdown does not need to know about PlateJS.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { chatThreads } from "./threads";

export const CHAT_DOCUMENTS_TABLE_DESCRIPTION =
  "One editable canvas document per chat thread, stored as a versioned PlateJS envelope. Backs the side-panel doc on the ai-chat canvas surfaces.";

export const CHAT_DOCUMENTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Document id (UUID).",
  thread_id: "Owning chat_threads.id — unique, one document per thread. Cascade-deletes with the thread.",
  title: "Document title shown above the canvas.",
  body: "Versioned rich-text envelope: { v, format: 'plate', value }. Legacy plain text is accepted and upgraded on read.",
  created_at: "Unix timestamp (seconds) the document was created.",
  updated_at: "Unix timestamp (seconds) of the last edit.",
};

export const chatDocuments = sqliteTable("chat_documents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  threadId: text("thread_id")
    .notNull()
    .unique()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled document"),
  body: text("body").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const chatDocumentsRelations = relations(chatDocuments, ({ one }) => ({
  thread: one(chatThreads, { fields: [chatDocuments.threadId], references: [chatThreads.id] }),
}));

export const insertChatDocumentSchema = createInsertSchema(chatDocuments);
export const selectChatDocumentSchema = createSelectSchema(chatDocuments);
export type ChatDocument = typeof chatDocuments.$inferSelect;
export type NewChatDocument = typeof chatDocuments.$inferInsert;
