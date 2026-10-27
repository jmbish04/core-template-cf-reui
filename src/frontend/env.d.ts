/// <reference types="astro/client" />

import type { ResolvedDevice } from "@/shared/device";

declare global {
  namespace App {
    interface Locals {
      /**
       * Which of a page's three variants to render, resolved by
       * `src/frontend/middleware.ts` from the cookie and the User-Agent.
       */
      device: ResolvedDevice;
    }
  }
}

export {};
