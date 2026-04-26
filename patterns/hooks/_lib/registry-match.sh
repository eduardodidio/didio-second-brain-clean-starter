#!/usr/bin/env bash
# patterns/hooks/_lib/registry-match.sh
# Sourced by patterns/hooks/*/hook.sh. Provides `registry_match`.
# Exits 0 if $CLAUDE_PROJECT_DIR matches a project in registry.yaml,
# 1 otherwise. DIDIO_HOOKS_DISABLE_FILTER=1 bypasses the filter.
# NOTE: path comparison is exact — no trailing slash normalization.
# Claude Code sets CLAUDE_PROJECT_DIR without trailing slash; keep it that way.

registry_match() {
  [ "${DIDIO_HOOKS_DISABLE_FILTER:-0}" = "1" ] && return 0

  local target="${CLAUDE_PROJECT_DIR:-}"
  [ -z "$target" ] && return 1

  local hub="${SECOND_BRAIN_HUB:-$HOME/second-brain}"
  local registry="$hub/projects/registry.yaml"
  [ -f "$registry" ] || return 1

  awk -v target="$target" '
    /^    path:/ {
      val=$0
      sub(/^    path: */, "", val)
      sub(/#.*$/, "", val)
      gsub(/[ \t]+$/, "", val)
      gsub(/^[ \t]+/, "", val)
      if (val == target) { found=1 }
    }
    END { exit (found ? 0 : 1) }
  ' "$registry"
}
