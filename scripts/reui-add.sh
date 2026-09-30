#!/usr/bin/env bash
# Install ReUI registry items into this repo.
#
#   bash scripts/reui-add.sh dashboard-1 chart-6 data-grid
#
# Why a wrapper: this repo's tsconfig maps "@/*" to two roots (frontend + backend),
# which the shadcn CLI cannot resolve. It then (a) writes files under src/components,
# src/hooks, src/lib instead of src/frontend/*, and (b) leaves `import { cn } from "cn"`
# unrewritten. This moves them and fixes the import. Existing files are never
# overwritten (answers "n" to every prompt) — our ui/* primitives stay as they are.
#
# The Pro licence comes from the tokens CLI, exported for this one command only.
set -euo pipefail
cd "$(dirname "$0")/.."

[ $# -gt 0 ] || { echo "usage: $0 <item> [item...]" >&2; exit 1; }

# Parallel agents share one checkout: serialize installs so package.json /
# pnpm-lock.yaml are never written concurrently (mkdir is atomic; macOS has no flock).
LOCK=.reui-add.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 2; done
trap 'rmdir "$LOCK"' EXIT
REUI_LICENSE_KEY="$(tokens show REUI_LICENSE_KEY --value-only)"
export REUI_LICENSE_KEY

items=()
for i in "$@"; do items+=("@reui/${i#@reui/}"); done
yes n | pnpm dlx shadcn@latest add "${items[@]}" 2>&1 | grep -vE '^Progress|^\s*$' || true

for d in components hooks lib; do
  [ -d "src/$d" ] || continue
  mkdir -p "src/frontend/$d"
  # never clobber an existing frontend file
  (cd "src/$d" && find . -type f) | while read -r f; do
    dest="src/frontend/$d/${f#./}"
    if [ -e "$dest" ]; then echo "kept existing $dest"; else mkdir -p "$(dirname "$dest")"; mv "src/$d/$f" "$dest"; fi
  done
  rm -rf "src/$d"
done

grep -rl 'from "cn"' src/frontend | xargs -r sed -i '' 's|from "cn"|from "@/lib/utils"|'
# the CLI adds the literal "cn" package as a dependency; it is not one
grep -q '"cn":' package.json && pnpm remove cn >/dev/null
echo "done"
