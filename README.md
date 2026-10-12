# Core Template: Cloudflare Workers + Astro + shadcn/ui

This template combines Cloudflare Workers, Hono, Astro, React, Tailwind CSS, and shadcn/ui into a single full-stack starter.

## Getting Started

Use Node.js 22+ so Wrangler can generate Cloudflare types successfully, then use Corepack so the repository runs with the pinned pnpm version from `package.json`.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

## Template Intake Automation

When this repository is used through GitHub's **Use this template** flow, `.github/workflows/setup-template.yml` runs once on the first push in the new repository. It will:

- rename the package and Wrangler worker to the new repository name
- update the repository URL in `package.json`
- refresh dependencies with pnpm, including the lockfile
- regenerate `worker-configuration.d.ts`
- remove `package-lock.json`
- delete the setup workflow from the generated repository after it finishes

The workflow now rebases before pushing its setup commit so the initial template update does not fail on a non-fast-forward push.

## New repositories: Colby Maestro provisions them

Colby Maestro provisions a repository created from this template: it names the
Worker after the repository, makes sure that Worker exists, links Workers Builds
CI/CD to `main` (build `pnpm run build`, deploy `pnpm run deploy`), and keeps the
agent briefings under `.agents/ecosystem/` synced. No repository secrets and no
GitHub Actions are needed for any of that. Details:
https://colby-maestro.hacolby.workers.dev/docs/cloudflare-automation

## Secrets Management & Tokens Service (`CORE_TK_CLI`)

Because Cloudflare Secret Store accounts are strictly capped at **100 total secrets**, this template uses the dedicated `core-tk-cli` worker service binding (`CORE_TK_CLI`) to pull secrets on demand over a private Cloudflare VPC tunnel into our local tokens catalog.

### Using Secrets in Code

All secret retrieval is handled through `src/backend/utils/secrets.ts`. It cascades automatically:
1. `CORE_TK_CLI` service binding via RPC over VPC
2. Cloudflare Secrets Store bindings (`await env.NAME.get()`)
3. Plain environment variables / `.dev.vars` (local dev fallback)

```typescript
import { requireSecret, getSecret, safeFetchToken } from "@/backend/utils/secrets";

// Pattern 1: Automatic Cascade (recommended for application startup & handlers)
const apiKey = await requireSecret(env, "OPENAI_API_KEY"); // throws if missing across all sources
const optKey = await getSecret(env, "SENTRY_DSN");        // returns undefined if missing

// Pattern 2: Explicit Graceful Failure Handling (for non-fatal integrations)
try {
  const result = await safeFetchToken(env, "THIRD_PARTY_API_KEY");
  if (!result.success) {
    console.warn("Tokens service warning:", result.error);
    // Graceful fallback or degraded mode
  } else {
    const key = result.data;
  }
} catch (error) {
  // Graceful catch ensures tunnel/VPC drops never crash worker execution
  console.error("Gracefully caught secret resolution failure:", error);
}
```

See `/api/tokens-example` and `/playbook` for interactive examples and health checks.

## Dependency Maintenance

This template is pnpm-first. Keep `pnpm-lock.yaml` committed and in sync with `package.json`.

Useful maintenance commands:

```bash
corepack pnpm run deps:lockfile
corepack pnpm run deps:update
corepack pnpm lint
corepack pnpm build
```

- `deps:lockfile` refreshes the pnpm lockfile and regenerates Wrangler types
- `deps:update` pulls the latest dependency versions first, then refreshes the lockfile and types

## Fixing GitHub or Cloudflare Build Failures

If a GitHub Actions run or Cloudflare PR deployment fails because the lockfile is frozen, pnpm metadata is stale, or Wrangler/generated types drifted:

1. Run `corepack pnpm run deps:lockfile`
2. If versions are stale, run `corepack pnpm run deps:update`
3. If Wrangler reports a Node version error, switch the environment to Node.js 22+ and rerun the maintenance commands
4. Re-run `corepack pnpm lint` and `corepack pnpm build`
5. Commit the resulting `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (if changed), and `worker-configuration.d.ts` (if changed)

Do not add `package-lock.json` back to the repository.

## License

This project is licensed under the [MIT License](LICENSE).
