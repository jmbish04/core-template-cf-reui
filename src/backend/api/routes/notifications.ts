/**
 * @fileoverview Notifications REST API router.
 *
 * Plain D1 CRUD against the `notifications` table — no Durable Object, no
 * WebSocket fanout. This template dropped the `NotificationsAgent` realtime
 * broker; the frontend now polls/refetches instead of subscribing.
 *
 * Mount this router at `/api/notifications` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /           – list notifications, newest first
 *   POST   /           – create notification
 *   POST   /{id}/read  – mark one notification read
 *   POST   /read-all   – mark all notifications read
 *   DELETE /           – clear all notifications
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import { notifications, type Notification } from "../../db/schemas/notifications/notifications";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

/** Wire-format notification item (createdAt is epoch millis, not a Date). */
const notificationItemSchema = z.object({
  id: z.string(),
  type: z.enum(["info", "success", "warning", "error", "mention", "system"]),
  title: z.string(),
  body: z.string().nullable(),
  severity: z.string(),
  read: z.boolean(),
  actor: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  href: z.string().nullable(),
  createdAt: z.number().openapi({ description: "Unix epoch milliseconds." }),
});

const addNotificationBody = z.object({
  type: z
    .enum(["info", "success", "warning", "error", "mention", "system"])
    .optional()
    .openapi({ description: "Notification kind (default: info)." }),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  severity: z.string().optional(),
  actor: z.string().nullable().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
});

const notifIdParam = z.object({ id: z.string().min(1) });

const okResponseSchema = z.object({ ok: z.boolean() });

/** Feed cap — mirrors the old hot-cache limit so behaviour doesn't change. */
const FEED_LIMIT = 50;

/** Normalize a D1 row into the wire-friendly shape (createdAt as epoch ms). */
function toItem(row: Notification) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    severity: row.severity,
    read: row.read,
    actor: row.actor ?? null,
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    href: row.href ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const notificationsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Notifications"],
    summary: "List notifications, newest first",
    operationId: "notificationsList",
    responses: {
      200: {
        description: "Notification feed (newest first).",
        content: { "application/json": { schema: z.array(notificationItemSchema) } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(FEED_LIMIT);
    return c.json(rows.map(toItem), 200);
  },
);

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Notifications"],
    summary: "Create a notification",
    operationId: "notificationsCreate",
    request: {
      body: { content: { "application/json": { schema: addNotificationBody } } },
    },
    responses: {
      201: {
        description: "Created notification item.",
        content: { "application/json": { schema: notificationItemSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .insert(notifications)
      .values({
        type: body.type ?? "info",
        title: body.title,
        body: body.body ?? null,
        severity: body.severity ?? body.type ?? "info",
        actor: body.actor ?? null,
        entityType: body.entityType ?? null,
        entityId: body.entityId ?? null,
        href: body.href ?? null,
      })
      .returning();
    return c.json(toItem(row!), 201);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/read
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/read",
    tags: ["Notifications"],
    summary: "Mark a single notification as read",
    operationId: "notificationsMarkRead",
    request: { params: notifIdParam },
    responses: {
      200: {
        description: "Read acknowledgement.",
        content: { "application/json": { schema: okResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    return c.json({ ok: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /read-all
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "post",
    path: "/read-all",
    tags: ["Notifications"],
    summary: "Mark all notifications as read",
    operationId: "notificationsMarkAllRead",
    responses: {
      200: {
        description: "All-read acknowledgement.",
        content: { "application/json": { schema: okResponseSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    await db.update(notifications).set({ read: true });
    return c.json({ ok: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/",
    tags: ["Notifications"],
    summary: "Clear all notifications",
    operationId: "notificationsClearAll",
    responses: {
      200: {
        description: "Clear acknowledgement.",
        content: { "application/json": { schema: okResponseSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    await db.delete(notifications);
    return c.json({ ok: true }, 200);
  },
);
