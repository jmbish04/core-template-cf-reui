/**
 * Runnable self-check for the two hand-written stream parsers.
 *
 *   pnpm run selfcheck        # runs every scripts/selfcheck*.mjs
 *   node scripts/selfcheck.mjs
 *
 * One file per subject, all matching `scripts/selfcheck*.mjs`, so two people
 * can add checks without editing the same file.
 *
 * Both parsers split an SSE byte stream on frame boundaries and must survive a
 * chunk boundary landing mid-frame — the failure mode that only shows up under
 * a real network and is invisible to reading. Each case below plants exactly
 * that, so a regression fails here instead of in production.
 *
 * No test framework on purpose: one file, plain asserts, runs anywhere Node
 * runs. Node strips the TypeScript types on import.
 */
import assert from "node:assert/strict";

// Imported from the concrete modules, not the `guardian/index.ts` barrel:
// Node's strip-only TypeScript support does not resolve extensionless
// re-exports, which is what a barrel is made of.
import { readGuardianStream, guardianStreamMeta } from "../src/backend/ai/guardian/stream-read.ts";

/** An SSE Response whose body is delivered in the given chunks, verbatim. */
function sseResponse(chunks, headers = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers });
}

async function collect(response) {
  const out = [];
  for await (const event of readGuardianStream(response)) out.push(event);
  return out;
}

// --- 1. content, reasoning and usage are three separate channels -------------
{
  const frame = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
  const events = await collect(
    sseResponse([
      frame({ choices: [{ delta: { reasoning: "thinking..." } }] }),
      frame({ choices: [{ delta: { content: "Hello" } }] }),
      frame({ choices: [{ delta: { content: " world" } }] }),
      frame({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }),
      "data: [DONE]\n\n",
    ]),
  );

  const answer = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
  const thinking = events.filter((e) => e.type === "reasoning").map((e) => e.text).join("");
  const usage = events.find((e) => e.type === "usage");

  assert.equal(answer, "Hello world", "content deltas must concatenate to the answer");
  assert.equal(thinking, "thinking...", "reasoning must be its own channel");
  assert.ok(!answer.includes("thinking"), "reasoning must NEVER leak into the answer");
  assert.deepEqual(usage.usage, { promptTokens: 3, completionTokens: 2, totalTokens: 5 });
}

// --- 2. a chunk boundary in the middle of a frame ----------------------------
{
  // The split lands inside the JSON payload, which is what a real socket does.
  const events = await collect(
    sseResponse(['data: {"choices":[{"delta":{"con', 'tent":"split"}}]}\n\n']),
  );
  assert.deepEqual(
    events.filter((e) => e.type === "delta").map((e) => e.text),
    ["split"],
    "a frame split across chunks must still parse",
  );
}

// --- 3. keepalives and non-JSON frames are skipped, not fatal ----------------
{
  const events = await collect(
    sseResponse([": keepalive\n\n", "data: not json\n\n", 'data: {"response":"ok"}\n\n']),
  );
  assert.deepEqual(
    events.map((e) => e.text),
    ["ok"],
    "junk frames must be skipped and the bare {response} shape must still work",
  );
}

// --- 4. the router's decision comes from the headers -------------------------
{
  const meta = guardianStreamMeta(
    sseResponse([], {
      "x-guardian-provider": "ollama",
      "x-guardian-model": "glm-5.3-flash",
      "x-request-uuid": "abc-123",
    }),
  );
  assert.deepEqual(meta, { provider: "ollama", model: "glm-5.3-flash", requestUuid: "abc-123" });

  const missing = guardianStreamMeta(sseResponse([]));
  assert.deepEqual(
    missing,
    { provider: null, model: null, requestUuid: null },
    "absent headers must read as null, never as an empty string the UI would render",
  );
}

console.log("selfcheck: all stream-parser assertions passed");
