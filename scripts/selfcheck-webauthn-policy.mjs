/**
 * Runnable self-check for `src/shared/webauthn-policy.ts`.
 *
 *   node scripts/selfcheck-webauthn-policy.mjs
 *
 * The cryptography belongs to @simplewebauthn/server and is not retested here.
 * What IS tested is everything a WebAuthn integration gets wrong around it:
 * which relying party a ceremony is pinned to, whether a spent or wrong-kind
 * challenge is refused, and the handoff state machine — which guards a bearer
 * token rendered as a QR code on a screen other people can photograph.
 *
 * Every refusal below is asserted as a REFUSAL, never as "did not crash". The
 * failure mode for all of this is silent acceptance.
 *
 * Break to verify each section still fails:
 *   - rpID: return url.host instead of url.hostname (ports come back)
 *   - rpID: drop the WORKER_URL preference and always use the request
 *   - challenge: make refuseChallenge ignore `kind`
 *   - challenge: make an absent row pass
 *   - handoff: let an approved handoff be consumed twice
 *   - handoff: let a pending handoff be consumed
 *   - method: treat a null platform-authenticator answer as absent
 */
import assert from "node:assert/strict";

import {
  CHALLENGE_TTL_SECONDS,
  HANDOFF_TOKEN_BYTES,
  HANDOFF_TTL_SECONDS,
  preferredSignInMethod,
  refuseChallenge,
  refuseHandoffApproval,
  refuseHandoffConsumption,
  resolveRelyingParty,
} from "../src/shared/webauthn-policy.ts";

const NOW = 1_800_000_000;

// --- 1. the relying party is pinned to the CONFIGURED identity --------------
{
  const rp = resolveRelyingParty({
    workerUrl: "https://app.example.com",
    workerName: "my-worker",
    requestUrl: "https://app.example.com/login",
  });
  assert.deepEqual(rp, { rpID: "app.example.com", rpName: "my-worker", origin: "https://app.example.com" });

  // The failure this prevents: a second hostname pointed at the same Worker
  // mints passkeys the primary hostname cannot verify, and the operator just
  // sees "no passkey found" with nothing visibly broken.
  const spoofed = resolveRelyingParty({
    workerUrl: "https://app.example.com",
    workerName: "my-worker",
    requestUrl: "https://attacker.example.net/login",
  });
  assert.equal(spoofed.rpID, "app.example.com", "WORKER_URL wins over the request host");
  assert.equal(spoofed.origin, "https://app.example.com", "and over the request origin");
}

// --- 2. the RP ID is a DOMAIN — never a URL, never with a port --------------
{
  // A port in the RP ID makes every ceremony fail with an opaque browser
  // error, which is the single most common WebAuthn misconfiguration.
  const dev = resolveRelyingParty({ workerUrl: "", workerName: "", requestUrl: "http://localhost:8799/login" });
  assert.equal(dev.rpID, "localhost", "the RP ID carries no port");
  assert.equal(dev.origin, "http://localhost:8799", "but the ORIGIN keeps it, because it must match exactly");
  assert.ok(!dev.rpID.includes(":"), "no port");
  assert.ok(!dev.rpID.includes("/"), "no path");
  assert.ok(!dev.rpID.startsWith("http"), "no scheme");

  assert.equal(dev.rpName, "localhost", "with no WORKER_NAME, the hostname is the display name");
  assert.throws(
    () => resolveRelyingParty({ workerUrl: "", workerName: "", requestUrl: "not-a-url" }),
    /Cannot derive a WebAuthn relying party/,
    "an underivable relying party must throw rather than produce a broken ceremony",
  );
}

// --- 3. challenges are single-use, typed and time-boxed ---------------------
{
  const live = { kind: "authentication", expiresAt: NOW + 60 };
  assert.equal(refuseChallenge(live, "authentication", NOW), null, "a live challenge of the right kind is accepted");

  // A spent challenge is DELETED, so a replay arrives as "no row". This is the
  // replay refusal, and it must not be distinguishable from an unknown one.
  assert.equal(refuseChallenge(null, "authentication", NOW), "unknown", "a replayed (deleted) challenge is refused");
  assert.equal(refuseChallenge(undefined, "authentication", NOW), "unknown", "so is an unknown one");

  // A challenge issued to REGISTER a new passkey must never count as proof of
  // an authentication; that collapses the two ceremonies into one.
  assert.equal(
    refuseChallenge({ kind: "registration", expiresAt: NOW + 60 }, "authentication", NOW),
    "wrong-kind",
    "a registration challenge must not be spendable as an authentication",
  );
  assert.equal(
    refuseChallenge({ kind: "authentication", expiresAt: NOW + 60 }, "registration", NOW),
    "wrong-kind",
    "and not the other way round either",
  );

  assert.equal(refuseChallenge({ kind: "authentication", expiresAt: NOW }, "authentication", NOW), "expired",
    "expiry is inclusive — a challenge expiring exactly now is already gone");
  assert.equal(refuseChallenge({ kind: "authentication", expiresAt: NOW - 1 }, "authentication", NOW), "expired");
}

// --- 4. the handoff is single-use in BOTH directions ------------------------
{
  const pending = { status: "pending", expiresAt: NOW + 60 };
  const approved = { status: "approved", expiresAt: NOW + 60 };
  const consumed = { status: "consumed", expiresAt: NOW + 60 };

  // The phone's side.
  assert.equal(refuseHandoffApproval(pending, NOW), null, "the phone may approve a pending handoff");
  assert.equal(refuseHandoffApproval(approved, NOW), "already-approved", "but not twice");
  assert.equal(refuseHandoffApproval(consumed, NOW), "already-consumed", "and not one already spent");
  assert.equal(refuseHandoffApproval(null, NOW), "unknown", "a token matching nothing is refused");
  assert.equal(refuseHandoffApproval({ status: "pending", expiresAt: NOW }, NOW), "expired",
    "expiry is inclusive here too");

  // The waiting screen's side. This is the replay that matters: the QR code is
  // on a screen other people can see, so a second exchange must fail.
  assert.equal(refuseHandoffConsumption(approved, NOW), null, "an approved handoff may be exchanged once");
  assert.equal(refuseHandoffConsumption(consumed, NOW), "already-consumed", "and never a second time");
  assert.equal(refuseHandoffConsumption(pending, NOW), "not-approved", "a pending handoff is not a session");
  assert.equal(refuseHandoffConsumption(null, NOW), "unknown");
  assert.equal(refuseHandoffConsumption({ status: "approved", expiresAt: NOW - 1 }, NOW), "expired",
    "an approval that went stale is not a session either");

  // An expired row that was ALREADY consumed must report the consumption: it
  // is the more serious fact, and reporting "expired" would hide a replay.
  assert.equal(
    refuseHandoffApproval({ status: "consumed", expiresAt: NOW - 1 }, NOW),
    "already-consumed",
    "a consumed-and-expired row reports the consumption, not the expiry",
  );
}

// --- 5. the handoff is a bearer credential, so it is short and large --------
{
  assert.equal(HANDOFF_TOKEN_BYTES, 32, "256 bits — this token alone grants a sign-in");
  assert.ok(
    HANDOFF_TTL_SECONDS < CHALLENGE_TTL_SECONDS,
    "a QR code on a screen others can photograph must expire sooner than a challenge on the wire",
  );
  assert.ok(HANDOFF_TTL_SECONDS <= 300, "and in minutes, not hours");
}

// --- 6. the QR flow is offered where the normal one is a dead end ----------
{
  // Tesla has no platform authenticator and no way to choose a security key,
  // so offering it the normal ceremony offers it nothing.
  assert.equal(preferredSignInMethod({ isTesla: true, hasPlatformAuthenticator: null }), "qr");
  assert.equal(preferredSignInMethod({ isTesla: true, hasPlatformAuthenticator: true }), "qr",
    "a Tesla claiming an authenticator still gets the QR flow first");

  assert.equal(preferredSignInMethod({ isTesla: false, hasPlatformAuthenticator: true }), "passkey");
  assert.equal(preferredSignInMethod({ isTesla: false, hasPlatformAuthenticator: false }), "qr",
    "a browser that says it has no authenticator gets the cross-device path");

  // UNKNOWN is not ABSENT. Server-side the browser has not been asked yet, and
  // treating that as "no authenticator" would send every normal browser down
  // the cross-device path for no reason.
  assert.equal(
    preferredSignInMethod({ isTesla: false, hasPlatformAuthenticator: null }),
    "passkey",
    "an unasked browser is not an authenticator-less one",
  );
}

console.log("selfcheck-webauthn-policy: all passkey policy assertions passed");
