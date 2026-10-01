/**
 * @fileoverview Worked samples of every core-guardian capability. COPY FROM HERE.
 *
 * This file is TypeScript on purpose, not a README: it is inside `src/`, so
 * `pnpm run typecheck` compiles it, and a sample that drifts from the module
 * it demonstrates fails the check instead of quietly teaching the wrong API.
 * Nothing imports it, so it never reaches the bundle.
 *
 * Every sample imports from the barrel, exactly as your code should.
 *
 * The house rules these follow (`~/AGENTS-ai.md`):
 *   - every inference goes through core-guardian — no `ai` binding, no SDK;
 *   - let guardian ROUTE: send routing hints or a sentinel model
 *     (`auto` | `best` | `budget` | `cheapest`), never a concrete model unless
 *     the caller genuinely must have that one;
 *   - a refusal is a `GuardianError` (422 no model in budget, 429 breaker or
 *     free allowance spent); a `GuardianConfigError` is this Worker set up wrong.
 */

import {
  GUARDIAN_TASKS,
  GuardianError,
  cosineSimilarity,
  embed,
  guardianChat,
  guardianJules,
  guardianProject,
  guardianStream,
  guardianTool,
  guardianToolkits,
  readGuardianStream,
  routeGuardian,
  type GuardianInputMessage,
  type GuardianToolDefinition,
} from "./index";

/**
 * 1. One settled completion. Routing hints, no model: guardian picks one
 *    inside the budget. Add your task label to `GUARDIAN_TASKS` first.
 */
export async function exampleCompletion(env: Env, question: string): Promise<string> {
  const { text, model, costUsd } = await guardianChat(env, {
    task: GUARDIAN_TASKS.chatReply,
    importance: "medium",
    complexity: "low",
    model: "budget", // a sentinel, not a model id
    messages: [
      { role: "system", content: "Answer in one short paragraph." },
      { role: "user", content: question },
    ],
  });
  console.log(`answered by ${model} for $${costUsd ?? "?"}`);
  return text;
}

/**
 * 2. Tool calling. Passing `tools` makes the payload declare
 *    `capabilities: ["tools"]` for you, so `auto` cannot route to a model that
 *    cannot call one. The loop is yours: run, execute what the model asked
 *    for, send the results back, and stop at a hard ceiling.
 */
export async function exampleToolCalling(env: Env, city: string): Promise<string> {
  const tools: GuardianToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Current temperature for a city, in Celsius.",
        parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      },
    },
  ];
  const messages: GuardianInputMessage[] = [{ role: "user", content: `Is it warm in ${city}?` }];

  // ponytail: hard ceiling 4 turns; raise only with a measured reason.
  for (let turn = 0; turn < 4; turn++) {
    const reply = await guardianChat(env, { task: GUARDIAN_TASKS.chatReply, model: "auto", tools, messages });
    if (!reply.toolCalls.length) return reply.text;

    messages.push({ role: "assistant", content: reply.text || null, tool_calls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      const args = JSON.parse(call.function.arguments) as { city: string };
      const result = { city: args.city, celsius: 21 }; // your real lookup goes here
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error("tool loop hit its turn ceiling without an answer");
}

/**
 * 3. Streaming. The full version — routed model from the headers, reasoning
 *    kept apart from the answer, persistence, disconnect handling — is
 *    `POST /api/chat/stream` in `src/backend/api/routes/chat.ts`. Copy that.
 *    The minimal shape: re-emit your own events, never proxy guardian's body.
 */
export async function exampleStream(env: Env, prompt: string): Promise<Response> {
  const upstream = await guardianStream(env, {
    task: GUARDIAN_TASKS.chatReply,
    messages: [{ role: "user", content: prompt }],
  });
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const event of readGuardianStream(upstream)) {
        // `reasoning` is the model's thinking, NOT the answer: never append it.
        if (event.type === "delta") controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.text)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

/**
 * 4. Embeddings and similarity. `embed` batches 100 texts per call through
 *    guardian's Workers AI door (no `ai` binding) and returns one vector per
 *    text, in order. Default model: bge-small, 384 dimensions.
 */
export async function exampleSemanticMatch(env: Env, query: string, docs: string[]): Promise<string | null> {
  const [queryVector, ...docVectors] = await embed(env, [query, ...docs]);
  let best: string | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < docs.length; i++) {
    const score = cosineSimilarity(queryVector, docVectors[i]);
    if (score > bestScore) [best, bestScore] = [docs[i], score];
  }
  return best;
}

/**
 * 5. Preview the route before spending. Same options as the real run, so the
 *    preview cannot drift from it. Useful before a batch: know the model and
 *    its estimated cost, or that nothing fits the budget, before the first call.
 */
export async function exampleRouteThenRun(env: Env, prompt: string): Promise<string | null> {
  const options = {
    task: GUARDIAN_TASKS.chatReply,
    importance: "high" as const,
    budgetRange: { maxUsd: 0.02 },
    messages: [{ role: "user" as const, content: prompt }],
  };
  const decision = await routeGuardian(env, options);
  if (decision.status !== "routed") {
    console.warn("would not run:", decision.reason.join("; "), decision.lowestAvailable);
    return null;
  }
  console.log(`will use ${decision.provider}/${decision.model}, est $${decision.estCostUsd}`);
  return (await guardianChat(env, options)).text;
}

/**
 * 6. Dispatch a repoless Jules session. Two routes in: the toolkit catalog
 *    (preferred — validated input, audited) or the raw surface. The session
 *    takes ~20s to become `ready`; poll `GET /sessions/{id}` before prompting.
 */
export async function exampleJulesSession(env: Env, task: string): Promise<string> {
  const manifest = await guardianToolkits(env);
  const jules = manifest.toolkits.find((k) => k.id === "jules");
  if (!jules?.available) throw new Error(`Jules is not configured: ${jules?.unavailableReason ?? "absent"}`);

  const { sessionId } = await guardianJules<{ sessionId: string }>(env, {
    method: "POST",
    path: "/sessions",
    body: { project: guardianProject(env), title: task.slice(0, 80) },
  });
  // Later, once the session reports `state: "ready"`:
  //   await guardianJules(env, { method: "POST", path: `/sessions/${sessionId}/prompts`, body: { prompts: [task] } });
  return sessionId;
}

/** 7. Any catalog tool by id, with its error mapped. Ids come from `guardianToolkits`. */
export async function exampleCatalogTool(env: Env): Promise<unknown> {
  try {
    return await guardianTool(env, "stitch.projects");
  } catch (error) {
    // 503 = the toolkit is not configured on guardian; anything else is real.
    if (error instanceof GuardianError && error.status === 503) return null;
    throw error;
  }
}
