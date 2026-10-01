/**
 * Runnable self-check for the core-guardian wrappers in src/backend/ai/guardian/:
 * every `GuardianRpc` method is reached through the right wrapper, with the
 * payload built in config.ts, and a refusal becomes a `GuardianError` carrying
 * guardian's own message.
 *
 *   pnpm run selfcheck        # runs every scripts/selfcheck*.mjs
 *   node scripts/selfcheck-guardian-surface.mjs
 *
 * The binding is a recording stub, so each assertion is about what was SENT,
 * not only about what came back — a wrapper that returned the stub's canned
 * answer without calling the right method would otherwise pass.
 *
 * Break to verify each section still fails:
 *   - batching: set `embeddingBatch` to 1000 in config.ts (one call, not three)
 *   - shape:    drop the `data.length !== batch.length` test in workers-ai.ts
 *   - refusal:  throw `new GuardianError(result.status, {})` in workers-ai.ts, or
 *               drop the `body.error` fallback in errors.ts (toolkit refusals)
 *   - tools:    delete `if (tools) capabilities.add("tools")` in config.ts
 *   - routing:  make guardianStitch call `.jules`
 *   - chat:     return `toolCalls: []` unconditionally in chat.ts
 */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The guardian modules import each other extensionless ("./config"), which the
// bundler resolves and Node's type stripping does not. Resolve those to `.ts`
// here instead of changing how the source is written.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const dir = "../src/backend/ai/guardian";
const { buildRunPayload } = await import(`${dir}/config.ts`);
const { GuardianError } = await import(`${dir}/errors.ts`);
const { guardianChat } = await import(`${dir}/chat.ts`);
const { routeGuardian, guardianUseCases } = await import(`${dir}/route.ts`);
const { embed, cosineSimilarity, guardianWorkersAi } = await import(`${dir}/workers-ai.ts`);
const toolkits = await import(`${dir}/toolkits.ts`);

/** An env whose CORE_GUARDIAN records every call and answers from `answers`. */
function stubEnv(answers) {
  const calls = [];
  const binding = new Proxy(
    {},
    {
      get: (_, method) => async (...args) => {
        calls.push({ method, args });
        const answer = answers[method];
        if (answer === undefined) throw new Error(`unexpected call to ${String(method)}`);
        return typeof answer === "function" ? answer(...args) : answer;
      },
    },
  );
  return { env: { GUARDIAN_PROJECT: "my-worker", CORE_GUARDIAN: binding }, calls };
}

/** Assert that `promise` rejects with a GuardianError of `status` whose message includes `text`. */
async function rejectsGuardian(promise, status, text, label) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof GuardianError, `${label}: a GuardianError, not ${error?.name}`);
    assert.equal(error.status, status, `${label}: status`);
    assert.ok(error.message.includes(text), `${label}: guardian's message survives — got "${error.message}"`);
    return true;
  });
}

const vectorsFor = (n) => Array.from({ length: n }, (_, i) => [i, 1]);

// --- embed: batching, order, attribution -------------------------------------
{
  const texts = Array.from({ length: 250 }, (_, i) => `text ${i}`);
  const { env, calls } = stubEnv({
    workersAi: (_model, _origin, input) => ({
      ok: true, status: 200, registrationId: "r", costUsd: 0, accountTier: "free", neurons: 1,
      // Each vector carries its text's index, so order is checkable end to end.
      body: { data: input.text.map((t) => [Number(t.split(" ")[1]), 1]) },
    }),
  });
  const vectors = await embed(env, texts);

  assert.deepEqual(calls.map((c) => c.args[2].text.length), [100, 100, 50], "250 texts go out as 100 + 100 + 50");
  assert.equal(vectors.length, 250, "one vector per text");
  assert.deepEqual(vectors.map((v) => v[0]), texts.map((_, i) => i), "vectors come back in input order");

  const [model, origin, input, opts] = calls[0].args;
  assert.equal(model, "@cf/baai/bge-small-en-v1.5", "default model is bge-small");
  assert.equal(origin, "my-worker", "neurons are attributed to GUARDIAN_PROJECT, never a literal");
  assert.deepEqual(input, { text: texts.slice(0, 100) }, "input is bge's `{ text: [...] }`");
  assert.deepEqual(opts, { taskDescription: "embed" }, "the task label rides along");

  await embed(env, ["x"], { model: "@cf/baai/bge-large-en-v1.5" });
  assert.equal(calls.at(-1).args[0], "@cf/baai/bge-large-en-v1.5", "an explicit model wins");
}

{
  const { env, calls } = stubEnv({});
  assert.deepEqual(await embed(env, []), [], "nothing to embed is not a call");
  assert.equal(calls.length, 0, "and makes none");
}

// --- embed: a short or malformed body is an error, not a silent mismatch -----
{
  const ok = { ok: true, status: 200, registrationId: "r", costUsd: 0, accountTier: "free", neurons: 1 };
  const { env: short } = stubEnv({ workersAi: { ...ok, body: { data: vectorsFor(2) } } });
  await rejectsGuardian(embed(short, ["a", "b", "c"]), 502, "no usable `data` for 3", "two vectors for three texts");

  const { env: empty } = stubEnv({ workersAi: { ...ok, body: { shape: [3, 384] } } });
  await rejectsGuardian(embed(empty, ["a", "b", "c"]), 502, "no usable `data`", "a body with no data");
}

// --- workersAi refusal carries guardian's reason ----------------------------
{
  const { env } = stubEnv({
    workersAi: { ok: false, status: 429, error: "AI budget exceeded — breaker tripped." },
  });
  await rejectsGuardian(embed(env, ["a"]), 429, "breaker tripped", "embed refusal");
  await rejectsGuardian(guardianWorkersAi(env, "@cf/x", {}), 429, "breaker tripped", "workersAi refusal");
}

// --- cosine -----------------------------------------------------------------
assert.equal(cosineSimilarity([1, 0], [1, 0]), 1, "identical direction is 1");
assert.equal(cosineSimilarity([1, 0], [0, 1]), 0, "orthogonal is 0");
assert.equal(cosineSimilarity([0, 0], [1, 1]), 0, "a zero vector is 0, not NaN");
assert.throws(() => cosineSimilarity([1], [1, 2]), RangeError, "vectors from two models are refused");

// --- tools imply the capability, in run AND route ---------------------------
{
  const env = { GUARDIAN_PROJECT: "my-worker" };
  const tools = [{ type: "function", function: { name: "f", parameters: { type: "object" } } }];
  const messages = [{ role: "user", content: "hi" }];

  const plain = buildRunPayload(env, { messages });
  assert.equal("capabilities" in plain, false, "no tools, no capabilities key — the old payload is unchanged");
  assert.deepEqual(plain.input, { messages }, "and no tools in the input");

  const withTools = buildRunPayload(env, { messages, tools, capabilities: ["vision"] });
  assert.deepEqual(withTools.capabilities.sort(), ["tools", "vision"], "tools adds the capability and keeps the caller's");
  assert.deepEqual(withTools.input.tools, tools, "the tools reach the model");
  assert.deepEqual(
    buildRunPayload(env, { messages, tools, capabilities: ["tools"] }).capabilities,
    ["tools"],
    "declaring it yourself does not duplicate it",
  );

  const { env: routeEnv, calls } = stubEnv({ route: { status: "routed", provider: "p", model: "m" } });
  const decision = await routeGuardian(routeEnv, { messages, tools, budgetRange: { maxUsd: 0.01 }, model: "auto" });
  assert.deepEqual(decision, { status: "routed", provider: "p", model: "m" }, "route answers verbatim");
  const sent = calls[0].args[0];
  assert.equal(calls[0].method, "route", "routeGuardian calls route, never run");
  assert.deepEqual(sent.capabilities, ["tools"], "the preview asks for the same capability the run will");
  assert.equal(sent.project, "my-worker");
  assert.equal(sent.use_case, "chat", "defaults match buildRunPayload");
  assert.deepEqual(sent.budgetRange, { maxUsd: 0.01 });
  assert.equal(sent.model, "auto");
  assert.deepEqual(sent.input, { messages });
}

// --- useCases passes through ------------------------------------------------
{
  const catalog = { useCases: [{ key: "chat", matchingModels: [] }] };
  const { env, calls } = stubEnv({ useCases: catalog });
  assert.equal(await guardianUseCases(env), catalog, "useCases answers verbatim");
  assert.deepEqual(calls.map((c) => c.method), ["useCases"]);
}

// --- guardianChat surfaces tool calls ---------------------------------------
{
  const toolCall = { id: "c1", type: "function", function: { name: "f", arguments: "{}" } };
  const { env } = stubEnv({
    run: { status: 200, body: { model: "m", body: { choices: [{ message: { content: null, tool_calls: [toolCall] } }] } } },
  });
  const reply = await guardianChat(env, { messages: [{ role: "user", content: "x" }] });
  assert.deepEqual(reply.toolCalls, [toolCall], "the model's tool calls reach the caller");
  assert.equal(reply.text, "", "a tool-only reply has no text");

  const { env: plainEnv } = stubEnv({ run: { status: 200, body: { body: { choices: [{ message: { content: "hi" } }] } } } });
  assert.deepEqual((await guardianChat(plainEnv, { messages: [] })).toolCalls, [], "no tool calls is [], never undefined");
}

// --- each toolkit wrapper reaches its own method ----------------------------
{
  const ok = (body) => ({ status: 200, body });
  const { env, calls } = stubEnv({
    jules: ok({ sessionId: "s1" }),
    stitch: ok({ projects: [] }),
    orchestration: ok({ tables: [] }),
    toolkits: { version: 1, toolkits: [] },
    tool: ok({ output: { projects: ["p"] } }),
  });
  const req = (path) => ({ method: "GET", path });

  assert.deepEqual(await toolkits.guardianJules(env, req("/sessions")), { sessionId: "s1" });
  assert.deepEqual(await toolkits.guardianStitch(env, req("/projects")), { projects: [] });
  assert.deepEqual(await toolkits.guardianOrchestration(env, req("/tables")), { tables: [] });
  assert.deepEqual(await toolkits.guardianToolkits(env), { version: 1, toolkits: [] });
  assert.deepEqual(await toolkits.guardianTool(env, "stitch.projects", { a: 1 }), { projects: ["p"] }, "tool unwraps `output`");

  assert.deepEqual(
    calls.map((c) => c.method),
    ["jules", "stitch", "orchestration", "toolkits", "tool"],
    "each wrapper calls its own RPC method",
  );
  assert.deepEqual(calls[0].args[0], req("/sessions"), "the request is passed through unchanged");
  assert.deepEqual(calls[4].args, ["stitch.projects", { a: 1 }], "tool id and input are passed through");

  const { env: refused } = stubEnv({
    stitch: { status: 400, body: { error: "Not a Stitch path: /nope" } },
    tool: { status: 503, body: { error: "stitch is not configured" } },
  });
  await rejectsGuardian(toolkits.guardianStitch(refused, req("/nope")), 400, "Not a Stitch path", "stitch refusal");
  await rejectsGuardian(toolkits.guardianTool(refused, "stitch.projects"), 503, "not configured", "tool refusal");
}

console.log("selfcheck-guardian-surface: all guardian wrapper assertions passed");
