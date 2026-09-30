/**
 * @fileoverview Wire types for `/api/inbox`, mirroring the `email_messages`
 * Drizzle row as it arrives over JSON.
 *
 * `receivedAt` is an integer timestamp in D1, so it crosses the wire as a
 * number (or an ISO string, depending on the serializer) — never a `Date`.
 */

/** Folder buckets in `email_messages.folder`. */
export type EmailFolder = "inbox" | "archive" | "spam";

/** One row of `email_messages`. */
export interface EmailMessage {
  id: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  snippet: string;
  folder: EmailFolder;
  labels: string[];
  read: boolean;
  starred: boolean;
  receivedAt: number | string;
  rawSize: number;
}

/** The envelope `GET /api/inbox` returns. */
export interface InboxListResponse {
  data: EmailMessage[];
  total: number;
  limit: number;
  offset: number;
  /** Unread count in the inbox folder, regardless of the current filter. */
  unread: number;
}
