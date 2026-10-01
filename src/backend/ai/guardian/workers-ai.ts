/**
 * @fileoverview Workers AI through core-guardian: embeddings, and any other
 * model `run` (the chat router) does not cover.
 *
 * This Worker has no `ai` binding and must never get one: `env.AI.run` bills
 * the account card with nothing recording who spent it. `GuardianRpc.workersAi`
 * runs the model on whichever of guardian's two accounts still has free
 * neurons, refuses (429) rather than silently bill once both are spent, and
 * attributes every neuron to this Worker's `GUARDIAN_PROJECT`.
 */

import { buildWorkersAiCall, GUARDIAN_DEFAULTS, GUARDIAN_TASKS } from "./config";
import { GuardianError } from "./errors";
import { guardianRpc } from "./rpc";

/** What a successful `guardianWorkersAi` call hands back. */
export interface GuardianWorkersAiOutput {
  /** The model's own response, verbatim. */
  body: unknown;
  neurons: number;
  costUsd: number;
  accountTier: "free" | "paid" | null;
}

/**
 * Run one Workers AI model through core-guardian.
 *
 * @param env The Worker environment.
 * @param model A Workers AI model id, e.g. `@cf/baai/bge-small-en-v1.5`.
 * @param input The model input, forwarded verbatim.
 * @param task A label for guardian's usage log; prefer `GUARDIAN_TASKS`.
 * @returns The model's body plus what it cost.
 * @throws {GuardianError} with guardian's own message on a refusal: 400 bad
 *   request, 429 budget breaker or free allowance spent, 502 the model failed.
 * @throws {GuardianConfigError} when `GUARDIAN_PROJECT` is unset.
 * @example
 * const { body } = await guardianWorkersAi(env, "@cf/meta/llama-3.2-3b-instruct", { prompt: "Hi" });
 */
export async function guardianWorkersAi(
  env: Env,
  model: string,
  input: unknown,
  task?: string,
): Promise<GuardianWorkersAiOutput> {
  const result = await guardianRpc(env).workersAi(...buildWorkersAiCall(env, model, input, task));
  if (!result.ok) throw new GuardianError(result.status, result, result.error);
  return { body: result.body, neurons: result.neurons, costUsd: result.costUsd, accountTier: result.accountTier };
}

/**
 * Embed texts, one vector per text, in input order.
 *
 * Batches to `GUARDIAN_DEFAULTS.embeddingBatch` (100) per call, so a large
 * list costs one round trip per hundred, never one per text.
 *
 * @param env The Worker environment.
 * @param texts The texts to embed. An empty list returns `[]` without a call.
 * @param options.model A bge model id; defaults to the 384-dim bge-small.
 * @returns One `number[]` per input text.
 * @throws {GuardianError} on a refusal (guardian's message), or 502 when the
 *   model answers without one vector per text — a silent short read here would
 *   pair the wrong vector with the wrong text downstream.
 * @example
 * const [a, b] = await embed(env, ["roof leak", "water through the ceiling"]);
 * cosineSimilarity(a, b); // ~0.8
 */
export async function embed(
  env: Env,
  texts: string[],
  options: { model?: string } = {},
): Promise<number[][]> {
  const model = options.model ?? GUARDIAN_DEFAULTS.embeddingModel;
  const size = GUARDIAN_DEFAULTS.embeddingBatch;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size);
    const { body } = await guardianWorkersAi(env, model, { text: batch }, GUARDIAN_TASKS.embed);
    const data = (body as { data?: unknown } | null)?.data;
    if (!Array.isArray(data) || data.length !== batch.length || !data.every(Array.isArray)) {
      throw new GuardianError(502, body, `${model} returned no usable \`data\` for ${batch.length} text(s)`);
    }
    out.push(...(data as number[][]));
  }
  return out;
}

/**
 * Cosine similarity of two equal-length vectors: 1 is identical direction,
 * 0 unrelated. bge vectors are already normalised, so this is their dot product.
 *
 * @param a A vector from `embed`.
 * @param b Another vector from the same model.
 * @returns The similarity, or 0 when either vector is all zeros.
 * @throws {RangeError} when the lengths differ — vectors from two different
 *   models are not comparable, and a silent 0 would hide that.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new RangeError(`vector lengths differ: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
