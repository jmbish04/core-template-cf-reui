/**
 * Runnable self-check for the wrangler.jsonc transforms in
 * `scripts/set-deploy-vars.mjs`.
 *
 *   node scripts/selfcheck-deploy-vars.mjs
 *
 * This one is a DEPLOY GUARD, which is the category that most often reads as
 * diligence while being incapable of firing: it runs on every deploy, prints a
 * reassuring line, and nobody looks again. So the cases below are the ones that
 * would make it wrong rather than the ones that make it look right — a `//`
 * inside a string, a `name` that only appears in a comment, a missing `vars`
 * block, and comment preservation.
 *
 * Break to verify each section still fails:
 *   - comments/URLs: make stripJsonc sweep `//` without tracking strings
 *   - insert/update: make applyGuardianProject return `{changed:false}` always
 *   - missing name / missing vars: make it return instead of throwing
 */
import assert from "node:assert/strict";

import {
  applyGuardianProject,
  applyVars,
  deriveVars,
  deriveWorkerUrl,
  parseGitHubRemote,
} from "./set-deploy-vars.mjs";

/** A config shaped like the real one: comments, a URL, a trailing comma. */
const CONFIG = `{
  "name": "my-worker",
  // A comment mentioning https://developers.cloudflare.com/workers/ and a
  // stray "name": "NOT_THE_WORKER" that must not be mistaken for the real key.
  "main": "dist/_worker.js/index.js",
  /* A block comment.
     "name": "ALSO_NOT_THE_WORKER" */
  // An inactive example, in the style wrangler.jsonc already uses to document
  // config it is not using. The block lookup must not match THIS one.
  //   "vars": { "EXAMPLE": "value" }
  "vars": {
    // Keep this note.
    "INBOX_FORWARD_TO": "",
    "DOCS": "https://example.com//double-slash",
  },
}`;

/**
 * Re-parse a result the way the script itself does, so an assertion cannot
 * pass on output that no longer loads. Writing the var into a COMMENT satisfies
 * a naive `includes()` check while leaving a file wrangler cannot read.
 *
 * @param {string} text The rewritten config.
 * @returns {object} The parsed config.
 */
function reparse(text) {
  // Same transformation the script applies before JSON.parse: blank out
  // comments (length-preserving is irrelevant here) and drop trailing commas.
  const stripped = text
    .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => (m.startsWith('"') ? m : ""))
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

// --- 1. inserts the var, and leaves everything else alone --------------------
{
  const first = applyGuardianProject(CONFIG);
  assert.equal(first.name, "my-worker", "the Worker name comes from the real top-level key");
  assert.equal(first.previous, null, "there was no previous value to report");
  assert.equal(first.changed, true, "an absent var is a change");
  assert.match(first.text, /"GUARDIAN_PROJECT":\s*"my-worker"/, "the var is written");

  assert.ok(first.text.includes("// Keep this note."), "existing comments must survive");
  assert.ok(
    first.text.includes("https://developers.cloudflare.com/workers/"),
    "a URL inside a comment must survive — a naive // sweep truncates the file here",
  );
  assert.ok(
    first.text.includes('"https://example.com//double-slash"'),
    "a // inside a STRING VALUE is not a comment and must survive",
  );
  // The decoys live in comments, and comments are preserved — so they are
  // still in the text. What must be true is that neither was used as the NAME,
  // which the `first.name` assertion above covers.
  assert.ok(
    first.text.includes('"name": "NOT_THE_WORKER"'),
    "the decoy comment is preserved verbatim, like every other comment",
  );
  assert.ok(
    !/"GUARDIAN_PROJECT":\s*"(NOT|ALSO_NOT)_THE_WORKER"/.test(first.text),
    "a decoy inside a comment must never become the project name",
  );
  assert.ok(first.text.includes('"INBOX_FORWARD_TO": ""'), "other vars are untouched");

  // The assertion that makes the decoy case able to fail at all: the var has to
  // be LIVE CONFIG, not text that merely appears somewhere in the file. Writing
  // it into the commented-out example block would satisfy every `includes()`
  // above while leaving a file wrangler cannot parse and a var never set.
  const parsed = reparse(first.text);
  assert.equal(
    parsed.vars.GUARDIAN_PROJECT,
    "my-worker",
    "the var must land in the REAL vars block, not in a commented-out example",
  );
  assert.equal(parsed.vars.INBOX_FORWARD_TO, "", "the real block keeps its other entries");
  assert.equal(parsed.name, "my-worker", "the rest of the config still parses");
  assert.ok(
    first.text.includes('//   "vars": { "EXAMPLE": "value" }'),
    "the decoy example comment is preserved verbatim",
  );

  // --- 2. idempotent ---------------------------------------------------------
  const second = applyGuardianProject(first.text);
  assert.equal(second.changed, false, "running twice must be a no-op");
  assert.equal(second.text, first.text, "a no-op must not rewrite a single byte");

  // --- 3. updates a stale value ---------------------------------------------
  const drifted = first.text.replace(
    '"GUARDIAN_PROJECT": "my-worker"',
    '"GUARDIAN_PROJECT": "old-name"',
  );
  const fixed = applyGuardianProject(drifted);
  assert.equal(fixed.changed, true, "a stale value is a change");
  assert.equal(fixed.previous, "old-name", "the previous value is reported, so the log is useful");
  assert.match(fixed.text, /"GUARDIAN_PROJECT":\s*"my-worker"/, "the stale value is corrected");
}

// --- 4. refuses rather than guessing ----------------------------------------
{
  assert.throws(
    () => applyGuardianProject('{\n  "vars": { "A": "b" }\n}'),
    /no top-level `name`/,
    "a config with no name must throw, not silently write an empty project",
  );

  assert.throws(
    () => applyGuardianProject('{\n  "name": "w"\n}'),
    /no `vars` object/,
    "a config with nowhere to put the var must throw, not report success",
  );
}

// --- 5. the name is read from the real key, not the first textual match ------
{
  const decoyFirst = `{
  // "name": "COMMENT_DECOY"
  "compatibility_date": "2026-05-25",
  "name": "real-worker",
  "vars": { "A": "b" }
}`;
  assert.equal(
    applyGuardianProject(decoyFirst).name,
    "real-worker",
    "the name must come from a parse, not a regex over raw text",
  );
}

// --- 6. the git remote parses into owner/repo, in all three clone forms -----
{
  const expected = "jmbish04/core-template-cf-reui";
  for (const remote of [
    "git@github.com:jmbish04/core-template-cf-reui.git",
    "git@github.com:jmbish04/core-template-cf-reui",
    "ssh://git@github.com/jmbish04/core-template-cf-reui.git",
    "https://github.com/jmbish04/core-template-cf-reui.git",
    "https://github.com/jmbish04/core-template-cf-reui",
  ]) {
    assert.equal(parseGitHubRemote(remote), expected, `remote form must parse: ${remote}`);
  }
  // A repo with no remote is a legitimate state, not a crash and not a guess.
  assert.equal(parseGitHubRemote(""), "", "an absent remote yields an empty slug");
  assert.equal(parseGitHubRemote("   "), "", "a blank remote yields an empty slug");
}

// --- 7. WORKER_URL prefers a custom domain, falls back to workers.dev -------
{
  assert.equal(
    deriveWorkerUrl({ name: "my-worker" }),
    "https://my-worker.hacolby.workers.dev",
    "with no route configured, the workers.dev address is the address",
  );

  assert.equal(
    deriveWorkerUrl({
      name: "my-worker",
      routes: [
        { pattern: "app.example.com/deep/path/*", custom_domain: true },
        { pattern: "example.com/*", custom_domain: true },
      ],
    }),
    "https://example.com",
    "the SHORTEST host wins — that is the apex, not a sub-path",
  );

  assert.equal(
    deriveWorkerUrl({ name: "my-worker", route: "solo.example.com/*" }),
    "https://solo.example.com",
    "the singular `route` key is honoured as well as `routes`",
  );

  // The failure this guards: a wildcard host is not an address you can open.
  assert.equal(
    deriveWorkerUrl({ name: "my-worker", routes: [{ pattern: "*.example.com/*" }] }),
    "https://my-worker.hacolby.workers.dev",
    "a wildcard host is not addressable and must not become WORKER_URL",
  );
}

// --- 8. every managed var lands in the REAL vars block ----------------------
{
  const derived = deriveVars({
    text: CONFIG,
    remote: "git@github.com:jmbish04/core-template-cf-reui.git",
  });
  assert.deepEqual(
    derived,
    {
      GUARDIAN_PROJECT: "my-worker",
      WORKER_NAME: "my-worker",
      WORKER_URL: "https://my-worker.hacolby.workers.dev",
      GITHUB_REPO: "jmbish04/core-template-cf-reui",
      GITHUB_REPO_URL: "https://github.com/jmbish04/core-template-cf-reui",
    },
    "all five vars are derived, none left to a literal",
  );

  const { text, changes } = applyVars(CONFIG, derived);
  assert.equal(changes.length, 5, "five absent vars are five changes");

  const parsed = reparse(text);
  for (const [key, value] of Object.entries(derived)) {
    assert.equal(parsed.vars[key], value, `${key} must be LIVE config, not text in a comment`);
  }
  assert.equal(parsed.vars.INBOX_FORWARD_TO, "", "the pre-existing vars survive");
  assert.ok(text.includes("// Keep this note."), "pre-existing comments survive a multi-var write");
  assert.ok(
    text.includes('"https://example.com//double-slash"'),
    "a // inside a string value survives a multi-var write",
  );

  // Idempotence is what makes this safe to run on every single deploy.
  const again = applyVars(text, derived);
  assert.equal(again.changes.length, 0, "a second run must be a no-op");
  assert.equal(again.text, text, "a no-op must not rewrite a single byte");

  // The banner is written once, not once per var.
  const banners = text.split("scripts/set-deploy-vars.mjs").length - 1;
  assert.equal(banners, 1, "the explanatory banner is inserted exactly once");
}

// --- 9. drift in ANY managed var is reported, with its old value ------------
{
  const derived = deriveVars({ text: CONFIG, remote: "git@github.com:jmbish04/a.git" });
  const seeded = applyVars(CONFIG, derived).text;

  // The regression this catches: a fork that kept the template's identity.
  const drifted = seeded
    .replace('"WORKER_NAME": "my-worker"', '"WORKER_NAME": "the-template"')
    .replace('"GITHUB_REPO": "jmbish04/a"', '"GITHUB_REPO": "jmbish04/the-template"');

  const { changes } = applyVars(drifted, derived);
  const byKey = Object.fromEntries(changes.map((c) => [c.key, c]));
  assert.equal(changes.length, 2, "exactly the two drifted vars are reported");
  assert.equal(
    byKey.WORKER_NAME.from,
    "the-template",
    "the stale value is named, so the log is useful",
  );
  assert.equal(byKey.WORKER_NAME.to, "my-worker");
  assert.equal(byKey.GITHUB_REPO.from, "jmbish04/the-template");
}

// --- 10. an empty GitHub slug is written as "", never as a guess ------------
{
  const derived = deriveVars({ text: CONFIG, remote: "" });
  assert.equal(derived.GITHUB_REPO, "", "no remote means no repo, not an invented one");
  assert.equal(derived.GITHUB_REPO_URL, "", "and no URL built from an empty slug");
  const parsed = reparse(applyVars(CONFIG, derived).text);
  assert.equal(
    parsed.vars.GITHUB_REPO,
    "",
    "the empty value is still written, so the shell can hide the link",
  );
}

console.log("selfcheck-deploy-vars: all wrangler-config assertions passed");
