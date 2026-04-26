#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"
require_jq

usage() {
  local code="${1:-1}"
  cat >&2 <<'USAGE'
Usage: install-discord-hooks.sh (--user-scope | --project <path>) [--dry-run]

  --user-scope       Install hooks into ~/.claude/settings.json
  --project <path>   Install hooks into <path>/.claude/settings.json
  --dry-run          Print what would change; do not modify target

Modes --user-scope and --project are mutually exclusive.
USAGE
  exit "$code"
}

MODE="" PROJECT="" DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --user-scope)
      if [ -n "$MODE" ]; then
        echo "Error: --user-scope and --project are mutually exclusive" >&2
        exit 1
      fi
      MODE="user" ;;
    --project)
      if [ -n "$MODE" ]; then
        echo "Error: --user-scope and --project are mutually exclusive" >&2
        exit 1
      fi
      shift
      if [ $# -eq 0 ] || [ -z "${1:-}" ]; then
        echo "Error: --project requires a path argument" >&2
        exit 64
      fi
      PROJECT="$1"
      MODE="project" ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "Error: unknown option '$1'" >&2; exit 64 ;;
  esac
  shift
done

if [ -z "$MODE" ]; then
  echo "Error: one of --user-scope or --project <path> is required" >&2
  exit 1
fi

# Resolve target settings path
if [ "$MODE" = "user" ]; then
  TARGET_SETTINGS="${HOME}/.claude/settings.json"
  mkdir -p "${HOME}/.claude"
else
  if [ ! -d "$PROJECT" ]; then
    log error "project path is not a directory: $PROJECT"
    exit 1
  fi
  PROJECT="$(cd "$PROJECT" && pwd)"
  mkdir -p "$PROJECT/.claude"
  TARGET_SETTINGS="$PROJECT/.claude/settings.json"
fi

# Validate pre-existing JSON
if [ -f "$TARGET_SETTINGS" ]; then
  if ! jq empty "$TARGET_SETTINGS" 2>/dev/null; then
    log error "invalid JSON in target: $TARGET_SETTINGS"
    exit 3
  fi
fi

# Hook source definitions: <subdir>:<event-key>
HOOK_DEFS=(
  "stop-session-summary:Stop"
  "post-tool-use-error:PostToolUse"
  "subagent-stop-progress:SubagentStop"
  "no-pending-work-alert:Stop"
  "rate-limit-alert:Stop"
)

# Validate all source hook.json files exist before writing anything
for def in "${HOOK_DEFS[@]}"; do
  hook_dir="${def%%:*}"
  src="$SYNC_HUB_DIR/patterns/hooks/$hook_dir/hook.json"
  if [ ! -f "$src" ]; then
    log error "hook source absent: $src"
    exit 4
  fi
done

# Validate required hub helper libs before writing anything
REQUIRED_LIBS=(
  "_lib/load-env.sh"
  "_lib/registry-match.sh"
  "_lib/feature-context.sh"
  "_lib/no-pending-work.sh"
  "_lib/rate-limit-detect.sh"
)
for lib in "${REQUIRED_LIBS[@]}"; do
  if [ ! -f "$SYNC_HUB_DIR/patterns/hooks/$lib" ]; then
    log error "hook helper absent in hub: $SYNC_HUB_DIR/patterns/hooks/$lib"
    exit 4
  fi
done

# Atomically merge one hook entry into a settings file
_merge_entry() {
  local file="$1" event="$2" entry="$3"
  local tmp
  tmp="$(mktemp)"
  if [ ! -f "$file" ]; then echo '{}' > "$file"; fi
  jq --argjson entry "$entry" --arg event "$event" \
    '.hooks |= (. // {}) |
     .hooks[$event] |= (. // []) |
     .hooks[$event] += [$entry]' \
    "$file" > "$tmp" \
    && mv "$tmp" "$file" \
    || { rm -f "$tmp"; return 1; }
}

# Set up dry-run work file
DRY_WORK_FILE=""
_cleanup_dry() { [ -n "$DRY_WORK_FILE" ] && rm -f "$DRY_WORK_FILE" || true; }
trap _cleanup_dry EXIT

if [ "$DRY_RUN" = "1" ]; then
  DRY_WORK_FILE="$(mktemp)"
  if [ -f "$TARGET_SETTINGS" ]; then
    cp "$TARGET_SETTINGS" "$DRY_WORK_FILE"
  else
    echo '{}' > "$DRY_WORK_FILE"
  fi
fi

BACKED_UP=0

install_hook() {
  local hook_dir="$1" event="$2"
  local src="$SYNC_HUB_DIR/patterns/hooks/$hook_dir/hook.json"

  # Extract entry with $CLAUDE_PROJECT_DIR replaced by SYNC_HUB_DIR.
  # Use [$] in regex to match literal $ without bash expansion issues.
  local entry
  entry="$(jq --arg hub "$SYNC_HUB_DIR" --arg event "$event" \
    '.hooks[$event][0] | .hooks[0].command |= gsub("[$]CLAUDE_PROJECT_DIR"; $hub)' \
    "$src")"

  local target_file
  if [ "$DRY_RUN" = "1" ]; then
    target_file="$DRY_WORK_FILE"
  else
    target_file="$TARGET_SETTINGS"
  fi

  # Idempotency: check matcher + hooks[0].command against existing entries
  local entry_matcher entry_command
  entry_matcher="$(printf '%s' "$entry" | jq -r '.matcher')"
  entry_command="$(printf '%s' "$entry" | jq -r '.hooks[0].command')"

  if [ -f "$target_file" ]; then
    local count
    count="$(jq --arg m "$entry_matcher" --arg c "$entry_command" --arg event "$event" \
      '.hooks[$event] // [] | map(select(.matcher == $m and .hooks[0].command == $c)) | length' \
      "$target_file" 2>/dev/null || echo 0)"
    if [ "${count:-0}" -gt 0 ] 2>/dev/null; then
      log info "$event hook already installed"
      return 0
    fi
  fi

  # Backup before first write (non-dry-run, once per execution)
  if [ "$DRY_RUN" = "0" ] && [ "$BACKED_UP" = "0" ]; then
    backup_file "$TARGET_SETTINGS" >/dev/null 2>&1 || true
    BACKED_UP=1
  fi

  _merge_entry "$target_file" "$event" "$entry"
  log info "$event hook installed"
}

for def in "${HOOK_DEFS[@]}"; do
  hook_dir="${def%%:*}"
  event="${def##*:}"
  install_hook "$hook_dir" "$event"
done

# Dry-run: show diff and exit (cleanup via trap)
if [ "$DRY_RUN" = "1" ]; then
  if [ -f "$TARGET_SETTINGS" ]; then
    diff "$TARGET_SETTINGS" "$DRY_WORK_FILE" || true
  else
    echo "--- /dev/null"
    echo "+++ $TARGET_SETTINGS (would be created)"
    cat "$DRY_WORK_FILE"
  fi
  exit 0
fi

log info "done: discord hooks installed into $TARGET_SETTINGS"
exit 0
