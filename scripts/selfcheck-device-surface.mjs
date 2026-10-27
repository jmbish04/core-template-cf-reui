/**
 * Runnable self-check for `src/shared/device.ts`.
 *
 *   node scripts/selfcheck-device-surface.mjs
 *
 * Every User-Agent below is a REAL one, because the failures this guards are
 * all "the string I imagined is not the string the device sends": an Android
 * tablet whose UA is an Android phone's minus one word, and a Tesla that looks
 * exactly like desktop Linux. A fixture of invented UAs would pass against a
 * detector that is wrong about every real device.
 *
 * Break to verify each section still fails:
 *   - Tesla: delete the isTeslaBrowser branch from detectDeviceSurface
 *   - ordering: move the phone test above the tablet tests
 *   - cookie: make parseDeviceSurface return the raw value
 *   - override: make resolveDeviceSurface always report source "user-agent"
 */
import assert from "node:assert/strict";

import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_ATTRS,
  DEVICE_COOKIE_MAX_AGE,
  DEVICE_SURFACES,
  detectDeviceSurface,
  isTeslaBrowser,
  parseDeviceSurface,
  resolveDeviceSurface,
} from "../src/shared/device.ts";

/** Real User-Agent strings, each labelled with the device that sends it. */
const UA = {
  teslaModel3:
    "Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36 Tesla/2023.44.30.5",
  teslaModelS:
    "Mozilla/5.0 (X11; Linux) AppleWebKit/534.34 (KHTML, like Gecko) QtCarBrowser Safari/534.34",
  // The control for the Tesla cases: same platform token, no Tesla marker.
  desktopLinux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  // The genuinely order-dependent one: a Kindle Fire is a TABLET whose UA
  // matches the phone rule (`Android` … `Mobile`) as well as the tablet rule.
  kindleFire:
    "Mozilla/5.0 (Linux; U; Android 2.3.4; en-us; Kindle Fire Build/GINGERBREAD) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

// --- 1. Tesla is a tablet, and desktop Linux is not -------------------------
{
  assert.equal(isTeslaBrowser(UA.teslaModel3), true, "the Chromium Tesla carries a Tesla/ token");
  assert.equal(isTeslaBrowser(UA.teslaModelS), true, "the older Tesla identifies as QtCarBrowser");
  assert.equal(detectDeviceSurface(UA.teslaModel3), "tablet", "a Tesla gets the tablet surface");
  assert.equal(detectDeviceSurface(UA.teslaModelS), "tablet", "both Tesla generations do");

  // The assertion that makes the Tesla branch able to fail: without it, both
  // Tesla UAs land on desktop — identical to this control, which SHOULD.
  assert.equal(isTeslaBrowser(UA.desktopLinux), false, "plain desktop Linux is not a Tesla");
  assert.equal(
    detectDeviceSurface(UA.desktopLinux),
    "desktop",
    "the control must stay desktop, or the Tesla assertions prove nothing",
  );
}

// --- 2. a tablet is not swallowed by the phone rule -------------------------
{
  // The Pixel and the Galaxy Tab differ by the single word `Mobile`, which is
  // the whole reason the Android rule is written as "Android AND NOT Mobile".
  assert.equal(detectDeviceSurface(UA.androidPhone), "mobile", "Android + Mobile is a phone");
  assert.equal(
    detectDeviceSurface(UA.androidTablet),
    "tablet",
    "Android without Mobile is a tablet",
  );

  // The Kindle Fire is the case that makes RULE ORDER load-bearing rather than
  // cosmetic: its UA satisfies the phone rule (`Android` … `Mobile`) AND the
  // tablet rule (`Kindle`). Whichever is tested first wins, so testing phones
  // first silently serves a 7-inch tablet the 375px phone layout.
  assert.match(
    UA.kindleFire,
    /\bAndroid\b.*\bMobile\b/,
    "the fixture must match the phone rule, or this proves nothing",
  );
  assert.match(UA.kindleFire, /\bKindle\b/, "and the tablet rule too");
  assert.equal(
    detectDeviceSurface(UA.kindleFire),
    "tablet",
    "the tablet rule must be reached FIRST",
  );
}

// --- 3. the rest of the fleet ----------------------------------------------
{
  assert.equal(detectDeviceSurface(UA.iphone), "mobile");
  assert.equal(detectDeviceSurface(UA.ipad), "tablet");
  assert.equal(detectDeviceSurface(UA.mac), "desktop");
  assert.equal(detectDeviceSurface(UA.windows), "desktop");

  // Desktop is the FALLBACK, never a positive match: an unknown agent gets the
  // most capable layout rather than the most cramped one.
  assert.equal(detectDeviceSurface(""), "desktop", "an empty UA is desktop");
  assert.equal(detectDeviceSurface(null), "desktop", "a missing UA is desktop");
  assert.equal(detectDeviceSurface("curl/8.7.1"), "desktop", "an unknown agent is desktop");
}

// --- 4. the cookie is untrusted input ---------------------------------------
{
  assert.equal(parseDeviceSurface("tablet"), "tablet");
  assert.equal(parseDeviceSurface("  Desktop  "), "desktop", "trimmed and case-insensitive");
  for (const bad of ["", null, undefined, "phone", "tv", "../../etc/passwd", "<script>"]) {
    assert.equal(
      parseDeviceSurface(bad),
      null,
      `a non-surface must not resolve: ${JSON.stringify(bad)}`,
    );
  }
}

// --- 5. the cookie wins, and the override is visible ------------------------
{
  const noCookie = resolveDeviceSurface({ userAgent: UA.teslaModel3 });
  assert.deepEqual(
    noCookie,
    {
      surface: "tablet",
      detected: "tablet",
      source: "user-agent",
      isOverride: false,
    },
    "with no cookie, detection decides and nothing is an override",
  );

  const overridden = resolveDeviceSurface({ userAgent: UA.teslaModel3, cookie: "desktop" });
  assert.equal(overridden.surface, "desktop", "an explicit choice always wins");
  assert.equal(
    overridden.detected,
    "tablet",
    "the detected default is still reported, so it can be reverted to",
  );
  assert.equal(overridden.source, "cookie");
  assert.equal(
    overridden.isOverride,
    true,
    "choosing something other than the default IS an override",
  );

  const agreeing = resolveDeviceSurface({ userAgent: UA.teslaModel3, cookie: "tablet" });
  assert.equal(agreeing.source, "cookie", "the cookie is still the source when it agrees");
  assert.equal(agreeing.isOverride, false, "agreeing with detection is not an override");

  // Garbage in the cookie must fall back to detection, not render nothing.
  const garbage = resolveDeviceSurface({ userAgent: UA.iphone, cookie: "tv" });
  assert.equal(garbage.surface, "mobile", "an unparseable cookie falls back to detection");
  assert.equal(garbage.source, "user-agent");
}

// --- 6. the choice outlives the session -------------------------------------
{
  assert.equal(DEVICE_COOKIE, "device_surface");
  assert.equal(DEVICE_COOKIE_MAX_AGE, 34_560_000, "400 days — the ceiling browsers honour");
  assert.equal(
    DEVICE_COOKIE_ATTRS.maxAge,
    DEVICE_COOKIE_MAX_AGE,
    "the attrs must carry the same ceiling",
  );
  assert.equal(DEVICE_COOKIE_ATTRS.path, "/", "the choice applies to every page, not one route");
  assert.equal(
    DEVICE_COOKIE_ATTRS.httpOnly,
    false,
    "the selector writes this from the client; HttpOnly would make it unwritable",
  );
  assert.deepEqual(
    [...DEVICE_SURFACES],
    ["mobile", "tablet", "desktop"],
    "selector order is part of the contract",
  );
}

console.log("selfcheck-device-surface: all device-resolution assertions passed");
