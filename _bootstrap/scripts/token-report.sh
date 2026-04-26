#!/usr/bin/env bash
# _bootstrap/scripts/token-report.sh
# F15: daily token usage + economy report.
# Fire-and-forget: always exits 0. Pure bash + jq.
# Flags:
#   --dry-run                skip curl + skip file write; print payload+report to stderr
#   --hub <path>             override HUB_ROOT
#   --transcripts-root <p>   override ~/.claude/projects/
#   --since-hours <n>        default 24
set -u

# ── argument parsing ──────────────────────────────────────────────────────────
DRY_RUN=false
HUB_OVERRIDE=
TROOT_OVERRIDE=
SINCE_HOURS=24

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --hub) HUB_OVERRIDE="${2:-}"; shift 2 ;;
    --transcripts-root) TROOT_OVERRIDE="${2:-}"; shift 2 ;;
    --since-hours) SINCE_HOURS="${2:-24}"; shift 2 ;;
    *) shift ;;
  esac
done

# ── hub root resolution ───────────────────────────────────────────────────────
if [ -n "$HUB_OVERRIDE" ]; then
  HUB_ROOT="$HUB_OVERRIDE"
else
  HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
[ -d "$HUB_ROOT" ] || exit 0

# ── transcripts root ──────────────────────────────────────────────────────────
if [ -n "$TROOT_OVERRIDE" ]; then
  TROOT="$TROOT_OVERRIDE"
else
  TROOT="$HOME/.claude/projects"
fi

# ── load .env (DISCORD_* vars) ────────────────────────────────────────────────
ENV_LIB="$HUB_ROOT/patterns/hooks/_lib/load-env.sh"
if [ -f "$ENV_LIB" ]; then
  # shellcheck source=/dev/null
  . "$ENV_LIB"
  load_hub_env || true
fi

# ── source Wave 1 helpers ─────────────────────────────────────────────────────
. "$HUB_ROOT/_bootstrap/scripts/_lib/token-collector.sh"
. "$HUB_ROOT/_bootstrap/scripts/_lib/token-economy.sh"

# ── pipeline ──────────────────────────────────────────────────────────────────
SINCE_SECONDS=$(( SINCE_HOURS * 3600 ))
TODAY="$(date +%F)"
REPORT_DIR="$HUB_ROOT/memory/token-reports"
REPORT_FILE="$REPORT_DIR/$TODAY.md"

FILES_LIST="$(collect_usage_files "$TROOT" "$SINCE_SECONDS")"
PROJECT_TSV="$(echo "$FILES_LIST" | aggregate_by_project)"
MODEL_TSV="$(echo "$FILES_LIST" | aggregate_by_model)"

# Per-file MCP calls — concat across files
ECON_TSV=""
while IFS=$'\t' read -r path slug mtime; do
  [ -n "$path" ] || continue
  chunk="$(count_secondbrain_calls "$path")"
  [ -n "$chunk" ] && ECON_TSV+="$chunk"$'\n'
done <<< "$FILES_LIST"

# Aggregate per-tool totals across all files before estimating savings.
# Without this, files containing calls to the same tool produce duplicate rows.
ECON_TSV_AGG="$(printf '%s\n' "$ECON_TSV" | awk -F'\t' \
  'NF>=4{cnt[$1]+=$2; bytes[$1]+=$3; billed[$1]+=$4} END{for(n in cnt) print n"\t"cnt[n]"\t"bytes[n]"\t"billed[n]}')"
SAVINGS_TSV="$(printf '%s\n' "$ECON_TSV_AGG" | estimate_savings -)" || true

# ── compute totals from PROJECT_TSV ───────────────────────────────────────────
TOTALS_LINE="$(printf '%s\n' "$PROJECT_TSV" | awk -F'\t' \
  'NF>=7{i+=$3; o+=$4; cr+=$5; cc+=$6; tot+=$7} END{print tot+0"\t"i+0"\t"o+0"\t"cr+0"\t"cc+0}')"
TOTAL="$(printf '%s\n' "$TOTALS_LINE" | cut -f1)"
IN="$(printf '%s\n' "$TOTALS_LINE" | cut -f2)"
OUT="$(printf '%s\n' "$TOTALS_LINE" | cut -f3)"
CR="$(printf '%s\n' "$TOTALS_LINE" | cut -f4)"
CC="$(printf '%s\n' "$TOTALS_LINE" | cut -f5)"

TOTAL="${TOTAL:-0}"
IN="${IN:-0}"
OUT="${OUT:-0}"
CR="${CR:-0}"
CC="${CC:-0}"

# ── build table rows ──────────────────────────────────────────────────────────
PROJECT_ROWS="$(printf '%s\n' "$PROJECT_TSV" | awk -F'\t' \
  'NF>=7{printf "| %s | %d | %d | %d | %d | %d | %d |\n", $1, $2, $7, $3, $4, $5, $6}')"
[ -z "$PROJECT_ROWS" ] && PROJECT_ROWS="| (none) | 0 | 0 | 0 | 0 | 0 | 0 |"

MODEL_ROWS="$(printf '%s\n' "$MODEL_TSV" | awk -F'\t' \
  'NF>=7{printf "| %s | %d | %d | %d | %d | %d | %d |\n", $1, $2, $7, $3, $4, $5, $6}')"
[ -z "$MODEL_ROWS" ] && MODEL_ROWS="| (none) | 0 | 0 | 0 | 0 | 0 | 0 |"

SAVINGS_ROWS="$(printf '%s\n' "$SAVINGS_TSV" | awk -F'\t' \
  'NF>=3{printf "| %s | %d | %d |\n", $1, $2, $3}')"
[ -z "$SAVINGS_ROWS" ] && SAVINGS_ROWS="| (none) | 0 | 0 |"

TOTAL_SAVED="$(printf '%s\n' "$SAVINGS_TSV" | awk -F'\t' 'NF>=3{s+=$3} END{print s+0}')"
TOTAL_SAVED="${TOTAL_SAVED:-0}"

TOP_SOURCES="$(printf '%s\n' "$SAVINGS_TSV" | sort -t"$(printf '\t')" -k3 -rn | head -5 | \
  awk -F'\t' 'NF>=3{printf "- %s: %d calls, %d tokens saved\n", $1, $2, $3}')"
[ -z "$TOP_SOURCES" ] && TOP_SOURCES="_(no second-brain calls detected)_"

# ── render markdown ───────────────────────────────────────────────────────────
REPORT_BODY="$(cat <<REPORT_EOF
# Token usage report — ${TODAY}

Generated by \`_bootstrap/scripts/token-report.sh\` (F15).
Window: last ${SINCE_HOURS} hours.

## Totals

| Total | Input | Output | Cache read | Cache create |
|-------|-------|--------|------------|--------------|
| ${TOTAL} | ${IN} | ${OUT} | ${CR} | ${CC} |

## By project

| Project | Sessions | Total | Input | Output | Cache read | Cache create |
|---|---|---|---|---|---|---|
${PROJECT_ROWS}

## By model

| Model | Calls | Total | Input | Output | Cache read | Cache create |
|---|---|---|---|---|---|---|
${MODEL_ROWS}

## Estimated economy

Heuristic v1 — see [ADR-0009](../../docs/adr/0009-token-economy-estimation.md).
Skills estimate: see ADR-0009 §Limitations (not implemented in v1).

| Source | Calls | Saved tokens (est.) |
|---|---|---|
${SAVINGS_ROWS}

**Total saved (est.):** ${TOTAL_SAVED} tokens

## Top sources by savings

${TOP_SOURCES}

## Notes

- Privacy: this report reads only \`usage.*\`, \`model\`, \`cwd\`,
  \`sessionId\`, and \`tool_use.name\`. No prompt or message content
  is read or persisted (see ADR-0009 §Privacy).
- Coverage: only Claude Code transcripts under \`${TROOT}\` modified
  in the last ${SINCE_HOURS}h.
REPORT_EOF
)"

# ── write report file ─────────────────────────────────────────────────────────
if ! $DRY_RUN; then
  mkdir -p "$REPORT_DIR"
  printf '%s\n' "$REPORT_BODY" > "$REPORT_FILE"
else
  printf '%s\n' "$REPORT_BODY" >&2
fi

# ── Discord notify ────────────────────────────────────────────────────────────
WEBHOOK="${DISCORD_WEBHOOK_PROGRESS:-}"
if [ -n "$WEBHOOK" ] && ! $DRY_RUN; then
  PAYLOAD="$(jq -n --arg date "$TODAY" --arg total "$TOTAL" \
    --arg saved "$TOTAL_SAVED" --arg path "memory/token-reports/$TODAY.md" '
    { content: null,
      embeds: [{
        title: "📊 Token report — \($date)",
        description: "Total: \($total) tokens · Saved: \($saved) tokens",
        fields: [
          { name: "Report", value: ("`" + $path + "`"), inline: false }
        ],
        color: 5814783
      }]
    }')"
  curl -sS -m 5 -X POST -H 'Content-Type: application/json' \
    -d "$PAYLOAD" "$WEBHOOK" >/dev/null 2>&1 || true
elif $DRY_RUN; then
  echo "[dry-run] would POST to DISCORD_WEBHOOK_PROGRESS" >&2
fi

exit 0
