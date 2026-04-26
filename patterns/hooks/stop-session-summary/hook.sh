#!/usr/bin/env bash
# type: hook
# tags: discord, observability, stop, session
# Fires a Discord notification when a Claude Code session ends (Stop event).
# Fire-and-forget: never fails the session. Uses set -u but NOT set -e.

set -u

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$HOOK_DIR/../_lib/load-env.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/load-env.sh"
  load_hub_env
fi

DISCORD_ENABLED="${DISCORD_ENABLED:-true}"
if [ "$DISCORD_ENABLED" = "false" ]; then
  exit 0
fi

WEBHOOK="${DISCORD_WEBHOOK_DONE:-}"
if [ -z "$WEBHOOK" ]; then
  exit 0
fi

# --- F05b: filtro CLAUDE_PROJECT_DIR via registry ---
if [ -f "$HOOK_DIR/../_lib/registry-match.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/registry-match.sh"
  if ! registry_match; then exit 0; fi
fi
# helper ausente → comportamento pré-F05b (sem filtro, alerta todos)
# --- end F05b filtro ---

if [ -f "$HOOK_DIR/../_lib/feature-context.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/feature-context.sh"
fi

PROJECT_NAME="${CLAUDE_PROJECT_NAME:-}"
if [ -z "$PROJECT_NAME" ]; then
  PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"
  if [ -n "$PROJECT_DIR" ]; then
    PROJECT_NAME="$(basename "$PROJECT_DIR")"
  else
    PROJECT_NAME="$(basename "$(pwd)")"
  fi
fi

TIMESTAMP="$(date -u +%FT%TZ)"

FEATURE=""
TASK=""
WAVE=""
STATUS=""
TASK_DESC=""
FEATURE_VALUE=""
FEAT_DIR=""
slug=""
TASK_FILE=""
_FC_HUB=""

if command -v detect_active_feature >/dev/null 2>&1; then
  FEATURE="$(detect_active_feature 2>/dev/null || true)"
  if [ -n "$FEATURE" ]; then
    _FC_HUB="${SECOND_BRAIN_HUB:-$HOME/second-brain}"
    FEAT_DIR="$(ls -dt "$_FC_HUB"/tasks/features/"$FEATURE"-*/ 2>/dev/null | head -n1)"
    if [ -n "$FEAT_DIR" ]; then
      slug="$(basename "$FEAT_DIR" | sed -E "s/^${FEATURE}-//")"
      FEATURE_VALUE="$FEATURE — $slug"
    else
      FEATURE_VALUE="$FEATURE"
    fi
    TASK="$(detect_active_task 2>/dev/null || true)"
    if [ -n "$TASK" ]; then
      TASK_FILE="$(ls -t "$_FC_HUB"/tasks/features/"$FEATURE"-*/${TASK}.md 2>/dev/null | head -n1)"
      if [ -n "$TASK_FILE" ] && [ -r "$TASK_FILE" ]; then
        WAVE="$(detect_task_wave "$TASK_FILE" 2>/dev/null || true)"
        STATUS="$(detect_task_status "$TASK_FILE" 2>/dev/null || true)"
      fi
      TASK_DESC="$TASK"
      if [ -n "$WAVE" ] && [ -n "$STATUS" ]; then
        TASK_DESC="$TASK (wave $WAVE · $STATUS)"
      elif [ -n "$WAVE" ]; then
        TASK_DESC="$TASK (wave $WAVE)"
      elif [ -n "$STATUS" ]; then
        TASK_DESC="$TASK ($STATUS)"
      fi
    fi
  fi
fi

build_field() {
  local _name="$1" _value="$2" _inline="${3:-true}"
  local _safe_name _safe_value
  _safe_name="$(printf '%s' "$_name" | sed 's/"/\\"/g')"
  _safe_value="$(printf '%s' "$_value" | sed 's/\\/\\\\/g;s/"/\\"/g')"
  printf '{"name":"%s","value":"%s","inline":%s}' "$_safe_name" "$_safe_value" "$_inline"
}

fields_arr=()
fields_arr+=("$(build_field "project" "$PROJECT_NAME")")
if [ -n "$FEATURE_VALUE" ]; then
  fields_arr+=("$(build_field "Feature" "$FEATURE_VALUE")")
fi
if [ -n "$TASK_DESC" ]; then
  fields_arr+=("$(build_field "Task" "$TASK_DESC")")
fi

fields_json=""
f=""
for f in "${fields_arr[@]}"; do
  if [ -n "$fields_json" ]; then
    fields_json="$fields_json,$f"
  else
    fields_json="$f"
  fi
done

PAYLOAD="$(printf '{"embeds":[{"title":"✅ session ended","description":"Claude Code session finished","color":3066993,"fields":[%s],"timestamp":"%s"}]}' "$fields_json" "$TIMESTAMP")"

curl --silent --show-error --max-time 5 \
  -X POST \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "$WEBHOOK" > /dev/null 2>&1 || true

exit 0
