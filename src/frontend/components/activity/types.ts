/**
 * @fileoverview Wire type for `GET /api/activity`.
 *
 * Mirrors `selectActivityLogSchema` in
 * `src/backend/db/schemas/stats/activity-log.ts`. `action` and `entityType` are
 * plain text on the server (`logActivity` accepts any verb), so they are typed
 * as `string` rather than a union that would go stale the first time a route
 * logs a new verb.
 */

export interface ActivityEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  /** ISO string or epoch ms, depending on how the row serialized. */
  createdAt: string | number;
}
