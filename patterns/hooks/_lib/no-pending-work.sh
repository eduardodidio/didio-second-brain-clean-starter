#!/usr/bin/env bash
# patterns/hooks/_lib/no-pending-work.sh
# F17: detect whether the hub has pending work and gate "no-work"
# alerts to once per day. Zero-dependency, fail-soft.

_npw_hub_root() {
  echo "${SECOND_BRAIN_HUB:-$HOME/second-brain}"
  return 0
}

# Returns 0 if there is at least one feature README with
# Status: planned OR Status: in_progress. Returns 1 otherwise
# (no work) or on any error (treat error as "has work" — safer
# default; we'd rather miss an alert than spam one).
has_pending_work() {
  local hub
  hub="$(_npw_hub_root)"
  local features_dir="$hub/tasks/features"
  [ -d "$features_dir" ] || return 0  # no features dir → assume work pending

  # Look at every <FXX>-*/<FXX>-README.md
  local readme
  for readme in "$features_dir"/F[0-9]*-*/F[0-9]*-README.md; do
    [ -r "$readme" ] || continue
    if grep -qE '^\*\*Status:\*\*[[:space:]]*(planned|in_progress)\b' "$readme" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

# Returns 0 if alert should fire today (lockfile absent OR contains
# a date != today). Returns 1 if lockfile already contains today's
# date. Always non-destructive — caller writes today's date after
# successfully posting.
should_alert_no_work_today() {
  local lockfile="${1:-}"
  [ -n "$lockfile" ] || return 1  # no lockfile path → don't alert (caller misuse)

  local today
  today="$(TZ='America/Sao_Paulo' date '+%Y-%m-%d' 2>/dev/null || true)"
  [ -n "$today" ] || return 1

  if [ ! -r "$lockfile" ]; then
    return 0  # no lockfile → first alert today
  fi

  local last
  last="$(head -n1 "$lockfile" 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$last" = "$today" ]; then
    return 1  # already alerted today
  fi
  return 0
}

# Convenience: caller invokes after posting to mark today.
mark_alerted_today() {
  local lockfile="${1:-}"
  [ -n "$lockfile" ] || return 0
  local dir
  dir="$(dirname "$lockfile")"
  mkdir -p "$dir" 2>/dev/null || return 0
  TZ='America/Sao_Paulo' date '+%Y-%m-%d' > "$lockfile" 2>/dev/null || true
  return 0
}
