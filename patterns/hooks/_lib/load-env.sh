#!/usr/bin/env bash
# patterns/hooks/_lib/load-env.sh
# Sourced by patterns/hooks/*/hook.sh. Provides `load_hub_env`.
#
# Claude Code hooks run with the env Claude Code itself inherited, which does
# NOT include the hub's .env. Without this helper, DISCORD_* vars are empty
# and every hook silent-exits at the `[ -z "$WEBHOOK" ]` guard.
#
# Only DISCORD_* keys are pulled from .env (whitelist) to avoid executing
# anything unexpected. Existing env values win — never override.
# Override hub path via SECOND_BRAIN_HUB.

load_hub_env() {
  local hub="${SECOND_BRAIN_HUB:-$HOME/second-brain}"
  local env_file="$hub/.env"
  [ -f "$env_file" ] || return 0

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      DISCORD_*=*)
        key="${line%%=*}"
        if [ -z "${!key:-}" ]; then
          value="${line#*=}"
          value="${value%\"}"; value="${value#\"}"
          value="${value%\'}"; value="${value#\'}"
          export "$key=$value"
        fi
        ;;
    esac
  done < "$env_file"
}
