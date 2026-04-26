#!/usr/bin/env bash
# _bootstrap/scripts/digest-pending.sh
# Cron safety wrapper for memory.digest_pending.
#
# Invokes the CLI helper once per day to recover any drops that were not
# absorbed by a hook (e.g. Stop event interrupted, Discord/MCP unavailable,
# FS momentarily read-only).
#
# Schedule via launchd (macOS user agent):
#   ~/Library/LaunchAgents/com.didio.digest-pending.plist
#   <ProgramArguments>$HOME/second-brain/_bootstrap/scripts/digest-pending.sh</ProgramArguments>
#   <StartCalendarInterval><Hour>3</Hour><Minute>30</Minute></StartCalendarInterval>
#
# Or via cron:
#   30 3 * * *  $HOME/second-brain/_bootstrap/scripts/digest-pending.sh
#
# Flags:
#   --dry-run           classify and report only; do not absorb drops
#   --project=<name>    scope to a single project from projects/registry.yaml
#   --max=<n>           limit entries processed in one run
#   --verbose           print full JSON result in addition to summary line

set -u
set -o pipefail

# ── argument parsing ──────────────────────────────────────────────────────────
DRY_RUN=false
PROJECT=
MAX=
VERBOSE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --project=*)
      PROJECT="${1#--project=}"
      shift
      ;;
    --max=*)
      MAX="${1#--max=}"
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    *) shift ;;
  esac
done

# ── hub root resolution ───────────────────────────────────────────────────────
# Script lives in _bootstrap/scripts/ — two levels up is the hub root.
HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

[ -d "$HUB_ROOT" ] || { echo "digest-pending: hub root not found; aborting" >&2; exit 1; }

# ── CLI helper check ──────────────────────────────────────────────────────────
CLI_PATH="$HUB_ROOT/mcp-server/src/cli/digest-pending-cli.ts"

if [ ! -f "$CLI_PATH" ]; then
  echo "digest-pending: CLI helper not found: $CLI_PATH" >&2
  echo "digest-pending: install T08 (F16) to create the CLI helper before running this script." >&2
  exit 1
fi

# ── build CLI args ────────────────────────────────────────────────────────────
CLI_ARGS=()
[ "$DRY_RUN" = "true" ]  && CLI_ARGS+=("--dry-run")
[ -n "$PROJECT" ]         && CLI_ARGS+=("--project=$PROJECT")
[ -n "$MAX" ]             && CLI_ARGS+=("--max=$MAX")

# ── invoke CLI ────────────────────────────────────────────────────────────────
CLI_OUTPUT=
CLI_EXIT=0
CLI_OUTPUT=$(bun run "$CLI_PATH" "${CLI_ARGS[@]}" 2>&1) || CLI_EXIT=$?

if [ "$CLI_EXIT" -ne 0 ]; then
  echo "digest-pending: CLI exited with code $CLI_EXIT" >&2
  [ -n "$CLI_OUTPUT" ] && echo "$CLI_OUTPUT" >&2
  exit 1
fi

# ── parse JSON counters (zero-dep: grep + sed) ────────────────────────────────
_field() {
  local field="$1"
  echo "$CLI_OUTPUT" | grep -oE "\"$field\"[[:space:]]*:[[:space:]]*[0-9]+" \
    | grep -oE '[0-9]+$' \
    | head -n1 \
    || echo 0
}

PROCESSED=$(_field processed)
CLASSIFIED=$(_field classified)
FILTERED=$(_field filtered)
DEDUPED=$(_field deduped)
ABSORBED=$(_field absorbed)
ERRORS=$(_field errors)

# ── summary line (always printed) ────────────────────────────────────────────
SUMMARY="digest-pending: processed=${PROCESSED} classified=${CLASSIFIED} filtered=${FILTERED} deduped=${DEDUPED} absorbed=${ABSORBED} errors=${ERRORS}"
echo "$SUMMARY"

# ── verbose: full JSON ────────────────────────────────────────────────────────
if [ "$VERBOSE" = "true" ]; then
  echo "$CLI_OUTPUT"
fi

# ── log append ────────────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +%FT%TZ)
LOG_FILE="$HUB_ROOT/logs/digest-pending.log"
echo "$TIMESTAMP | $SUMMARY" >> "$LOG_FILE" 2>/dev/null || true

exit 0
