#!/usr/bin/env bash
# Parallel-safe type/build check.
#
# `pnpm run build` writes to ./dist, so two agents running it at once corrupt
# each other's output. This builds into a private throwaway directory instead,
# so several checks can run side by side. Same compiler, same errors.
#
#   bash scripts/check.sh
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=".check-$$"
pnpm exec astro build --outDir "$OUT" 2>&1 | grep -vE '^[0-9:]+ \[vite\]|^Progress|^\s*$'
status=${PIPESTATUS[0]}
rm -rf "$OUT"
exit "$status"
