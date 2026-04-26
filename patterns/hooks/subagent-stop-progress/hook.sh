#!/usr/bin/env bash
# type: hook
# tags: discord, observability, subagent, stop, progress
# Fires a Discord progress notification when a subagent finishes (SubagentStop).
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

WEBHOOK="${DISCORD_WEBHOOK_PROGRESS:-}"
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

# Determine role. Primary source: the sibling ".meta.json" sidecar that
# Claude Code writes next to every subagent transcript — contains the
# authoritative `agentType`. Fallback: grep last `subagent_type` inside the
# transcript body (only reliable when it happens to appear in content).
STDIN_DATA=""
if [ ! -t 0 ]; then STDIN_DATA="$(cat)"; fi

TRANSCRIPT_PATH=""
if [ -n "$STDIN_DATA" ]; then
  TRANSCRIPT_PATH="$(printf '%s' "$STDIN_DATA" \
    | grep -oE '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | head -n1 \
    | sed -E 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
fi

ROLE=""
if [ -n "$TRANSCRIPT_PATH" ]; then
  META_PATH="${TRANSCRIPT_PATH%.jsonl}.meta.json"
  if [ -r "$META_PATH" ]; then
    ROLE="$(grep -oE '"agentType"[[:space:]]*:[[:space:]]*"[^"]+"' "$META_PATH" 2>/dev/null \
      | head -n1 \
      | sed -E 's/.*"agentType"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
  fi
  if [ -z "$ROLE" ] && [ -r "$TRANSCRIPT_PATH" ]; then
    ROLE="$(grep -oE '"subagent_type"[[:space:]]*:[[:space:]]*"[^"]+"' "$TRANSCRIPT_PATH" 2>/dev/null \
      | tail -n1 \
      | sed -E 's/.*"subagent_type"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
  fi
fi

ROLE="${ROLE:-unknown}"

# --- F14: feature-context enrichment ---
_FC_HUB="${SECOND_BRAIN_HUB:-$HOME/second-brain}"
PHASE="" FEATURE="" TASK="" WAVE="" STATUS=""
TASK_DESC="" PHASE_VALUE="" FEATURE_VALUE="" TASK_FILE=""
fields_arr=()

if [ -f "$HOOK_DIR/../_lib/feature-context.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/feature-context.sh"
fi

if command -v phase_for_role >/dev/null 2>&1; then
  PHASE="$(phase_for_role "$ROLE" 2>/dev/null || true)"
  FEATURE="$(detect_active_feature 2>/dev/null || true)"
  if [ -n "$FEATURE" ] && command -v detect_active_task >/dev/null 2>&1; then
    TASK="$(detect_active_task "$FEATURE" 2>/dev/null || true)"
  fi
fi

if [ -n "$PHASE" ] && [ -n "$ROLE" ] && [ "$ROLE" != "unknown" ]; then
  PHASE_VALUE="$PHASE ($ROLE)"
fi

if [ -n "$FEATURE" ]; then
  _feat_dir="$(ls -dt "$_FC_HUB"/tasks/features/"$FEATURE"-*/ 2>/dev/null | head -n1)"
  if [ -n "$_feat_dir" ]; then
    _fc_slug="$(basename "$_feat_dir" | sed -E "s/^${FEATURE}-//")"
    FEATURE_VALUE="$FEATURE — $_fc_slug"
  else
    FEATURE_VALUE="$FEATURE"
  fi
fi

if [ -n "$FEATURE" ] && [ -n "$TASK" ]; then
  TASK_FILE="$(ls -t "$_FC_HUB"/tasks/features/"$FEATURE"-*/"${TASK}".md 2>/dev/null | head -n1)"
fi
if [ -n "$TASK_FILE" ] && [ -r "$TASK_FILE" ] && command -v detect_task_wave >/dev/null 2>&1; then
  WAVE="$(detect_task_wave "$TASK_FILE" 2>/dev/null || true)"
  STATUS="$(detect_task_status "$TASK_FILE" 2>/dev/null || true)"
fi

ACTIVITY=""
if [ -n "$FEATURE" ] && command -v summarize_last_wave_activity >/dev/null 2>&1; then
  ACTIVITY="$(summarize_last_wave_activity "$FEATURE" 2>/dev/null || true)"
fi

if [ -n "$TASK" ]; then
  TASK_DESC="$TASK"
  if [ -n "$WAVE" ] && [ -n "$STATUS" ]; then
    TASK_DESC="$TASK (wave $WAVE · $STATUS)"
  elif [ -n "$WAVE" ]; then
    TASK_DESC="$TASK (wave $WAVE)"
  elif [ -n "$STATUS" ]; then
    TASK_DESC="$TASK ($STATUS)"
  fi
fi
# --- end F14 ---

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

safe_project="$(printf '%s' "$PROJECT_NAME" | sed 's/"/\\"/g')"
safe_role="$(printf '%s' "$ROLE" | sed 's/"/\\"/g')"

build_field() {
  local _name="$1" _value="$2"
  [ -z "$_value" ] && return 0
  local _safe
  _safe="$(printf '%s' "$_value" | sed 's/\\/\\\\/g;s/"/\\"/g')"
  printf '{"name":"%s","value":"%s","inline":true}' "$_name" "$_safe"
}

_f=""
_f="$(build_field "Phase" "$PHASE_VALUE")"; [ -n "$_f" ] && fields_arr+=("$_f")
_f="$(build_field "Feature" "$FEATURE_VALUE")"; [ -n "$_f" ] && fields_arr+=("$_f")
_f="$(build_field "Task" "$TASK_DESC")"; [ -n "$_f" ] && fields_arr+=("$_f")
_f="$(build_field "Activity" "$ACTIVITY")"; [ -n "$_f" ] && fields_arr+=("$_f")
fields_arr+=("{\"name\":\"project\",\"value\":\"$safe_project\",\"inline\":true}")

IFS=','; fields_json="${fields_arr[*]}"; unset IFS

PAYLOAD="$(printf '{"embeds":[{"title":"⚙️ subagent finished","description":"Role: %s","color":3447003,"fields":[%s],"timestamp":"%s"}]}' "$safe_role" "$fields_json" "$TIMESTAMP")"

curl --silent --show-error --max-time 5 \
  -X POST \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "$WEBHOOK" > /dev/null 2>&1 || true

exit 0
