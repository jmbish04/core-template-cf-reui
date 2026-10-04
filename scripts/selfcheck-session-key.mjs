/**
 * Runnable self-check for the session cookie's signing key.
 *
 *   node scripts/selfcheck-session-key.mjs
 *
 * This covers a SHIPPED LOCKOUT, not a hypothetical one: the key used to be a
 * random UUID in KV, re-minted whenever the read returned null (routine, since
 * KV is eventually consistent) and replaced by a hardcoded literal whenever KV
 * threw. Both silently invalidated every live cookie, with nothing logged.
 *
 * So the assertions below are about STABILITY and REFUSAL, not about the key
 * merely existing. A check that only asserted "a key came back" was green for
 * the entire life of the bug.
 *
 * Break to verify each section still fails:
 *   - stability: make deriveSessionSigningKey return crypto.randomUUID()
 *   - refusal:   make it return "default_dev_key_fallback" instead of throwing
 *   - namespace: make it return the root key unchanged
 *   - rotation:  make it ignore its argument and return a constant
 *   - lifetime:  set SESSION_COOKIE_MAX_AGE back to two years
 */
import assert from "node:assert/strict";

import { constantTimeEqual, decodeBase64Url, encodeBase64Url, hmacSign } from "../src/backend/lib/crypto.ts";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_KEY_NAMESPACE,
  deriveSessionSigningKey,
} from "../src/shared/session-key.ts";

const ROOT = "worker-api-key-value";

// --- 1. the key is STABLE — the whole point of the fix ----------------------
{
  // The regression was that two calls could disagree. One call returning a
  // key proves nothing; only repeated calls agreeing does.
  const first = deriveSessionSigningKey(ROOT);
  const rest = Array.from({ length: 50 }, () => deriveSessionSigningKey(ROOT));
  for (const key of rest) {
    assert.equal(key, first, "every call with the same root key must return the same signing key");
  }

  // Whitespace around a secret read from a binding must not fork the key.
  assert.equal(deriveSessionSigningKey(`  ${ROOT}  `), first, "the root key is trimmed before derivation");
}

// --- 2. it REFUSES rather than falling back ---------------------------------
{
  // The old code returned "default_dev_key_fallback" here, so a transient
  // failure during signing produced a cookie that could never verify.
  for (const absent of [undefined, null, "", "   "]) {
    assert.throws(
      () => deriveSessionSigningKey(absent),
      /WORKER_API_KEY is not bound/,
      `an unresolvable root key must throw, not substitute a placeholder: ${JSON.stringify(absent)}`,
    );
  }
}

// --- 3. the HMAC key is a DERIVATIVE, never the credential itself -----------
{
  const key = deriveSessionSigningKey(ROOT);
  assert.notEqual(key, ROOT, "the raw WORKER_API_KEY must never be used as the HMAC key");
  assert.ok(key.startsWith(SESSION_KEY_NAMESPACE), "the key carries its namespace prefix");
  assert.ok(key.includes(ROOT), "and is still bound to the root credential");
}

// --- 4. a cookie survives repeated verification; rotation ends it -----------
{
  // Signed and verified with the REAL primitives the Worker uses, so this is
  // the actual round trip rather than a restatement of the derivation.
  const payload = encodeBase64Url(JSON.stringify({ sub: "single-user", iat: 1, exp: 2 ** 31 }));
  const signature = await hmacSign(deriveSessionSigningKey(ROOT), payload);

  // The lockout symptom was "works once, fails on the next page". Verify more
  // than once, re-deriving each time, exactly as separate requests would.
  for (let request = 0; request < 5; request += 1) {
    const expected = await hmacSign(deriveSessionSigningKey(ROOT), payload);
    assert.ok(
      constantTimeEqual(signature, expected),
      `a cookie signed once must still verify on request ${request + 1}`,
    );
  }

  // Rotating WORKER_API_KEY is the deliberate sign-everyone-out lever, and
  // the only one. If this passed, rotation would not revoke anything.
  const afterRotation = await hmacSign(deriveSessionSigningKey("a-different-root-key"), payload);
  assert.ok(
    !constantTimeEqual(signature, afterRotation),
    "rotating WORKER_API_KEY must invalidate every existing cookie",
  );

  assert.equal(
    JSON.parse(decodeBase64Url(payload)).sub,
    "single-user",
    "the payload round-trips through the base64url helpers",
  );
}

// --- 5. the lifetime is the real browser ceiling ----------------------------
{
  assert.equal(
    SESSION_COOKIE_MAX_AGE,
    34_560_000,
    "400 days — the longest a browser will honour (RFC 6265bis; Chrome clamps above it)",
  );
  // A larger Max-Age is not a longer session, it is a cookie whose stated
  // lifetime and whose `exp` claim disagree, because the browser truncates one
  // of them and not the other.
  assert.ok(
    SESSION_COOKIE_MAX_AGE <= 34_560_000,
    "a Max-Age above the ceiling is silently truncated and must not be set",
  );
}

console.log("selfcheck-session-key: all session-signing assertions passed");
