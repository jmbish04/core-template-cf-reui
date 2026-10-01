/**
 * @fileoverview The two ways a core-guardian call fails.
 *
 * They are deliberately different types, because they need different
 * responses: a `GuardianError` is the router declining a run that was
 * correctly configured (retryable, map it to a friendly message), while a
 * `GuardianConfigError` is this Worker being set up wrong (not retryable, and
 * silently degrading it would hide the bug).
 */

/**
 * The router rejected or failed a run.
 *
 * `status` is the HTTP-shaped status core-guardian returned: 422 no model
 * inside the budget, 429 circuit breaker open or free Workers AI allowance
 * spent, 400 a bad request, 502 the upstream failed.
 */
export class GuardianError extends Error {
  // Written out rather than declared as constructor parameter properties, so
  // this module can be imported directly by `scripts/selfcheck*.mjs` under
  // Node's strip-only TypeScript support.
  readonly status: number;
  readonly body: unknown;

  /**
   * @param status The status core-guardian answered with.
   * @param body The body it answered with. Never echo this to a browser.
   * @param message Guardian's own explanation. When omitted, `body.error` is
   *   used if it is a string, so the reason survives into logs and alerts.
   */
  constructor(status: number, body: unknown, message?: string) {
    const reason = message ?? (body as { error?: unknown } | null)?.error;
    super(
      typeof reason === "string" && reason
        ? `core-guardian failed (status ${status}): ${reason}`
        : `core-guardian run failed (status ${status})`,
    );
    this.name = "GuardianError";
    this.status = status;
    this.body = body;
  }
}

/**
 * The Worker cannot build a valid payload — a required var is missing.
 *
 * Thrown rather than defaulted on purpose. A hardcoded fallback project name
 * would send every routing decision and every cost to the wrong ledger, and
 * nothing would look broken while it happened.
 */
export class GuardianConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardianConfigError";
  }
}
