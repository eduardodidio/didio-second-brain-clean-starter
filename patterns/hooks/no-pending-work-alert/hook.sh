#!/usr/bin/env bash
# type: hook
# tags: discord, observability, stop, alert, no-work
# F17: posts a Discord warn embed at most once per day when the hub
# has zero features with Status: planned/in_progress.
# Fire-and-forget. Uses set -u but NOT set -e.

set -u

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HOOK_DIR/../_lib/load-env.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/load-env.sh"
  load_hub_env
fi

DISCORD_ENABLED="${DISCORD_ENABLED:-true}"
[ "$DISCORD_ENABLED" = "false" ] && exit 0

WEBHOOK="${DISCORD_WEBHOOK_ALERTS:-}"
[ -z "$WEBHOOK" ] && exit 0

# F05b registry filter
if [ -f "$HOOK_DIR/../_lib/registry-match.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/registry-match.sh"
  registry_match || exit 0
fi

# F17 helpers
if [ -f "$HOOK_DIR/../_lib/no-pending-work.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/no-pending-work.sh"
else
  exit 0  # helper missing → skip
fi
if [ -f "$HOOK_DIR/../_lib/feature-context.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/feature-context.sh"
fi

# Gate 1: do we have pending work?
if has_pending_work; then exit 0; fi

# Gate 2: lockfile idempotência (1×/day per project).
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${HOME}/.claude-fallback}"
LOCKFILE="${PROJECT_DIR}/.claude/last-no-pending-work-alert.txt"
should_alert_no_work_today "$LOCKFILE" || exit 0

# Build embed
PROJECT_NAME="${CLAUDE_PROJECT_NAME:-$(basename "$PROJECT_DIR")}"
TIMESTAMP="$(date -u +%FT%TZ)"

LAST_FEATURE=""
if command -v detect_active_feature >/dev/null 2>&1; then
  FEATURE_ID="$(detect_active_feature 2>/dev/null || true)"
  if [ -n "$FEATURE_ID" ]; then
    _FC_HUB="${SECOND_BRAIN_HUB:-$HOME/second-brain}"
    FEAT_DIR="$(ls -dt "$_FC_HUB"/tasks/features/"$FEATURE_ID"-*/ 2>/dev/null | head -n1)"
    if [ -n "$FEAT_DIR" ]; then
      slug="$(basename "$FEAT_DIR" | sed -E "s/^${FEATURE_ID}-//")"
      LAST_FEATURE="$FEATURE_ID — $slug"
    else
      LAST_FEATURE="$FEATURE_ID"
    fi
  fi
fi

# Use build_field() + array pattern (F14) to avoid trailing-comma bugs
build_field() {
  local _name="$1" _value="$2"
  [ -z "$_value" ] && return 0
  local _safe_name _safe_value
  _safe_name="$(printf '%s' "$_name" | sed 's/"/\\"/g')"
  _safe_value="$(printf '%s' "$_value" | sed 's/\\/\\\\/g;s/"/\\"/g')"
  printf '{"name":"%s","value":"%s","inline":true}' "$_safe_name" "$_safe_value"
}

fields_arr=()
fields_arr+=("$(build_field "project" "$PROJECT_NAME")")
f="$(build_field "Last feature" "$LAST_FEATURE")"; [ -n "$f" ] && fields_arr+=("$f")
IFS=','; fields_json="${fields_arr[*]}"; unset IFS

PAYLOAD="$(printf '{"embeds":[{"title":"⚠️ project idle — no pending work","description":"Last feature has Status: done. Plan more or close out.","color":15844367,"fields":[%s],"timestamp":"%s"}]}' "$fields_json" "$TIMESTAMP")"

curl --silent --show-error --max-time 5 \
  -X POST \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "$WEBHOOK" > /dev/null 2>&1 || true

# Mark alerted (even on curl failure to avoid retry-spam on Discord downtime)
mark_alerted_today "$LOCKFILE"

exit 0
