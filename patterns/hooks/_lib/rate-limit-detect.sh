#!/usr/bin/env bash
# patterns/hooks/_lib/rate-limit-detect.sh
# F17: detect rate-limit / usage-limit markers in a Claude Code
# transcript and compute an ETA for resumption. Zero-dependency,
# fail-soft. Every function is callable in set -u context and never
# propagates errors to the sourcing hook.

# Echoes "yes" if the transcript contains any rate-limit marker;
# echoes "" otherwise. Always returns 0.
detect_rate_limit_marker() {
  local transcript="${1:-}"
  [ -r "$transcript" ] || { echo ""; return 0; }

  if grep -qE '"status"[[:space:]]*:[[:space:]]*429\b' "$transcript" 2>/dev/null; then
    echo "yes"; return 0
  fi
  if grep -q 'rate_limit_error' "$transcript" 2>/dev/null; then
    echo "yes"; return 0
  fi
  if grep -qi 'usage limit' "$transcript" 2>/dev/null; then
    echo "yes"; return 0
  fi
  echo ""
  return 0
}

# Echoes ETA in ISO local format "YYYY-MM-DD HH:MM TZ" computed from
# `anthropic-ratelimit-reset` if present in transcript, else from
# now + 5h fallback. Always returns 0; echoes "" only if `date`
# itself fails (extremely unlikely).
compute_eta_iso() {
  local transcript="${1:-}"
  local raw=""

  if [ -r "$transcript" ]; then
    raw="$(grep -oE '"anthropic-ratelimit-reset"[[:space:]]*:[[:space:]]*"[^"]+"' "$transcript" 2>/dev/null \
      | tail -n1 \
      | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/')"
  fi

  local epoch=""
  if [ -n "$raw" ]; then
    # Numeric epoch?
    if [[ "$raw" =~ ^[0-9]+$ ]]; then
      epoch="$raw"
    else
      # ISO-8601: try BSD then GNU date
      epoch="$(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$raw" +%s 2>/dev/null \
            || date -u -d "$raw" +%s 2>/dev/null \
            || true)"
    fi
  fi

  if [ -z "$epoch" ]; then
    # Fallback: now + 5h (Claude Code Pro/Max reset window)
    epoch="$(date -v +5H +%s 2>/dev/null \
          || date -d '+5 hours' +%s 2>/dev/null \
          || true)"
  fi

  [ -n "$epoch" ] || { echo ""; return 0; }

  # Format in America/Sao_Paulo
  local out
  out="$(TZ='America/Sao_Paulo' date -r "$epoch" '+%Y-%m-%d %H:%M %Z' 2>/dev/null \
      || TZ='America/Sao_Paulo' date -d "@$epoch" '+%Y-%m-%d %H:%M %Z' 2>/dev/null \
      || true)"
  echo "${out:-}"
  return 0
}
