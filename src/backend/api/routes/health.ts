/**
 * @fileoverview Health check API routes.
 *
 * Provides three endpoints:
 *  - `GET  /api/health`        — Quick liveness check (returns latest run from D1)
 *  - `GET  /api/health/latest` — Fetch the most recent run with all results
 *  - `POST /api/health/run`    — Run a full diagnostic, persist to D1, return results
 *
 * Uses the relational D1 schema (`health_runs` + `health_results`). There are
 * no Durable Object agents to ping in this template — the one live
 * dependency check is `CORE_GUARDIAN` (the service binding every inference
 * call routes through), verified with a real, no-spend RPC call
 * (`GuardianRpc.useCases()`), not a presence check.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";

import { healthRuns, healthResults } from "@db/schemas";
import { getDb } from "@/db";
import { guardianProject } from "@/backend/ai/guardian";

// ---------------------------------------------------------------------------
// HealthCoordinator
// ---------------------------------------------------------------------------

type CheckResult = {
  category: "database" | "ai" | "agents" | "binding";
  name: string;
  status: "ok" | "warn" | "fail" | "skipped" | "timeout";
  message?: string;
  details?: Record<string, unknown>;
  durationMs: number;
};

class HealthCoordinator {
  constructor(private readonly env: Env) {}

  // -----------------------------------------------------------------------
  // GET helpers
  // -----------------------------------------------------------------------

  async getLatestRun() {
    const db = getDb(this.env);
    const [latest] = await db
      .select()
      .from(healthRuns)
      .orderBy(desc(healthRuns.createdAt))
      .limit(1);

    if (!latest) return { run: null, results: [] as Array<typeof healthResults.$inferSelect> };

    const results = await db
      .select()
      .from(healthResults)
      .where(eq(healthResults.runId, latest.id));

    return { run: latest, results };
  }

  // -----------------------------------------------------------------------
  // Run all checks
  // -----------------------------------------------------------------------

  async runAllChecks(trigger: "manual" | "scheduled" | "agent") {
    const start = Date.now();

    const checks = await Promise.all([
      this.checkD1(),
      this.checkGuardianProject(),
      this.checkCoreGuardian(),
    ]);

    const durationMs = Date.now() - start;
    const status = aggregateStatus(checks);

    const runId = crypto.randomUUID();
    const db = getDb(this.env);

    await db.insert(healthRuns).values({
      id: runId,
      status,
      trigger,
      durationMs,
      metadata: { checkCount: checks.length },
    });

    if (checks.length > 0) {
      await db.insert(healthResults).values(
        checks.map((c) => ({
          id: crypto.randomUUID(),
          runId,
          category: c.category,
          name: c.name,
          status: c.status,
          message: c.message,
          details: c.details,
          durationMs: c.durationMs,
        })),
      );
    }

    return this.getRunById(runId);
  }

  // -----------------------------------------------------------------------
  // Individual checks
  // -----------------------------------------------------------------------

  private async checkD1(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const result = await this.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      return {
        category: "database",
        name: "d1_roundtrip",
        status: result?.ok === 1 ? "ok" : "warn",
        message: result?.ok === 1 ? "D1 responded with SELECT 1" : "Unexpected D1 response",
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        category: "database",
        name: "d1_roundtrip",
        status: "fail",
        message: error instanceof Error ? error.message : "Unknown D1 failure",
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Real, no-spend dependency check: calls `GuardianRpc.useCases()` over the
   * `CORE_GUARDIAN` service binding. This is the ONLY inference dependency in
   * the Worker now, so a throw here must degrade the verdict — not just get
   * logged (an instrument that always reports "ok" isn't reporting).
   */
  /**
   * Which ledger this Worker bills to.
   *
   * A misconfigured project name is not a crash — every call still succeeds,
   * against someone else's account — so it has to be something a check SAYS,
   * or nothing would ever notice. Its own check rather than a clause inside
   * the binding probe, so a Worker with both problems reports both.
   */
  private async checkGuardianProject(): Promise<CheckResult> {
    const start = Date.now();
    try {
      const project = guardianProject(this.env);
      return {
        category: "ai",
        name: "guardian_project",
        status: "ok",
        message: `Billing and routing decisions are attributed to "${project}"`,
        details: { project },
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        category: "ai",
        name: "guardian_project",
        status: "fail",
        message: error instanceof Error ? error.message : "GUARDIAN_PROJECT is not configured",
        durationMs: Date.now() - start,
      };
    }
  }

  private async checkCoreGuardian(): Promise<CheckResult> {
    const start = Date.now();

    // Reported, not gated: the binding probe below runs whether or not the
    // project is configured, because they are independent failures and
    // collapsing them would hide one behind the other.
    let project: string | null;
    try {
      project = guardianProject(this.env);
    } catch {
      project = null;
    }

    try {
      const guardian = (this.env as unknown as { CORE_GUARDIAN?: { useCases(): Promise<unknown> } })
        .CORE_GUARDIAN;
      if (!guardian || typeof guardian.useCases !== "function") {
        return {
          category: "ai",
          name: "core_guardian_binding",
          status: "fail",
          message: "CORE_GUARDIAN service binding not present",
          durationMs: Date.now() - start,
        };
      }
      const useCases = await guardian.useCases();
      const count = Array.isArray((useCases as any)?.useCases) ? (useCases as any).useCases.length : undefined;
      return {
        category: "ai",
        name: "core_guardian_binding",
        status: "ok",
        message: project
          ? `core-guardian reachable via CORE_GUARDIAN.useCases(); billing project "${project}"`
          : "core-guardian reachable via CORE_GUARDIAN.useCases(); billing project NOT CONFIGURED",
        details: { project, ...(count !== undefined ? { useCaseCount: count } : {}) },
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        category: "ai",
        name: "core_guardian_binding",
        status: "fail",
        message: error instanceof Error ? error.message : "Unknown core-guardian failure",
        durationMs: Date.now() - start,
      };
    }
  }

  private async getRunById(runId: string) {
    const db = getDb(this.env);
    const [run] = await db.select().from(healthRuns).where(eq(healthRuns.id, runId)).limit(1);
    const results = await db
      .select()
      .from(healthResults)
      .where(eq(healthResults.runId, runId));
    return { run, results };
  }
}

function aggregateStatus(checks: CheckResult[]): "healthy" | "degraded" | "unhealthy" | "unknown" {
  if (checks.length === 0) return "unknown";
  const fails = checks.filter((c) => c.status === "fail" || c.status === "timeout").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails > 0) return "unhealthy";
  if (warns > 0) return "degraded";
  return "healthy";
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const checkStatusEnum = z.enum(["ok", "warn", "fail", "skipped", "timeout"]);
const healthStatusEnum = z.enum(["healthy", "degraded", "unhealthy", "unknown"]);
const triggerEnum = z.enum(["manual", "scheduled", "agent"]);
const categoryEnum = z.enum([
  "database",
  "ai",
  "providers",
  "agents",
  "google",
  "binding",
  "auth",
  "api",
  "custom",
]);

const healthResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  category: categoryEnum,
  name: z.string(),
  status: checkStatusEnum,
  message: z.string().nullish(),
  details: z.record(z.string(), z.unknown()).nullish(),
  durationMs: z.number(),
  aiSuggestion: z.string().nullish(),
  timestamp: z.union([z.string(), z.date()]),
});

const healthRunSchema = z.object({
  id: z.string(),
  status: healthStatusEnum,
  trigger: triggerEnum,
  durationMs: z.number(),
  createdAt: z.union([z.string(), z.date()]),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

const healthResponseSchema = z.object({
  run: healthRunSchema,
  results: z.array(healthResultSchema),
});

const latestResponseSchema = z.object({
  run: healthRunSchema.nullable(),
  results: z.array(healthResultSchema),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const healthRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * GET /api/health — Quick liveness / latest run.
 *
 * Returns the latest persisted run from D1 without re-running checks.
 * If no run exists yet, returns { run: null, results: [] }.
 */
healthRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "healthCheck",
    responses: {
      200: {
        description: "Latest health run from D1 (no re-run)",
        content: { "application/json": { schema: latestResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const latest = await coordinator.getLatestRun();
    return c.json({ run: latest?.run ?? null, results: latest?.results ?? [] }, 200);
  },
);

/**
 * GET /api/health/latest — Same as GET / (explicit alias).
 */
healthRouter.openapi(
  createRoute({
    method: "get",
    path: "/latest",
    operationId: "getLatestHealthCheck",
    responses: {
      200: {
        description: "Most recent health run from D1",
        content: { "application/json": { schema: latestResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const latest = await coordinator.getLatestRun();
    return c.json({ run: latest?.run ?? null, results: latest?.results ?? [] }, 200);
  },
);

/**
 * POST /api/health/run — Explicit manual screening trigger.
 *
 * Runs all health checks (D1 roundtrip, Workers AI binding presence, every
 * registered agent DO ping) in parallel, persists run + results to D1, and
 * returns the full payload.
 */
healthRouter.openapi(
  createRoute({
    method: "post",
    path: "/run",
    operationId: "runHealthCheck",
    responses: {
      200: {
        description: "On-demand health diagnostic results",
        content: { "application/json": { schema: healthResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const { run, results } = await coordinator.runAllChecks("manual");
    return c.json({ run, results }, 200);
  },
);
