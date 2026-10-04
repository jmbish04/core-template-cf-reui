/**
 * @fileoverview The session cookie's signing key and lifetime.
 *
 * WHAT WENT WRONG, so nobody reintroduces it: the signing key used to be a
 * random UUID kept in the `SESSIONS` KV namespace, minted whenever the read
 * came back null and falling back to a hardcoded literal whenever KV threw.
 *
 * Both halves silently log everybody out.
 *
 *   - KV is EVENTUALLY CONSISTENT. A read that misses — which is a normal
 *     outcome shortly after a write, and across colos — looked exactly like
 *     "no key yet", so the Worker minted a NEW one and wrote it over the old.
 *     Every cookie signed with the previous key stopped verifying, with
 *     nothing logged and nothing failing.
 *   - A transient KV error made it worse: sign and verify could run with two
 *     different keys inside one request pair, so a freshly issued cookie was
 *     invalid on the very next request.
 *
 * The key is now DERIVED from `WORKER_API_KEY`, which is stable across
 * redeploys, identical in every colo, and never read from KV. There is no
 * fallback: an unresolvable key throws rather than signing with something a
 * later request will not recognise. Rotating `WORKER_API_KEY` is then the
 * deliberate "sign every device out" lever, and the only one.
 *
 * This module has NO imports on purpose — a plain-Node self-check can only
 * import a TypeScript file whose own specifiers it can resolve.
 *
 * @module
 */

/**
 * Namespace prefix, so the HMAC key is a derivative of `WORKER_API_KEY` rather
 * than the credential itself. Bump the version suffix to invalidate every
 * session without touching the credential.
 */
export const SESSION_KEY_NAMESPACE = "cr_session_v1:";

/**
 * 400 days in seconds — the longest lifetime a browser will honour
 * (RFC 6265bis; Chrome clamps anything larger). The session is meant to last
 * as long as it possibly can, so this is that ceiling and not a round number
 * above it: a `Max-Age` of two years is silently truncated to this, which
 * makes the cookie and any longer `exp` claim inside it disagree.
 */
export const SESSION_COOKIE_MAX_AGE = 34_560_000;

/**
 * Derive the cookie-signing key from the Worker's root credential.
 *
 * @param rootKey The resolved `WORKER_API_KEY`.
 * @returns The HMAC key. Stable for a given root key, on every request, in
 *   every colo, across redeploys.
 * @throws {Error} when the root key is missing or blank. Throwing is the
 *   point: the previous code returned a placeholder instead, which produced
 *   cookies that could never be verified once the real key came back.
 * @example
 * deriveSessionSigningKey("s3cr3t"); // "cr_session_v1:s3cr3t"
 */
export function deriveSessionSigningKey(rootKey: string | null | undefined): string {
  const root = (rootKey ?? "").trim();
  if (!root) {
    throw new Error(
      "WORKER_API_KEY is not bound, so the session cookie cannot be signed. " +
        "Check the secrets_store_secrets binding in wrangler.jsonc.",
    );
  }
  return `${SESSION_KEY_NAMESPACE}${root}`;
}
