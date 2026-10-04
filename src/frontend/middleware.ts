/**
 * @fileoverview Astro middleware — resolves the device surface for every page.
 *
 * This runs on the SERVER, before any HTML is produced, so a page renders
 * exactly one of its three variants. Doing it client-side would ship all three
 * and flash the wrong one.
 *
 * Only page requests reach this. `/api/*` is served by the Hono worker, which
 * never renders a surface.
 */
import { defineMiddleware } from "astro:middleware";

import { DEVICE_COOKIE, resolveDeviceSurface } from "@/shared/device";

export const onRequest = defineMiddleware((context, next) => {
  context.locals.device = resolveDeviceSurface({
    userAgent: context.request.headers.get("user-agent"),
    cookie: context.cookies.get(DEVICE_COOKIE)?.value ?? null,
  });
  return next();
});
