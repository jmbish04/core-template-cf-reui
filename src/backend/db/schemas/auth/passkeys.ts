/**
 * @fileoverview WebAuthn passkey tables — credentials, challenges, and the
 * cross-device handoff used by browsers that cannot run an authenticator.
 *
 * This template has ONE operator, so there is no `users` table and no user
 * handle to disambiguate: a passkey is registered against a fixed subject and
 * every credential row is that same person's. What varies is the DEVICE.
 *
 * @module
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/** Human-readable description of `passkey_credentials` for the docs UI. */
export const PASSKEY_CREDENTIALS_TABLE_DESCRIPTION =
  "Registered WebAuthn passkeys. One row per device or password manager the operator has enrolled. There is no users table: every row belongs to the single operator, and what distinguishes them is the authenticator.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const PASSKEY_CREDENTIALS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  credential_id:
    "The authenticator's credential ID, base64url. Unique; this is what an assertion arrives carrying.",
  public_key: "The COSE public key, base64url. Used to verify every later assertion.",
  counter:
    "The authenticator's signature counter. A value that fails to advance is the signal for a cloned authenticator.",
  transports:
    "Comma-separated transport hints (usb, nfc, ble, internal, hybrid) the browser reported at registration.",
  device_type:
    "singleDevice or multiDevice — whether the credential is backed up to a password manager and will appear on other devices.",
  backed_up: "Whether the authenticator reported the credential as backed up at registration.",
  label:
    "Operator-facing name for this passkey, so one device can be revoked without guessing which row it is.",
  created_at: "Unix timestamp (seconds) when the passkey was registered.",
  last_used_at:
    "Unix timestamp (seconds) of the most recent successful assertion. Null until first use.",
};

export const passkeyCredentials = sqliteTable("passkey_credentials", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports"),
  deviceType: text("device_type"),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
  label: text("label"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/** Human-readable description of `passkey_challenges` for the docs UI. */
export const PASSKEY_CHALLENGES_TABLE_DESCRIPTION =
  "Single-use WebAuthn challenges. A challenge is issued, spent once, and never accepted again: replaying one is the attack this table exists to refuse. Rows are deleted on use and swept on expiry, so the table does not grow.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const PASSKEY_CHALLENGES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  challenge: "The random challenge, base64url, as sent to the authenticator.",
  kind: "registration or authentication. A challenge issued for one must never be accepted for the other.",
  created_at: "Unix timestamp (seconds) when the challenge was issued.",
  expires_at:
    "Unix timestamp (seconds) after which the challenge is refused regardless of whether it was used.",
};

export const passkeyChallenges = sqliteTable("passkey_challenges", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  challenge: text("challenge").notNull().unique(),
  kind: text("kind", { enum: ["registration", "authentication"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// Cross-device handoff
// ---------------------------------------------------------------------------

/** Human-readable description of `passkey_handoffs` for the docs UI. */
export const PASSKEY_HANDOFFS_TABLE_DESCRIPTION =
  "Cross-device sign-in handoffs. A browser with no usable authenticator — the Tesla in-car browser is the case this template targets — shows a QR code encoding one of these rows. The phone opens it, completes the passkey ceremony, and the waiting screen polls this row until it is approved.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const PASSKEY_HANDOFFS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key. Never put in the QR code — see token.",
  token:
    "The high-entropy secret encoded in the QR code. This is a bearer credential for one sign-in, so it is random, single-use and short-lived.",
  status:
    "pending, approved, consumed, or expired. Only an approved row can be exchanged for a session, and only once.",
  origin_user_agent:
    "The User-Agent of the screen that asked for the handoff, recorded so an approval can be shown with the device it will sign in.",
  created_at: "Unix timestamp (seconds) when the handoff was requested.",
  expires_at:
    "Unix timestamp (seconds) after which the handoff is refused. Deliberately short: this is a bearer token on a screen anyone nearby can photograph.",
  approved_at:
    "Unix timestamp (seconds) when the phone completed the passkey ceremony. Null until then.",
  consumed_at:
    "Unix timestamp (seconds) when the waiting screen exchanged it for a session. Null until then; a second exchange is refused.",
  credential_id: "The passkey that approved it, for the audit trail.",
};

export const passkeyHandoffs = sqliteTable("passkey_handoffs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  token: text("token").notNull().unique(),
  status: text("status", { enum: ["pending", "approved", "consumed", "expired"] })
    .notNull()
    .default("pending"),
  originUserAgent: text("origin_user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  consumedAt: integer("consumed_at", { mode: "timestamp" }),
  credentialId: text("credential_id"),
});

export const insertPasskeyCredentialSchema = createInsertSchema(passkeyCredentials);
export const selectPasskeyCredentialSchema = createSelectSchema(passkeyCredentials);
export type PasskeyCredential = typeof passkeyCredentials.$inferSelect;
export type NewPasskeyCredential = typeof passkeyCredentials.$inferInsert;

export const selectPasskeyHandoffSchema = createSelectSchema(passkeyHandoffs);
export type PasskeyHandoff = typeof passkeyHandoffs.$inferSelect;
