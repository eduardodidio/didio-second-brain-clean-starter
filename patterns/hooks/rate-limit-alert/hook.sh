#!/usr/bin/env bash
# type: hook
# tags: discord, observability, stop, alert, rate-limit
# F17: posts a Discord error embed when the Stop transcript shows a
# rate-limit / usage-limit marker. Includes ETA for resumption.
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
if [ -f "$HOOK_DIR/../_lib/rate-limit-detect.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/rate-limit-detect.sh"
else
  exit 0
fi
if [ -f "$HOOK_DIR/../_lib/feature-context.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/feature-context.sh"
fi

# Read Stop event payload from stdin and extract transcript_path.
STDIN_DATA=""
[ ! -t 0 ] && STDIN_DATA="$(cat)"

TRANSCRIPT_PATH=""
if [ -n "$STDIN_DATA" ]; then
  TRANSCRIPT_PATH="$(printf '%s' "$STDIN_DATA" \
    | grep -oE '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | head -n1 \
    | sed -E 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
fi

# Gate: rate-limit marker present?
[ -n "$TRANSCRIPT_PATH" ] || exit 0
[ -r "$TRANSCRIPT_PATH" ] || exit 0
MARKER="$(detect_rate_limit_marker "$TRANSCRIPT_PATH")"
[ "$MARKER" = "yes" ] || exit 0

# Compute ETA (always non-empty; falls back to now+5h).
ETA="$(compute_eta_iso "$TRANSCRIPT_PATH" 2>/dev/null || true)"

# Feature/task context (best-effort).
FEATURE=""
TASK=""
if command -v detect_active_feature >/dev/null 2>&1; then
  FEATURE="$(detect_active_feature 2>/dev/null || true)"
  if [ -n "$FEATURE" ] && command -v detect_active_task >/dev/null 2>&1; then
    TASK="$(detect_active_task "$FEATURE" 2>/dev/null || true)"
  fi
fi

PROJECT_NAME="${CLAUDE_PROJECT_NAME:-$(basename "${CLAUDE_PROJECT_DIR:-$(pwd)}")}"
TIMESTAMP="$(date -u +%FT%TZ)"

# Helper: build a single field, skip when value is empty.
build_field() {
  local name="$1" value="$2"
  [ -z "$value" ] && return 0
  local safe
  safe="$(printf '%s' "$value" | sed 's/\\/\\\\/g;s/"/\\"/g')"
  printf '{"name":"%s","value":"%s","inline":true}' "$name" "$safe"
}

fields_arr=()
fields_arr+=("$(build_field "project" "$PROJECT_NAME")")
[ -n "$ETA" ]     && fields_arr+=("$(build_field "ETA" "$ETA")")
[ -n "$FEATURE" ] && fields_arr+=("$(build_field "Feature" "$FEATURE")")
[ -n "$TASK" ]    && fields_arr+=("$(build_field "Task" "$TASK")")

IFS=','; fields_json="${fields_arr[*]}"; unset IFS

PAYLOAD="$(printf '{"embeds":[{"title":"🛑 session interrupted — token limit","description":"Claude Code session ended due to a usage/rate limit. Work paused until reset window.","color":15158332,"fields":[%s],"timestamp":"%s"}]}' "$fields_json" "$TIMESTAMP")"

curl --silent --show-error --max-time 5 \
  -X POST \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "$WEBHOOK" > /dev/null 2>&1 || true

exit 0
