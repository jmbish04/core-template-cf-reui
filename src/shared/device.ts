/**
 * Device-surface resolution — which of a page's three variants to render.
 *
 * Every page in this template ships `*.mobile.tsx`, `*.tablet.tsx` and
 * `*.desktop.tsx`, and exactly one of them is rendered. This module decides
 * which, on the SERVER, before anything is sent — a client-side media query
 * would ship all three and flash the wrong one first.
 *
 * Two inputs, in this order:
 *
 *   1. The `device_surface` cookie. An explicit choice from the app-shell
 *      selector. It always wins, and it is deliberately long-lived.
 *   2. The `User-Agent` header. The default when nobody has chosen.
 *
 * Isomorphic on purpose: the Worker reads it to route, and the React shell
 * reads it to render the selector's active state. No DOM, no `env`.
 *
 * @module
 */

/** The three surfaces every page provides. */
export type DeviceSurface = "mobile" | "tablet" | "desktop";

/** Every surface, in the order the app-shell selector shows them. */
export const DEVICE_SURFACES: readonly DeviceSurface[] = ["mobile", "tablet", "desktop"];

/** The cookie holding an explicit operator choice. */
export const DEVICE_COOKIE = "device_surface";

/**
 * 400 days in seconds — the ceiling browsers honour for a cookie lifetime
 * (RFC 6265bis; Chrome clamps anything longer). The choice should outlive the
 * session, so this is the longest it is allowed to live.
 */
export const DEVICE_COOKIE_MAX_AGE = 34_560_000;

/**
 * Tesla's in-car browser.
 *
 * Two generations, two signals. The Model 3/Y Chromium browser appends a
 * `Tesla/<version>` token; the older Model S/X browser identifies as
 * `QtCarBrowser` and carries no Tesla token at all. Neither reports as a
 * tablet by any other means — both look like desktop Linux — which is exactly
 * why this check exists.
 *
 * @param userAgent A raw User-Agent header value.
 * @returns true when the request came from a Tesla.
 * @example
 * isTeslaBrowser("Mozilla/5.0 (X11; GNU/Linux) ... Safari/537.36 Tesla/2023.44.30.5"); // true
 */
export function isTeslaBrowser(userAgent: string): boolean {
  const ua = userAgent || "";
  return /\bTesla\//i.test(ua) || /QtCarBrowser/i.test(ua);
}

/**
 * Classify a User-Agent into one of the three surfaces.
 *
 * The order matters and is not arbitrary:
 *
 *   - Tesla first, because a Tesla looks like desktop Linux to every other
 *     rule and the car screen is the tablet case this template is built for.
 *   - Tablets before phones, because some tablets satisfy BOTH rules. A Kindle
 *     Fire sends `Android … Mobile` and the word `Kindle`; whichever rule is
 *     tested first wins, so phone-first silently gives a 7-inch tablet the
 *     375px phone layout. (The Android-without-`Mobile` case is order-
 *     independent — it is the Kindle shape that makes this load-bearing.)
 *   - Desktop is the fallback, never a positive match. An unknown agent gets
 *     the most capable layout rather than the most cramped one.
 *
 * KNOWN CEILING: iPadOS 13+ Safari requests desktop sites by default and sends
 * a Macintosh UA with no iPad token. It is indistinguishable from a Mac
 * server-side, so it lands on `desktop`. That is the operator's cue to use the
 * app-shell selector, which is why the selector exists at all.
 *
 * @param userAgent A raw User-Agent header value. Missing or empty is desktop.
 * @returns The detected surface.
 */
export function detectDeviceSurface(userAgent: string | null | undefined): DeviceSurface {
  const ua = (userAgent || "").trim();
  if (!ua) return "desktop";

  if (isTeslaBrowser(ua)) return "tablet";

  // Explicit tablet tokens, plus Android without the phone-only `Mobile` token.
  if (/\biPad\b/i.test(ua)) return "tablet";
  if (/\bTablet\b|\bPlayBook\b|\bKindle\b|\bSilk\b|\bNexus (?:7|9|10)\b/i.test(ua)) return "tablet";
  if (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua)) return "tablet";

  if (
    /\biPhone\b|\biPod\b|\bAndroid\b.*\bMobile\b|\bWindows Phone\b|\bBlackBerry\b|\bBB10\b|\bOpera Mini\b|\bIEMobile\b/i.test(
      ua,
    )
  ) {
    return "mobile";
  }

  return "desktop";
}

/**
 * Narrow an untrusted string to a surface.
 *
 * The cookie is operator-supplied and therefore arbitrary. A value that is not
 * one of the three is not a surface, and must not be rendered as one.
 *
 * @param value Any string, typically a cookie value.
 * @returns The surface, or null when the value is not one.
 */
export function parseDeviceSurface(value: string | null | undefined): DeviceSurface | null {
  const candidate = (value || "").trim().toLowerCase();
  return (DEVICE_SURFACES as readonly string[]).includes(candidate)
    ? (candidate as DeviceSurface)
    : null;
}

/** What `resolveDeviceSurface` concluded, and why. */
export interface ResolvedDevice {
  /** The surface to render. */
  surface: DeviceSurface;
  /** What the User-Agent alone says — what the selector would revert to. */
  detected: DeviceSurface;
  /** Where `surface` came from. */
  source: "cookie" | "user-agent";
  /** True when the operator has overridden the detected surface. */
  isOverride: boolean;
}

/**
 * Resolve the surface for one request.
 *
 * @param input
 * @param input.userAgent The request's User-Agent header.
 * @param input.cookie The `device_surface` cookie value, if present.
 * @returns The surface, the detected default, and which one won.
 * @example
 * resolveDeviceSurface({ userAgent: teslaUa, cookie: "desktop" });
 * // { surface: "desktop", detected: "tablet", source: "cookie", isOverride: true }
 */
export function resolveDeviceSurface(input: {
  userAgent?: string | null;
  cookie?: string | null;
}): ResolvedDevice {
  const detected = detectDeviceSurface(input.userAgent);
  const chosen = parseDeviceSurface(input.cookie);
  if (!chosen) return { surface: detected, detected, source: "user-agent", isOverride: false };
  return { surface: chosen, detected, source: "cookie", isOverride: chosen !== detected };
}

/** The attributes the device cookie is always written with. */
export const DEVICE_COOKIE_ATTRS = {
  path: "/",
  maxAge: DEVICE_COOKIE_MAX_AGE,
  sameSite: "lax",
  httpOnly: false,
  secure: true,
} as const;
