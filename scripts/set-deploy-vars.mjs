#!/usr/bin/env node
/**
 * Keep the self-describing `vars` in wrangler.jsonc equal to what this Worker
 * actually is.
 *
 *   node scripts/set-deploy-vars.mjs [--check]
 *
 * WHY: this repository is a TEMPLATE. Every Worker forked from it starts with
 * the template's own identity baked into its config, and nothing looks broken
 * while it reports itself under the wrong name. The first symptom of that was
 * core-guardian billing a fork's spend to the template; the same hazard
 * applies to anything else the UI prints about itself — the GitHub repository
 * link in the app shell, the deployed URL, the project the health page says it
 * is checking.
 *
 * So none of it is a literal. Five vars are DERIVED on every deploy:
 *
 *   GUARDIAN_PROJECT  the Worker's `name` — what core-guardian bills against
 *   WORKER_NAME       the Worker's `name` — what the UI and health page show
 *   WORKER_URL        a configured custom-domain route if there is one,
 *                     otherwise https://<name>.<subdomain>.workers.dev
 *   GITHUB_REPO       `owner/repo`, from the `origin` git remote
 *   GITHUB_REPO_URL   the https URL for that repo
 *
 * `--check` reports drift without writing, and exits 1 if there is any: use it
 * in CI to fail a build whose self-description would be wrong.
 *
 * The file is edited as TEXT, not parsed and re-serialised. wrangler.jsonc
 * carries a lot of hard-won commentary (the DO migration history, the Email
 * Routing setup) and a JSON round-trip would delete all of it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "wrangler.jsonc");

/**
 * The workers.dev subdomain this account publishes under. Every Worker in the
 * fleet is `<name>.hacolby.workers.dev` unless it carries a custom-domain
 * route, which `deriveVars` prefers when present.
 */
const WORKERS_DEV_SUBDOMAIN = process.env.WORKERS_DEV_SUBDOMAIN || "hacolby";

/** The vars this script owns, in the order they are inserted. */
export const MANAGED_VARS = [
  "GUARDIAN_PROJECT",
  "WORKER_NAME",
  "WORKER_URL",
  "GITHUB_REPO",
  "GITHUB_REPO_URL",
];

/**
 * Blank out every JSONC comment, keeping the text the SAME LENGTH.
 *
 * Length-preserving on purpose: the caller locates the `vars` block by index
 * in this masked copy and then splices into the ORIGINAL, so the two have to
 * line up character for character.
 *
 * String-aware, because wrangler.jsonc contains `https://` URLs inside its
 * comments and inside its values, and a naive `//` sweep would truncate the
 * file at the first one.
 *
 * @param {string} text Raw JSONC.
 * @returns {string} The same text, same length, with comment bodies spaced out.
 */
export function maskComments(text) {
  const out = Array.from(text);
  let inString = false;
  let inLine = false;
  let inBlock = false;

  /** Replace a character with a space, but never a newline — line numbers matter. */
  const blank = (i) => {
    if (out[i] !== "\n") out[i] = " ";
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLine) {
      if (ch === "\n") inLine = false;
      else blank(i);
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        blank(i);
        blank(i + 1);
        i += 1;
        inBlock = false;
      } else {
        blank(i);
      }
      continue;
    }
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      blank(i);
      blank(i + 1);
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      blank(i);
      blank(i + 1);
      i += 1;
      continue;
    }
  }

  return out.join("");
}

/**
 * Strip JSONC down to something `JSON.parse` accepts.
 *
 * @param {string} text Raw JSONC.
 * @returns {string} Parseable JSON.
 */
export function stripJsonc(text) {
  // Trailing commas are legal in JSONC and not in JSON.
  return maskComments(text).replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Locate the body of a top-level object key, by brace matching.
 *
 * Searches the COMMENT-MASKED copy, not the raw text. A commented-out example
 * block — the style wrangler.jsonc already uses to document config it is not
 * using — would otherwise be matched first, and the caller would splice a var
 * into the middle of a comment, leaving a file that no longer parses and a var
 * that was never set. Masking also keeps braces inside comments from throwing
 * off the depth count.
 *
 * @param {string} text Raw JSONC.
 * @param {string} key The key whose object body to find, e.g. "vars".
 * @returns {{open: number, close: number} | null} Indices of the `{` and its `}`,
 *   valid against the ORIGINAL text.
 */
export function findObjectBody(text, key) {
  const masked = maskComments(text);
  const opener = new RegExp(`"${key}"\\s*:\\s*\\{`).exec(masked);
  if (!opener) return null;
  const open = opener.index + opener[0].length - 1;

  let depth = 0;
  let inString = false;
  for (let i = open; i < masked.length; i += 1) {
    const ch = masked[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return { open, close: i };
    }
  }
  return null;
}

/**
 * Turn an `origin` remote URL into `owner/repo`.
 *
 * Handles the three forms a clone on this machine can produce: scp-style ssh
 * (`git@github.com:owner/repo.git`), ssh URL (`ssh://git@github.com/owner/repo`),
 * and https (`https://github.com/owner/repo.git`).
 *
 * @param {string} remote A git remote URL.
 * @returns {string} `owner/repo`, or "" when the URL is not a GitHub remote.
 * @example
 * parseGitHubRemote("git@github.com:jmbish04/core-bridge.git"); // "jmbish04/core-bridge"
 */
export function parseGitHubRemote(remote) {
  const url = (remote || "").trim();
  if (!url) return "";
  const match =
    /^git@[^:]+:(?<slug>[^/]+\/[^/]+?)(?:\.git)?$/.exec(url) ||
    /^ssh:\/\/[^@]+@[^/]+\/(?<slug>[^/]+\/[^/]+?)(?:\.git)?$/.exec(url) ||
    /^https?:\/\/[^/]+\/(?<slug>[^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  return match?.groups?.slug ?? "";
}

/**
 * Pick the URL this Worker is actually reachable at.
 *
 * A custom-domain route wins — it is the short, human URL, and the whole point
 * of configuring one. Among several, the shortest pattern wins, because that is
 * the apex rather than a sub-path. With no routes at all, fall back to the
 * workers.dev address, which `workers_dev: true` guarantees exists.
 *
 * @param {object} config The parsed wrangler config.
 * @returns {string} An https URL with no trailing slash.
 */
export function deriveWorkerUrl(config) {
  const name = String(config?.name ?? "").trim();
  const routes = [].concat(config?.routes ?? []).concat(config?.route ? [config.route] : []);

  const hosts = routes
    .map((route) => (typeof route === "string" ? route : route?.pattern))
    .filter((pattern) => typeof pattern === "string" && pattern.length > 0)
    // A route pattern is `host/path*`; only the host is addressable.
    .map((pattern) => pattern.replace(/^https?:\/\//, "").split("/")[0])
    .filter((host) => host && !host.includes("*"))
    .sort((a, b) => a.length - b.length);

  if (hosts[0]) return `https://${hosts[0]}`;
  return `https://${name}.${WORKERS_DEV_SUBDOMAIN}.workers.dev`;
}

/**
 * Work out what every managed var should be.
 *
 * @param {object} options
 * @param {string} options.text Raw wrangler.jsonc.
 * @param {string} [options.remote] The `origin` remote URL. Pass "" to leave
 *   the GitHub vars out entirely rather than writing an empty string — a repo
 *   with no remote yet is a legitimate state, and a blank var is how the app
 *   shell knows to hide the link.
 * @returns {Record<string, string>} Var name to derived value.
 * @throws {Error} when the config has no top-level `name`.
 */
export function deriveVars({ text, remote = "" }) {
  const config = JSON.parse(stripJsonc(text));
  const name = typeof config.name === "string" ? config.name.trim() : "";
  if (!name) {
    throw new Error(
      "wrangler.jsonc has no top-level `name`; nothing to derive the Worker identity from.",
    );
  }

  const slug = parseGitHubRemote(remote);
  return {
    GUARDIAN_PROJECT: name,
    WORKER_NAME: name,
    WORKER_URL: deriveWorkerUrl(config),
    GITHUB_REPO: slug,
    GITHUB_REPO_URL: slug ? `https://github.com/${slug}` : "",
  };
}

/**
 * Write a set of vars into the `vars` block of a wrangler.jsonc.
 *
 * Existing entries are updated in place; missing ones are inserted at the top
 * of the block under a banner comment that says what maintains them.
 *
 * @param {string} text Raw wrangler.jsonc.
 * @param {Record<string, string>} vars Var name to value.
 * @returns {{text: string, changes: Array<{key: string, from: string | null, to: string}>}}
 * @throws {Error} when there is no `vars` object to write into.
 */
export function applyVars(text, vars) {
  const changes = [];
  let current = text;

  // Reversed, because every insert goes to the TOP of the block: walking the
  // declared order would lay the vars out backwards and strand the banner
  // comment in the middle of them.
  for (const [key, value] of Object.entries(vars).reverse()) {
    const block = findObjectBody(current, "vars");
    if (!block) {
      throw new Error("wrangler.jsonc has no `vars` object to write the deploy vars into.");
    }

    const body = current.slice(block.open, block.close + 1);
    // Matched against the masked body for the same reason as the block lookup:
    // a commented-out var must not be mistaken for the live one.
    const maskedBody = maskComments(current).slice(block.open, block.close + 1);
    const pattern = new RegExp(`("${key}"\\s*:\\s*)"((?:[^"\\\\]|\\\\.)*)"`);
    const inMask = pattern.exec(maskedBody);
    const existing = inMask ? pattern.exec(body.slice(inMask.index)) : null;
    if (existing) existing.index += inMask.index;

    if (existing) {
      if (existing[2] === value) continue;
      changes.push({ key, from: existing[2], to: value });
      const nextBody = body.replace(existing[0], `${existing[1]}${JSON.stringify(value)}`);
      current = current.slice(0, block.open) + nextBody + current.slice(block.close + 1);
      continue;
    }

    changes.push({ key, from: null, to: value });
    const indent = /\n(\s+)\S/.exec(body)?.[1] ?? "    ";
    const inserted = `{\n${indent}"${key}": ${JSON.stringify(value)},` + body.slice(1);
    current = current.slice(0, block.open) + inserted + current.slice(block.close + 1);
  }

  // The banner goes on LAST, so it sits above the vars rather than stranded
  // among them — every insert above goes to the top of the block, so writing
  // it inside the loop would bury it under whatever was inserted next.
  const inserted = changes.some((change) => change.from === null);
  if (inserted) {
    const block = findObjectBody(current, "vars");
    const body = current.slice(block.open, block.close + 1);
    if (!body.includes("scripts/set-deploy-vars.mjs")) {
      const indent = /\n(\s+)\S/.exec(body)?.[1] ?? "    ";
      const banner =
        `${indent}// Derived on every deploy by scripts/set-deploy-vars.mjs so a Worker\n` +
        `${indent}// forked from this template describes ITSELF, not the template.\n`;
      current =
        current.slice(0, block.open) +
        `{\n${banner}` +
        body.slice(1) +
        current.slice(block.close + 1);
    }
  }

  return { text: current, changes: changes.reverse() };
}

/**
 * Back-compatible single-var entry point, kept so the original guardian
 * self-check keeps exercising the JSONC transform.
 *
 * @param {string} text Raw wrangler.jsonc.
 * @returns {{text: string, name: string, previous: string | null, changed: boolean}}
 */
export function applyGuardianProject(text) {
  const name = deriveVars({ text }).GUARDIAN_PROJECT;
  const { text: next, changes } = applyVars(text, { GUARDIAN_PROJECT: name });
  const change = changes[0];
  return { text: next, name, previous: change ? change.from : null, changed: Boolean(change) };
}

/**
 * Read the `origin` remote, returning "" when there is no git repo or no remote.
 *
 * Never throws: a template checked out as a plain directory, or a CI runner
 * with a detached tree, is a normal state, and a missing remote means the
 * GitHub vars stay empty rather than the deploy failing.
 *
 * @returns {string} The remote URL, or "".
 */
export function readOriginRemote() {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const original = readFileSync(CONFIG, "utf8");

  let derived;
  let result;
  try {
    derived = deriveVars({ text: original, remote: readOriginRemote() });
    result = applyVars(original, derived);
  } catch (error) {
    console.error(`set-deploy-vars: ${error.message}`);
    process.exit(1);
  }

  if (result.changes.length === 0) {
    console.log(`set-deploy-vars: up to date (${MANAGED_VARS.join(", ")})`);
    return;
  }

  const lines = result.changes.map(
    ({ key, from, to }) =>
      `  ${key}: ${from === null ? "(absent)" : JSON.stringify(from)} -> ${JSON.stringify(to)}`,
  );

  if (checkOnly) {
    console.error("set-deploy-vars: wrangler.jsonc is out of date —\n" + lines.join("\n"));
    process.exit(1);
  }

  writeFileSync(CONFIG, result.text);
  console.log("set-deploy-vars: updated —\n" + lines.join("\n"));
}

// Only run when invoked directly, so the self-check can import the transforms.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
