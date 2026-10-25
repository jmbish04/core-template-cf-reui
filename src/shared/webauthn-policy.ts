/**
 * @fileoverview The decisions behind passkey sign-in, as pure functions.
 *
 * The cryptography is @simplewebauthn/server's job and is not reimplemented
 * here. What IS here is everything around it that a WebAuthn integration
 * actually gets wrong: which relying party the ceremony is pinned to, how long
 * a challenge lives, whether a challenge issued for registration may be spent
 * on an authentication, and the state machine for the cross-device handoff —
 * which is a bearer token displayed as a QR code on a screen other people can
 * photograph.
 *
 * All of it is pure and this module has NO imports, so a plain-Node self-check
 * can exercise it directly. A rule that only runs inside a Worker is a rule
 * nobody tests.
 *
 * @module
 */

/** How long a WebAuthn challenge is accepted. Long enough for a slow fingerprint reader, short enough that a captured one is useless. */
export const CHALLENGE_TTL_SECONDS = 300;

/**
 * How long a cross-device handoff is accepted.
 *
 * Deliberately far shorter than a challenge: the handoff token is rendered as
 * a QR code on a car screen, so its threat model is "somebody in the next lane
 * photographs it", not "somebody intercepts the network".
 */
export const HANDOFF_TTL_SECONDS = 120;

/** Bytes of entropy in a handoff token. 32 bytes is 256 bits — it is a bearer credential, so it is not a short code. */
export const HANDOFF_TOKEN_BYTES = 32;

/** How often the waiting screen asks whether the phone has approved yet. */
export const HANDOFF_POLL_INTERVAL_MS = 2000;

/** The relying party a ceremony is pinned to. */
export interface RelyingParty {
  /** The RP ID — a bare domain, never a URL and never with a port. */
  rpID: string;
  /** What the authenticator shows the operator. */
  rpName: string;
  /** The exact origin a ceremony must have happened on, including scheme and port. */
  origin: string;
}

/**
 * Work out which relying party to pin a ceremony to.
 *
 * `WORKER_URL` wins when it is set. That matters: deriving the RP ID from the
 * incoming request alone means the relying party is whatever host routed to
 * this Worker, so a second hostname pointed at the same Worker would mint
 * passkeys that the primary hostname cannot verify — and the operator would
 * see "no passkey found" with nothing broken anywhere. The configured identity
 * is the one the deploy already derives.
 *
 * The request URL is the fallback, which is what makes `wrangler dev` on
 * localhost work without configuration.
 *
 * @param input
 * @param input.workerUrl The deploy-set `WORKER_URL`, or "" when unset.
 * @param input.workerName The deploy-set `WORKER_NAME`, used as the display name.
 * @param input.requestUrl The URL of the request being served.
 * @returns The relying party for this ceremony.
 * @throws {Error} when neither source yields a usable origin.
 * @example
 * resolveRelyingParty({ workerUrl: "https://app.example.com", workerName: "app", requestUrl: "https://app.example.com/login" });
 * // { rpID: "app.example.com", rpName: "app", origin: "https://app.example.com" }
 */
export function resolveRelyingParty(input: {
  workerUrl?: string | null;
  workerName?: string | null;
  requestUrl: string;
}): RelyingParty {
  const configured = (input.workerUrl ?? "").trim();
  const source = configured || input.requestUrl;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`Cannot derive a WebAuthn relying party from ${JSON.stringify(source)}.`);
  }

  return {
    // The RP ID is a DOMAIN. A port or a scheme here makes every ceremony fail
    // with an opaque browser error rather than a useful one.
    rpID: url.hostname,
    rpName: (input.workerName ?? "").trim() || url.hostname,
    origin: url.origin,
  };
}

/** A stored challenge, as the policy needs to see it. */
export interface StoredChallenge {
  kind: "registration" | "authentication";
  /** Unix seconds. */
  expiresAt: number;
}

/** Why a challenge was refused, or null when it is good. */
export type ChallengeRefusal = "unknown" | "expired" | "wrong-kind";

/**
 * Decide whether a stored challenge may be spent on this ceremony.
 *
 * @param stored The row, or null/undefined when no row matched — which is also
 *   what a REPLAY looks like, because a spent challenge is deleted.
 * @param expectedKind The ceremony being attempted.
 * @param nowSeconds Unix seconds.
 * @returns null when the challenge is good, otherwise the reason it is refused.
 */
export function refuseChallenge(
  stored: StoredChallenge | null | undefined,
  expectedKind: StoredChallenge["kind"],
  nowSeconds: number,
): ChallengeRefusal | null {
  // A spent challenge is deleted, so "no row" and "already used" are the same
  // observation. Both must be refused, and neither may be distinguished to the
  // caller.
  if (!stored) return "unknown";
  // A challenge issued to register a NEW passkey must never be spendable as
  // proof of an authentication, or the two ceremonies collapse into one.
  if (stored.kind !== expectedKind) return "wrong-kind";
  if (stored.expiresAt <= nowSeconds) return "expired";
  return null;
}

/** A handoff row, as the policy needs to see it. */
export interface StoredHandoff {
  status: "pending" | "approved" | "consumed" | "expired";
  /** Unix seconds. */
  expiresAt: number;
}

/** Why a handoff action was refused, or null when it is allowed. */
export type HandoffRefusal =
  | "unknown"
  | "expired"
  | "already-approved"
  | "already-consumed"
  | "not-approved";

/**
 * Decide whether the PHONE may approve this handoff.
 *
 * @param stored The row, or null when the token matched nothing.
 * @param nowSeconds Unix seconds.
 * @returns null when the approval may proceed, otherwise the refusal.
 */
export function refuseHandoffApproval(
  stored: StoredHandoff | null | undefined,
  nowSeconds: number,
): HandoffRefusal | null {
  if (!stored) return "unknown";
  if (stored.status === "consumed") return "already-consumed";
  if (stored.status === "approved") return "already-approved";
  // Checked AFTER the status cases on purpose: an expired row that was already
  // consumed should report the consumption, which is the more serious fact.
  if (stored.status === "expired" || stored.expiresAt <= nowSeconds) return "expired";
  return null;
}

/**
 * Decide whether the WAITING SCREEN may exchange this handoff for a session.
 *
 * @param stored The row, or null when the token matched nothing.
 * @param nowSeconds Unix seconds.
 * @returns null when the exchange may proceed, otherwise the refusal.
 */
export function refuseHandoffConsumption(
  stored: StoredHandoff | null | undefined,
  nowSeconds: number,
): HandoffRefusal | null {
  if (!stored) return "unknown";
  // Single use. A second exchange of an approved handoff is the replay this
  // whole state machine exists to refuse.
  if (stored.status === "consumed") return "already-consumed";
  if (stored.status === "expired" || stored.expiresAt <= nowSeconds) return "expired";
  // Pending means the phone has not finished. Not an error — just not yet.
  if (stored.status !== "approved") return "not-approved";
  return null;
}

/**
 * The sign-in method a device can actually complete.
 *
 * `qr` is not a worse passkey, it is the only passkey a screen with no
 * authenticator can reach. The Tesla browser is the case this template is
 * built for: it has no platform authenticator and no way to pick a security
 * key, so offering it the normal ceremony offers it a dead end.
 */
export type SignInMethod = "passkey" | "qr";

/**
 * Choose the sign-in method to OFFER FIRST.
 *
 * @param input
 * @param input.isTesla Whether the device classifies as a Tesla browser.
 * @param input.hasPlatformAuthenticator What the browser reported, or null
 *   when it has not been asked yet (server-side render).
 * @returns The method to show first. The other remains reachable — this picks
 *   the default, it does not remove a choice.
 */
export function preferredSignInMethod(input: {
  isTesla: boolean;
  hasPlatformAuthenticator: boolean | null;
}): SignInMethod {
  if (input.isTesla) return "qr";
  // Unknown is NOT treated as absent. Server-side we have not asked yet, and
  // defaulting to the QR flow there would send every normal browser down the
  // cross-device path for no reason.
  if (input.hasPlatformAuthenticator === false) return "qr";
  return "passkey";
}
