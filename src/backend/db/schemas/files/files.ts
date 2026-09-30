/**
 * @fileoverview Drizzle schema for the `files` D1 table — the metadata index
 * behind the `/files` Drive Explorer (ReUI block `solution-files-1`).
 *
 * D1 holds the *tree* (folders, names, sizes, owners, timestamps); the bytes
 * live in the `R2_FILES_BUCKET` R2 bucket under `r2_key`. A folder row has
 * `kind = 'folder'`, no `r2_key` and no `size`; a file row always has both.
 *
 * The tree is self-referential: `parent_id` is null for a root entry and
 * otherwise points at a `kind = 'folder'` row. Deleting a folder cascades to
 * its children in D1 — the route layer is responsible for deleting the
 * matching R2 objects, because R2 has no foreign keys.
 */

import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/** Human-readable description of the `files` table for the docs UI. */
export const FILES_TABLE_DESCRIPTION =
  "Folder/file tree behind the /files Drive Explorer. Bytes live in the R2_FILES_BUCKET R2 bucket keyed by r2_key; this table is the browsable index.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const FILES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Entry id (UUID).",
  parent_id: "Owning folder id, or null at the root. Cascade-deletes children.",
  kind: "'folder' or 'file'.",
  name: "Display name including extension for files.",
  mime_type: "MIME type for files; null for folders.",
  size: "Size in bytes for files; null for folders.",
  r2_key: "Object key inside R2_FILES_BUCKET for files; null for folders.",
  owner: "Display name of the uploader/owner.",
  starred: "Boolean (0/1). Starred entries surface in the Starred scope.",
  created_at: "Unix timestamp (seconds) the entry was created.",
  updated_at: "Unix timestamp (seconds) of the last rename/move/replace.",
};

export const files = sqliteTable(
  "files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    parentId: text("parent_id"),
    kind: text("kind", { enum: ["folder", "file"] }).notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    size: integer("size"),
    r2Key: text("r2_key"),
    owner: text("owner").notNull().default("You"),
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("files_parent_idx").on(t.parentId)],
);

export const filesRelations = relations(files, ({ one, many }) => ({
  parent: one(files, { fields: [files.parentId], references: [files.id], relationName: "folder" }),
  children: many(files, { relationName: "folder" }),
}));

export const insertFileSchema = createInsertSchema(files);
export const selectFileSchema = createSelectSchema(files);
export type FileEntry = typeof files.$inferSelect;
export type NewFileEntry = typeof files.$inferInsert;
