/**
 * @fileoverview What this Worker says it is — read from the deploy-set vars.
 *
 * `scripts/set-deploy-vars.mjs` derives WORKER_NAME, WORKER_URL, GITHUB_REPO
 * and GITHUB_REPO_URL into `wrangler.jsonc` on every deploy. Nothing in the UI
 * may hardcode any of them: this repository is a TEMPLATE, and a literal here
 * means every fork of it displays the template's identity instead of its own.
 *
 * Absence is a first-class answer. A repo with no `origin` remote yet is a
 * legitimate state, so `repoSlug` comes back empty and the surface HIDES the
 * link rather than rendering a broken one.
 *
 * @module
 */

/** The deploy-set vars this Worker describes itself with. */
export interface WorkerIdentity {
  /** The Worker's name, e.g. "core-template-cf-reui". "" when unset. */
  workerName: string;
  /** Its public URL with no trailing slash, e.g. "https://x.hacolby.workers.dev". "" when unset. */
  workerUrl: string;
  /** "owner/repo", e.g. "jmbish04/core-template-cf-reui". "" when there is no remote. */
  repoSlug: string;
  /** The repo's https URL. "" when there is no remote. */
  repoUrl: string;
}

/** Everything unset — what a surface gets when the vars are missing. */
export const EMPTY_WORKER_IDENTITY: WorkerIdentity = {
  workerName: "",
  workerUrl: "",
  repoSlug: "",
  repoUrl: "",
};

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Read the identity off a Worker `env`.
 *
 * @param env The Cloudflare env, or undefined during a build with no runtime.
 * @returns The identity, with "" for anything unset. Never throws — a page
 *   that cannot name itself still has to render.
 * @example
 * const { repoSlug, repoUrl } = readWorkerIdentity(Astro.locals.runtime?.env);
 * // repoSlug === "jmbish04/core-template-cf-reui"
 */
export function readWorkerIdentity(env: unknown): WorkerIdentity {
  if (!env || typeof env !== "object") return { ...EMPTY_WORKER_IDENTITY };
  const source = env as Record<string, unknown>;
  const repoSlug = str(source.GITHUB_REPO);
  return {
    workerName: str(source.WORKER_NAME),
    workerUrl: str(source.WORKER_URL).replace(/\/+$/, ""),
    repoSlug,
    // Derive rather than trust: a GITHUB_REPO_URL that disagrees with
    // GITHUB_REPO would send someone to a different repository than the one
    // the UI names, which is worse than no link at all.
    repoUrl: repoSlug ? `https://github.com/${repoSlug}` : "",
  };
}
