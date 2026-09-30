/**
 * @fileoverview Wire types for the settings APIs, mirroring the Drizzle rows
 * in `src/backend/db/schemas/settings/**` as they arrive over JSON.
 *
 * Timestamps cross the wire as epoch numbers (D1 stores them as integers), so
 * they are typed `number | null` rather than `Date`.
 */

/** One row of `GET|PUT /api/settings/preferences` (always id `"default"`). */
export interface Preferences {
  id: string;
  theme: string;
  accentColor: string;
  fontSize: string;
  density: string;
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: string;
  animations: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  screenReader: boolean;
  keyboardShortcuts: boolean;
  updatedAt: number | string;
}

/** Delivery channels in `notification_prefs.channel`. */
export const NOTIFICATION_CHANNELS = ["in_app", "email", "push", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Event categories in `notification_prefs.category`. */
export const NOTIFICATION_CATEGORIES = ["tasks", "mentions", "projects", "system", "billing"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** One row of `GET|PUT /api/settings/notification-prefs`. */
export interface NotificationPref {
  id: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  enabled: boolean;
  updatedAt: number | string;
}

/** One row of the `/api/webhooks` collection. */
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
  lastStatus: string | null;
  lastTriggeredAt: number | null;
  createdAt: number | string;
}

/** One check inside a `/api/health` run. */
export interface HealthResult {
  id: string;
  runId: string;
  category: string;
  name: string;
  status: "ok" | "warn" | "fail" | "skipped" | "timeout";
  message?: string | null;
  durationMs: number;
  timestamp: string | number;
}

/** The envelope `/api/health` and `/api/health/run` return. */
export interface HealthResponse {
  run: {
    id: string;
    status: string;
    trigger: string;
    durationMs: number;
    createdAt: string | number;
  } | null;
  results: HealthResult[];
}

/** Human labels for the notification channels, in display order. */
export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "In-app",
  email: "Email",
  push: "Push",
  sms: "SMS",
};

/** Human labels + one line of copy for each notification category. */
export const CATEGORY_COPY: Record<NotificationCategory, { label: string; description: string }> = {
  tasks: { label: "Tasks", description: "Assignments, status changes and due dates." },
  mentions: { label: "Mentions", description: "Someone names you in a note or comment." },
  projects: { label: "Projects", description: "Project created, archived or reopened." },
  system: { label: "System", description: "Deploys, health checks and maintenance." },
  billing: { label: "Billing", description: "Invoices, receipts and plan changes." },
};
