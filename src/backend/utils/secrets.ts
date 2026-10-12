/**
 * @fileoverview Secret + signing-key helpers for the template.
 *
 * Integrates with the dedicated `CORE_TK_CLI` service binding (Workers RPC
 * over VPC tunnel into the local tokens database), falling back to Cloudflare
 * Secrets Store bindings and plain environment variables for local development.
 *
 * Why this exists:
 * Cloudflare Secret Store accounts are strictly capped at 100 secrets total.
 * The `CORE_TK_CLI` service binding allows Workers to programmatically query
 * and resolve any secret from the master tokens catalog over a private VPC
 * tunnel without consuming scarce Secret Store quota.
 */

// ---------------------------------------------------------------------------
// CoreTkCli RPC Interface & Types
// ---------------------------------------------------------------------------

/** Metadata descriptor for a token (safe to log / expose without secret value). */
export interface TokenDescriptor {
  name: string;
  description: string;
}

/**
 * WorkerEntrypoint RPC interface exposed by the `core-tk-cli` worker.
 */
export interface CoreTkCliRpc {
  /** Retrieve decrypted secret string value, or null if not found. */
  get(name: string): Promise<string | null>;
  /** Retrieve decrypted secret string value (alias of get). */
  show(name: string): Promise<string | null>;
  /** Search tokens by name or description keyword (returns descriptors only). */
  find(keyword: string): Promise<TokenDescriptor[]>;
  /** List all tokens (descriptors only, never values). */
  list(): Promise<TokenDescriptor[]>;
  /** Check if a token exists in the database. */
  has(name: string): Promise<boolean>;
}

/** Result shape for safe token operations with explicit error handling. */
export type TokenResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data: null; error: string };

/**
 * Safely obtain the typed CoreTkCliRpc stub from the Worker environment.
 */
export function getTokensRpc(env: Env): CoreTkCliRpc | null {
  const binding = env.CORE_TK_CLI as unknown as Partial<CoreTkCliRpc> | undefined;
  if (binding && typeof binding.get === "function") {
    return binding as CoreTkCliRpc;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Standard Secret Resolution Helpers
// ---------------------------------------------------------------------------

/**
 * Generic helper to read a secret value by key name.
 *
 * Precedence:
 * 1. Dedicated tokens service (`CORE_TK_CLI` RPC over VPC tunnel) wrapped
 *    in a graceful try/catch block so tunnel drops or lookup misses fall back.
 * 2. Cloudflare Secrets Store binding (`env[key].get()`)
 * 3. Plain environment variable (string) — local dev / .dev.vars fallback
 */
export async function getSecret(env: Env, key: string): Promise<string | undefined> {
  // 1. Try CORE_TK_CLI RPC service binding with graceful try...catch
  try {
    const tk = getTokensRpc(env);
    if (tk) {
      const val = await tk.get(key);
      if (val !== null && val !== undefined && val !== "") {
        return val;
      }
    }
  } catch (err) {
    // Graceful error handling: log warning and continue down the precedence chain
    console.warn(
      `[tokens] Failed to retrieve '${key}' from CORE_TK_CLI service binding:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 2. Try Secrets Store binding (async .get())
  try {
    const envVal = (env as Record<string, any>)[key];
    if (envVal && typeof envVal?.get === "function") {
      const val = await envVal.get();
      if (val !== null && val !== undefined && val !== "") {
        return val;
      }
    } else if (typeof envVal === "string" && envVal !== "") {
      // 3. Plain string env var fallback
      return envVal;
    }
  } catch (err) {
    console.warn(`[secrets] Failed reading '${key}' from Secrets Store:`, err);
  }

  return undefined;
}

/**
 * Require a secret value by key name, throwing an actionable error if absent.
 */
export async function requireSecret(
  env: Env,
  key: string,
  customErrorMsg?: string,
): Promise<string> {
  const secret = await getSecret(env, key);
  if (!secret) {
    throw new Error(
      customErrorMsg ??
        `Secret '${key}' is required but could not be resolved from CORE_TK_CLI tokens service, Secrets Store, or environment. Verify the secret exists locally with: tokens find ${key}`,
    );
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Safe Token Service Methods (with Graceful Failures)
// ---------------------------------------------------------------------------

/**
 * Safely fetch a secret from CORE_TK_CLI with explicit try/catch and structured error output.
 *
 * Example:
 * ```ts
 * const res = await safeFetchToken(env, "MY_SECRET");
 * if (!res.success) {
 *   console.warn("Could not load secret:", res.error);
 *   return c.json({ error: "Secret unavailable" }, 503);
 * }
 * const apiKey = res.data;
 * ```
 */
export async function safeFetchToken(
  env: Env,
  name: string,
): Promise<TokenResult<string>> {
  try {
    const tk = getTokensRpc(env);
    if (!tk) {
      return {
        success: false,
        data: null,
        error: "CORE_TK_CLI service binding is not configured in worker environment",
      };
    }
    const val = await tk.get(name);
    if (val === null || val === undefined) {
      return {
        success: false,
        data: null,
        error: `Secret '${name}' not found in tokens database`,
      };
    }
    return { success: true, data: val };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[tokens] Gracefully caught error fetching '${name}':`, message);
    return {
      success: false,
      data: null,
      error: `Tokens service error while fetching '${name}': ${message}`,
    };
  }
}

/**
 * Safely search tokens by keyword from CORE_TK_CLI with graceful try/catch.
 */
export async function safeFindTokens(
  env: Env,
  keyword: string,
): Promise<TokenResult<TokenDescriptor[]>> {
  try {
    const tk = getTokensRpc(env);
    if (!tk) {
      return {
        success: false,
        data: null,
        error: "CORE_TK_CLI service binding is not configured in worker environment",
      };
    }
    const matches = await tk.find(keyword);
    return { success: true, data: matches };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[tokens] Gracefully caught error searching '${keyword}':`, message);
    return {
      success: false,
      data: null,
      error: `Tokens service error while searching '${keyword}': ${message}`,
    };
  }
}

/**
 * Safely list all tokens from CORE_TK_CLI with graceful try/catch.
 */
export async function safeListTokens(
  env: Env,
): Promise<TokenResult<TokenDescriptor[]>> {
  try {
    const tk = getTokensRpc(env);
    if (!tk) {
      return {
        success: false,
        data: null,
        error: "CORE_TK_CLI service binding is not configured in worker environment",
      };
    }
    const tokens = await tk.list();
    return { success: true, data: tokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[tokens] Gracefully caught error listing tokens:", message);
    return {
      success: false,
      data: null,
      error: `Tokens service error while listing tokens: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Common Convenience Getters
// ---------------------------------------------------------------------------

/**
 * Fetch the WORKER_API_KEY (used for single-user auth & webhook verification).
 */
export async function getWorkerApiKey(env: Env): Promise<string | undefined> {
  return getSecret(env, "WORKER_API_KEY");
}

/** Fetch the Cloudflare API token (Wrangler / provisioning operations). */
export async function getCloudflareApiToken(env: Env): Promise<string | undefined> {
  return getSecret(env, "CLOUDFLARE_WRANGLER_API_TOKEN");
}

/** Fetch the Cloudflare account id. */
export async function getCloudflareAccountId(env: Env): Promise<string | undefined> {
  return getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
}

/**
 * HMAC key used to sign the session cookie.
 *
 * Stored in the `SESSIONS` KV namespace (not the Secrets Store) so it can be
 * rotated at runtime without a redeploy. Auto-provisions a random key on first
 * use, with a dev fallback if KV is unavailable.
 */
export async function getCookieSigningKey(env: Env): Promise<string> {
  try {
    let key = await env.SESSIONS.get("COOKIE_SIGNING_KEY");
    if (key) return key;

    key = crypto.randomUUID();
    await env.SESSIONS.put("COOKIE_SIGNING_KEY", key);
    return key;
  } catch (e) {
    console.warn("Failed to read/write COOKIE_SIGNING_KEY from KV", e);
    return "default_dev_key_fallback";
  }
}

/**
 * GitHub webhook secret. Maps to WORKER_API_KEY in this template.
 */
export async function getGitHubWebhookSecret(env: Env): Promise<string> {
  const secret = await getWorkerApiKey(env);
  if (!secret) {
    throw new Error("Missing WORKER_API_KEY in tokens service or Secrets Store");
  }
  return secret;
}
