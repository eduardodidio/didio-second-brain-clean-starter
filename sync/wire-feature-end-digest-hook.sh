#!/usr/bin/env bash
# sync/wire-feature-end-digest-hook.sh
#
# Wires the feature-end-digest hook into the Stop event of every downstream
# project's .claude/settings.json. The hook *files* are deployed by
# install-feature-end-digest-hook.sh; this script registers them.
#
# Idempotent: skips a project if its settings.json already references
# feature-end-digest in hooks.Stop.
#
# Backup: existing settings.json is copied to settings.json.bak.<UTC-ts>
# before any modification.
#
# Usage:
#   bash sync/wire-feature-end-digest-hook.sh [--dry-run]
#
# Flags:
#   --dry-run   Print what would change; do not write files.
#
# Output: summary line "wired: N, skipped: M (already wired), failed: K"

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Error: unknown option '$1'" >&2; exit 64 ;;
  esac
  shift
done

require_jq

REGISTRY="$SYNC_HUB_DIR/projects/registry.yaml"
if [ ! -f "$REGISTRY" ]; then
  log error "registry not found: $REGISTRY"
  exit 1
fi

PROJECT_PATHS=()
while IFS= read -r path_val; do
  [ -n "$path_val" ] && PROJECT_PATHS+=("$path_val")
done < <(awk '/^[[:space:]]+path:/{sub(/^[[:space:]]+path:[[:space:]]*/,""); print}' "$REGISTRY")

if [ "${#PROJECT_PATHS[@]}" -eq 0 ]; then
  log error "no project paths found in registry: $REGISTRY"
  exit 1
fi

WIRED=0
SKIPPED=0
FAILED=0

for proj_path in "${PROJECT_PATHS[@]}"; do
  settings="$proj_path/.claude/settings.json"
  hook_path="$proj_path/patterns/hooks/feature-end-digest/hook.sh"

  if [ ! -f "$hook_path" ]; then
    log warn "skip $proj_path — hook not deployed (run install-feature-end-digest-hook.sh first)"
    FAILED=$((FAILED+1))
    continue
  fi
  if [ ! -f "$settings" ]; then
    log warn "skip $proj_path — settings.json missing"
    FAILED=$((FAILED+1))
    continue
  fi

  cmd="bash $hook_path"

  # Idempotency: skip if command already present anywhere under hooks.Stop
  if jq -e --arg cmd "$cmd" '
        (.hooks.Stop // [])
        | map(.hooks // [])
        | flatten
        | map(select(.type=="command" and .command==$cmd))
        | length > 0
      ' "$settings" >/dev/null; then
    log info "skip $proj_path — already wired"
    SKIPPED=$((SKIPPED+1))
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log info "[dry-run] would wire $proj_path"
    WIRED=$((WIRED+1))
    continue
  fi

  ts="$(date -u '+%Y%m%dT%H%M%SZ')"
  if ! cp "$settings" "$settings.bak.$ts"; then
    log error "backup failed for $proj_path"
    FAILED=$((FAILED+1))
    continue
  fi

  tmp="$(mktemp)"
  if jq --arg cmd "$cmd" '
        .hooks //= {} |
        .hooks.Stop //= [] |
        .hooks.Stop += [{
          "matcher": "*",
          "hooks": [{"type": "command", "command": $cmd}]
        }]
      ' "$settings" > "$tmp"; then
    mv "$tmp" "$settings"
    log info "wired $proj_path (backup: $(basename "$settings.bak.$ts"))"
    WIRED=$((WIRED+1))
  else
    rm -f "$tmp"
    log error "jq merge failed for $proj_path"
    FAILED=$((FAILED+1))
  fi
done

echo "wired: $WIRED, skipped: $SKIPPED (already wired), failed: $FAILED"
[ $FAILED -eq 0 ] || exit 1
