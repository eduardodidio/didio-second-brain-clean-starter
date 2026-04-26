#!/usr/bin/env bash
# _bootstrap/scripts/daily-heartbeat.sh
# F09: non-LLM vault health scoring + conditional Discord alert.
# Fire-and-forget: always exits 0. Pure bash — no external runtimes or LLMs.
# Flags:
#   --dry-run     skip curl; print payload to stderr instead
#   --hub <path>  override HUB_ROOT (used by T05 hermetic tests)

set -u

# ── argument parsing ──────────────────────────────────────────────────────────
DRY_RUN=false
HUB_OVERRIDE=

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --hub)
      if [ $# -ge 2 ]; then
        HUB_OVERRIDE="$2"
        shift 2
      else
        shift
      fi
      ;;
    *) shift ;;
  esac
done

# ── hub root resolution ───────────────────────────────────────────────────────
# Script lives in _bootstrap/scripts/ — two levels up is the hub root.
if [ -n "$HUB_OVERRIDE" ]; then
  HUB_ROOT="$HUB_OVERRIDE"
else
  HUB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

# Bail silently if the hub path does not exist
[ -d "$HUB_ROOT" ] || exit 0

# ── load .env (DISCORD_* vars) ────────────────────────────────────────────────
ENV_LIB="$HUB_ROOT/patterns/hooks/_lib/load-env.sh"
if [ -f "$ENV_LIB" ]; then
  # shellcheck source=/dev/null
  . "$ENV_LIB"
  load_hub_env
fi

# ── helpers ───────────────────────────────────────────────────────────────────

# Outputs file mtime as epoch seconds.
# macOS uses stat -f %m; GNU/Linux uses stat -c %Y.
get_mtime() {
  local f="$1"
  if stat -f %m "$f" 2>/dev/null; then return; fi
  stat -c %Y "$f" 2>/dev/null || echo 0
}

# Increments global STALE_COUNT if the project is active and its
# last_activity is more than cutoff_days ago.
check_registry_item() {
  local status="$1" last_activity="$2" cutoff_days="$3"
  [ "$status" = "active" ] || return 0
  [ -n "$last_activity" ]  || return 0
  local item_ts
  # macOS date -j -f; GNU date -d
  item_ts=$(date -j -f "%Y-%m-%d" "$last_activity" +%s 2>/dev/null \
            || date -d "$last_activity" +%s 2>/dev/null \
            || echo 0)
  [ "$item_ts" -gt 0 ] || return 0
  local item_age=$(( (NOW - item_ts) / 86400 ))
  [ "$item_age" -gt "$cutoff_days" ] && STALE_COUNT=$(( STALE_COUNT + 1 ))
  return 0
}

# ── scoring ───────────────────────────────────────────────────────────────────
SCORE=10
BREAKDOWN=()
NOW=$(date +%s)

# Penalty A — memory/current-state.md staleness
CURRENT_STATE="$HUB_ROOT/memory/current-state.md"
if [ ! -f "$CURRENT_STATE" ]; then
  SCORE=$(( SCORE - 4 ))
  BREAKDOWN+=("current-state.md: not found (penalty -4)")
else
  CS_MTIME=$(get_mtime "$CURRENT_STATE")
  CS_AGE=$(( (NOW - CS_MTIME) / 86400 ))
  if [ "$CS_AGE" -gt 14 ]; then
    SCORE=$(( SCORE - 4 ))
    BREAKDOWN+=("current-state.md age: ${CS_AGE}d (penalty -4)")
  elif [ "$CS_AGE" -gt 7 ]; then
    SCORE=$(( SCORE - 2 ))
    BREAKDOWN+=("current-state.md age: ${CS_AGE}d (penalty -2)")
  else
    BREAKDOWN+=("current-state.md age: ${CS_AGE}d (penalty 0)")
  fi
fi

# Penalty B — stale .needs-end-session* flags in memory/
FLAG_COUNT=$(find "$HUB_ROOT/memory" -maxdepth 1 -name '.needs-end-session*' -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$FLAG_COUNT" -gt 0 ]; then
  SCORE=$(( SCORE - FLAG_COUNT ))
  BREAKDOWN+=(".needs-end-session flags: $FLAG_COUNT (penalty -${FLAG_COUNT})")
else
  BREAKDOWN+=(".needs-end-session flags: 0 (penalty 0)")
fi

# Penalty C — active projects with last_activity > 30d in projects/registry.yaml
REGISTRY="$HUB_ROOT/projects/registry.yaml"
STALE_COUNT=0

if [ -f "$REGISTRY" ]; then
  _item_status=""
  _item_last=""

  while IFS= read -r line || [ -n "$line" ]; do
    if echo "$line" | grep -qE '^\s+- name:'; then
      check_registry_item "$_item_status" "$_item_last" 30
      _item_status=""
      _item_last=""
    elif echo "$line" | grep -qE '^\s+status:'; then
      _item_status=$(echo "$line" | sed -E 's/.*status:[[:space:]]*//' | tr -d ' \r\n')
    elif echo "$line" | grep -qE '^\s+last_activity:'; then
      _item_last=$(echo "$line" | sed -E 's/.*last_activity:[[:space:]]*//' | tr -d ' \r\n')
    fi
  done < "$REGISTRY"
  # Evaluate the last project entry (not followed by another `- name:`)
  check_registry_item "$_item_status" "$_item_last" 30
fi

if [ "$STALE_COUNT" -gt 0 ]; then
  SCORE=$(( SCORE - STALE_COUNT ))
  BREAKDOWN+=("registry active+stale projects: $STALE_COUNT (penalty -${STALE_COUNT})")
else
  BREAKDOWN+=("registry active+stale projects: 0 (penalty 0)")
fi

# Score floor
[ "$SCORE" -lt 0 ] && SCORE=0

TIMESTAMP=$(date -u +%FT%TZ)

# ── alert decision & Discord post ─────────────────────────────────────────────
ALERTED=false
WEBHOOK="${DISCORD_WEBHOOK_ALERTS:-}"
DISCORD_ENABLED="${DISCORD_ENABLED:-true}"

if [ "$SCORE" -lt 7 ] && [ -n "$WEBHOOK" ] && [ "$DISCORD_ENABLED" != "false" ]; then
  # Build description: breakdown items joined with \n (literal, for JSON)
  DESC_PARTS=""
  for item in "${BREAKDOWN[@]}"; do
    DESC_PARTS="${DESC_PARTS}- ${item}\\n"
  done
  DESC_PARTS="${DESC_PARTS%\\n}"
  safe_desc="$(printf '%s' "$DESC_PARTS" | sed 's/"/\\"/g')"

  PAYLOAD="$(printf \
    '{"embeds":[{"title":"⚠️ vault heartbeat: score %d/10","description":"%s","color":15844367,"fields":[{"name":"project","value":"didio-second-brain-claude","inline":true},{"name":"timestamp","value":"%s","inline":true}],"timestamp":"%s"}]}' \
    "$SCORE" "$safe_desc" "$TIMESTAMP" "$TIMESTAMP")"

  if [ "$DRY_RUN" = "true" ]; then
    printf '[dry-run] would POST to DISCORD_WEBHOOK_ALERTS:\n%s\n' "$PAYLOAD" >&2
  else
    ALERTED=true
    curl --silent --show-error --max-time 5 \
      -X POST \
      -H 'Content-Type: application/json' \
      -d "$PAYLOAD" \
      "$WEBHOOK" > /dev/null 2>&1 || true
  fi
fi

# ── write heartbeat-latest.md (overwrite) ────────────────────────────────────
HEARTBEAT_FILE="$HUB_ROOT/memory/heartbeat-latest.md"

# Build breakdown lines without trailing newline so the heredoc
# produces exactly one blank line before **Alerted:**.
BREAKDOWN_LINES=""
for item in "${BREAKDOWN[@]}"; do
  if [ -z "$BREAKDOWN_LINES" ]; then
    BREAKDOWN_LINES="- ${item}"
  else
    BREAKDOWN_LINES="${BREAKDOWN_LINES}
- ${item}"
  fi
done

cat > "$HEARTBEAT_FILE" << HEARTBEAT_EOF
---
score: $SCORE
timestamp: $TIMESTAMP
alerted: $ALERTED
---

# Vault heartbeat — $TIMESTAMP

**Score:** $SCORE/10

## Breakdown

${BREAKDOWN_LINES}

**Alerted:** $ALERTED
HEARTBEAT_EOF

# ── activity-log append ───────────────────────────────────────────────────────
echo "$TIMESTAMP | heartbeat | score=$SCORE | alerted=$ALERTED" >> "$HUB_ROOT/memory/activity-log.md"

exit 0
