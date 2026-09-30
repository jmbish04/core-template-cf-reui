// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const site = process.env.SITE ?? "http://localhost:4321";
const base = process.env.BASE || "/";

// https://astro.build/config
export default defineConfig({
  site,
  srcDir: "./src/frontend",
  base,
  output: "server",
  // Use the project's existing `SESSIONS` KV binding for Astro's session
  // store. By default the adapter looks for a `SESSION` binding; pointing
  // the driver at the explicit binding name avoids the "Invalid binding
  // `SESSION`" warning on build and lets the auth middleware and Astro
  // share one namespace.
  session: {
    driver: "cloudflare-kv-binding",
    options: { binding: "SESSIONS" },
  },
  adapter: cloudflare({
    imageService: "cloudflare",
    // Without this the adapter also injects a `SESSION` KV binding into the
    // built wrangler.json, which wrangler would auto-provision as a new namespace.
    sessionKVBindingName: "SESSIONS",
    // `ai` is remote-only. Set CF_REMOTE_BINDINGS=0 to run the UI locally when a
    // remote preview session can't be created (AI calls then fail, pages still render).
    remoteBindings: process.env.CF_REMOTE_BINDINGS !== "0",
    // The Worker entry (Hono API + Astro SSR + email handler) is `main` in
    // wrangler.jsonc -> src/_worker.ts. Adapter 13+ dropped `workerEntryPoint`
    // and `routes`; `main` is the only way to set the entry now.
  }),
  integrations: [react()],
  vite: {
    plugins: [
      // Cast through the Vite plugin type to work around the current
      // Vite/@tailwindcss-vite HotUpdateOptions mismatch without dropping
      // type information entirely.
      tailwindcss() as unknown as import("vite").Plugin,
    ],
    // Explicitly externalize node built-in modules and Cloudflare-specific packages for SSR
    ssr: {
      external: [
        "node:fs/promises",
        "node:path",
        "node:url",
        "node:crypto",
        "node:buffer",
        "node:stream",
        "node:util",
        "agents",
        "cloudflare:workers",
      ],
    },
  },
});
