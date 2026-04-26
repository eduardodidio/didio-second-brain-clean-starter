#!/usr/bin/env bash
# type: hook
# tags: discord, observability, post-tool-use, error, bash
# Fires a Discord alert when a Bash tool call fails (exit_code != 0).
# Reads Claude Code PostToolUse event from stdin (JSON, best-effort parse).
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

WEBHOOK="${DISCORD_WEBHOOK_ALERTS:-}"
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

# Read stdin (PostToolUse event JSON)
STDIN_DATA=""
if [ -t 0 ]; then
  # No stdin piped; nothing to parse
  exit 0
fi
STDIN_DATA="$(cat)"

if [ -z "$STDIN_DATA" ]; then
  exit 0
fi

# Best-effort parse: no jq dependency
TOOL_NAME="$(printf '%s' "$STDIN_DATA" | grep -oE '"tool_name":"[^"]+"' | grep -oE '"[^"]+"\s*$' | tr -d '"' | tr -d ' ' || true)"

if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

EXIT_CODE="$(printf '%s' "$STDIN_DATA" | grep -oE '"exit_code":[0-9]+' | grep -oE '[0-9]+$' || true)"

if [ -z "$EXIT_CODE" ] || [ "$EXIT_CODE" = "0" ]; then
  exit 0
fi

# --- F14: source feature-context.sh after Bash/non-zero early-exits ---
if [ -f "$HOOK_DIR/../_lib/feature-context.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOOK_DIR/../_lib/feature-context.sh"
fi
# helper ausente → feature detection skipped below via command -v guard
# --- end F14 source ---

# Detect role via transcript_path (reuses STDIN_DATA already captured — no re-read)
TRANSCRIPT_PATH="$(printf '%s' "$STDIN_DATA" \
  | grep -oE '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | head -n1 \
  | sed -E 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"

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
# Empty ROLE = main session (not a subagent); Phase field will be omitted.
# NOTE: role-from-transcript logic is intentionally duplicated from F08 here;
# extracting to _lib/role-from-transcript.sh is a follow-up cleanup task.
ROLE="${ROLE:-}"

# Detect feature/task/phase (best-effort; each call guarded by || true)
FEATURE=""; TASK=""; WAVE=""; STATUS=""
TASK_DESC=""; FEATURE_VALUE=""; PHASE=""; PHASE_VALUE=""
if command -v detect_active_feature >/dev/null 2>&1; then
  PHASE="$(phase_for_role "$ROLE" 2>/dev/null || true)"
  if [ -n "$PHASE" ] && [ -n "$ROLE" ]; then
    PHASE_VALUE="$PHASE ($ROLE)"
  fi
  FEATURE="$(detect_active_feature 2>/dev/null || true)"
  if [ -n "$FEATURE" ]; then
    _FC_HUB="${SECOND_BRAIN_HUB:-$HOME/second-brain}"
    FEAT_DIR="$(ls -dt "$_FC_HUB"/tasks/features/"$FEATURE"-*/ 2>/dev/null | head -n1)"
    slug=""
    [ -n "$FEAT_DIR" ] && slug="$(basename "$FEAT_DIR" | sed -E "s/^${FEATURE}-//")"
    FEATURE_VALUE="$FEATURE${slug:+ — $slug}"
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

# Extract first line of stderr (best-effort)
STDERR_LINE="$(printf '%s' "$STDIN_DATA" | grep -oE '"stderr":"[^"]*"' | sed 's/"stderr":"//;s/"$//' | head -c 200 || true)"

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

safe_stderr="$(printf '%s' "$STDERR_LINE" | sed 's/"/\\"/g')"
safe_title="$(printf '⚠️ Bash tool failed (exit %s)' "$EXIT_CODE")"

# Build fields array (conditional — empty values omitted)
build_field() {
  local name="$1" value="$2"
  [ -z "$value" ] && return 0
  local safe_value
  safe_value="$(printf '%s' "$value" | sed 's/\\/\\\\/g;s/"/\\"/g')"
  printf '{"name":"%s","value":"%s","inline":true}' "$name" "$safe_value"
}

fields_arr=()
f="$(build_field Phase "$PHASE_VALUE")"; [ -n "$f" ] && fields_arr+=("$f")
f="$(build_field Feature "$FEATURE_VALUE")"; [ -n "$f" ] && fields_arr+=("$f")
f="$(build_field Task "$TASK_DESC")"; [ -n "$f" ] && fields_arr+=("$f")
fields_arr+=("$(build_field project "$PROJECT_NAME")")
IFS=','; fields_json="${fields_arr[*]}"; unset IFS

PAYLOAD="$(printf '{"embeds":[{"title":"%s","description":"%s","color":16711680,"fields":[%s],"timestamp":"%s"}]}' "$safe_title" "$safe_stderr" "$fields_json" "$TIMESTAMP")"

curl --silent --show-error --max-time 5 \
  -X POST \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "$WEBHOOK" > /dev/null 2>&1 || true

exit 0
