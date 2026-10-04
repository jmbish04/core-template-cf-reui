/**
 * @fileoverview Secret + signing-key helpers for the template.
 *
 * Reads values from the Secrets Store bindings declared in `wrangler.jsonc`
 * (which expose an async `.get()`), falling back to plain env vars for local
 * development. Domain-specific helpers (Google service accounts, R2 access
 * keys, third-party integrations) were removed when this repo was slimmed to
 * a template — add your own as you wire new integrations.
 */
import { deriveSessionSigningKey } from "@/shared/session-key";

/**
 * Generic helper to read a secret value by binding name.
 *
 * Precedence:
 * 1. Secrets Store / Secret binding (async `.get()`)
 * 2. Plain env var (string) — local/dev fallback
 */
export async function getSecret(env: Env, key: string): Promise<string | undefined> {
  const envVal = (env as Record<string, any>)[key];
  if (envVal && typeof envVal?.get === "function") {
    return await envVal.get();
  }
  return envVal;
}

/**
 * Fetch the WORKER_API_KEY (used for the single-user login + GitHub webhook
 * signature verification).
 */
export async function getWorkerApiKey(env: Env): Promise<string | undefined> {
  if (env.WORKER_API_KEY) {
    return typeof env.WORKER_API_KEY === "string"
      ? env.WORKER_API_KEY
      : await (env.WORKER_API_KEY as any).get();
  }
  return getSecret(env, "WORKER_API_KEY");
}

/** Fetch the Cloudflare API token (Wrangler / provisioning operations). */
export async function getCloudflareApiToken(env: Env): Promise<string | undefined> {
  if (env.CLOUDFLARE_WRANGLER_API_TOKEN) {
    return typeof env.CLOUDFLARE_WRANGLER_API_TOKEN === "string"
      ? env.CLOUDFLARE_WRANGLER_API_TOKEN
      : await (env.CLOUDFLARE_WRANGLER_API_TOKEN as any).get();
  }
  return getSecret(env, "CLOUDFLARE_WRANGLER_API_TOKEN");
}

/** Fetch the Cloudflare account id. */
export async function getCloudflareAccountId(env: Env): Promise<string | undefined> {
  if (env.CLOUDFLARE_ACCOUNT_ID) {
    return typeof env.CLOUDFLARE_ACCOUNT_ID === "string"
      ? env.CLOUDFLARE_ACCOUNT_ID
      : await (env.CLOUDFLARE_ACCOUNT_ID as any).get();
  }
  return getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
}

/**
 * HMAC key used to sign the session cookie.
 *
 * Derived from `WORKER_API_KEY`, never stored. The previous implementation
 * kept a random UUID in the `SESSIONS` KV namespace and re-minted it whenever
 * the read returned null — which, KV being eventually consistent, is a routine
 * outcome — silently invalidating every live cookie each time. See
 * `src/shared/session-key.ts` for the full account.
 *
 * @param env The Worker env.
 * @returns The HMAC key, stable across colos and redeploys.
 * @throws {Error} when `WORKER_API_KEY` cannot be resolved. There is no
 *   fallback by design: signing with a placeholder produces a cookie that can
 *   never be verified.
 */
export async function getCookieSigningKey(env: Env): Promise<string> {
  return deriveSessionSigningKey(await getWorkerApiKey(env));
}

/**
 * GitHub webhook secret. Maps to WORKER_API_KEY in this template.
 */
export async function getGitHubWebhookSecret(env: Env): Promise<string> {
  const secret = await getWorkerApiKey(env);
  if (!secret) {
    throw new Error("Missing WORKER_API_KEY in Secrets Store");
  }
  return secret;
}
