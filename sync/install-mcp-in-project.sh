#!/usr/bin/env bash
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

usage() { echo "Usage: $0 <target-project-path> [--dry-run]" >&2; exit 64; }

require_jq

TARGET=""; DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    -*) usage ;;
    *)  [ -z "$TARGET" ] && TARGET="$1" || usage ;;
  esac
  shift
done
[ -n "$TARGET" ] || usage
[ -d "$TARGET" ] || { log error "target not a directory: $TARGET"; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"

CLAUDE_DIR="$TARGET/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

MCP_EXPR=".mcpServers |= (. // {}) | .mcpServers[\"second-brain\"] = {\"command\": \"bun\", \"args\": [\"run\", \"${SYNC_HUB_DIR}/mcp-server/src/index.ts\"], \"env\": {}}"

# Validate existing JSON before doing anything
if [ -f "$SETTINGS" ]; then
  if ! jq '.' "$SETTINGS" > /dev/null 2>&1; then
    log error "settings.json contains invalid JSON: $SETTINGS"
    exit 3
  fi
fi

# Idempotence: skip if second-brain already configured identically
if [ -f "$SETTINGS" ] && jq -e \
  '(.mcpServers["second-brain"].command == "bun") and (.mcpServers["second-brain"].args[1] | endswith("mcp-server/src/index.ts"))' \
  "$SETTINGS" > /dev/null 2>&1; then
  log info "no changes — second-brain MCP already configured in $SETTINGS"
  exit 0
fi

# Compute expected output
EXPECTED_TMP="$(mktemp)"
trap 'rm -f "$EXPECTED_TMP"' EXIT

if [ -f "$SETTINGS" ]; then
  jq "$MCP_EXPR" "$SETTINGS" > "$EXPECTED_TMP"
else
  echo '{}' | jq "$MCP_EXPR" > "$EXPECTED_TMP"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log info "[dry-run] no changes written to disk"
  if [ -f "$SETTINGS" ]; then
    diff -u "$SETTINGS" "$EXPECTED_TMP" || true
  else
    diff -u /dev/null "$EXPECTED_TMP" || true
  fi
  exit 0
fi

# Apply
mkdir -p "$CLAUDE_DIR"
if [ -f "$SETTINGS" ]; then
  backup_file "$SETTINGS" > /dev/null
fi
jq_merge_into "$SETTINGS" "$MCP_EXPR"
log info "installed second-brain MCP in $SETTINGS"
registry_mark_integrated "$TARGET"
log info "done"
