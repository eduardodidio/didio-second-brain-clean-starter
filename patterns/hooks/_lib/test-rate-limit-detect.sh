#!/usr/bin/env bash
# Hermetic test for patterns/hooks/_lib/rate-limit-detect.sh.
# Run: bash patterns/hooks/_lib/test-rate-limit-detect.sh
set -euo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
HELPER="$TEST_DIR/rate-limit-detect.sh"
FIX="$TEST_DIR/fixtures/rate-limit"

# shellcheck source=/dev/null
. "$HELPER"

PASS_COUNT=0
FAIL_COUNT=0

assert_eq() {
  local name="$1" exp="$2" got="$3"
  if [ "$exp" = "$got" ]; then
    echo "PASS $name"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL $name: expected '$exp' got '$got'"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

assert_nonempty() {
  local name="$1" got="$2"
  if [ -n "$got" ]; then
    echo "PASS $name (got '$got')"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL $name: expected non-empty"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# ─── detect_rate_limit_marker ────────────────────────────────────────────────

assert_eq "detect:429"          "yes" "$(detect_rate_limit_marker "$FIX/transcript-429.jsonl")"
assert_eq "detect:rate-limit"   "yes" "$(detect_rate_limit_marker "$FIX/transcript-rate-limit-error.jsonl")"
assert_eq "detect:usage-limit"  "yes" "$(detect_rate_limit_marker "$FIX/transcript-usage-limit.jsonl")"
assert_eq "detect:clean"        ""    "$(detect_rate_limit_marker "$FIX/transcript-clean.jsonl")"
assert_eq "detect:missing-file" ""    "$(detect_rate_limit_marker "/nonexistent/path/foo.jsonl")"
assert_eq "detect:empty-arg"    ""    "$(detect_rate_limit_marker "")"

# ─── compute_eta_iso ─────────────────────────────────────────────────────────

# 429 fixture has anthropic-ratelimit-reset header → non-empty ISO string.
assert_nonempty "eta:from-header" "$(compute_eta_iso "$FIX/transcript-429.jsonl")"

# Clean fixture lacks the header → fallback (now+5h) → non-empty ISO string.
assert_nonempty "eta:fallback-now+5h" "$(compute_eta_iso "$FIX/transcript-clean.jsonl")"

# Missing file → fallback still works (no transcript needed for fallback).
assert_nonempty "eta:missing-file-fallback" "$(compute_eta_iso "/nonexistent/foo.jsonl")"

# Format sanity: must contain a date-shape "YYYY-MM-DD" and a time-shape "HH:MM".
got="$(compute_eta_iso "$FIX/transcript-429.jsonl")"
case "$got" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]\ [0-9][0-9]:[0-9][0-9]*)
    echo "PASS eta:format-shape (got '$got')"; PASS_COUNT=$((PASS_COUNT + 1)) ;;
  *)
    echo "FAIL eta:format-shape: got '$got'"; FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
esac

echo
echo "PASS_COUNT=$PASS_COUNT  FAIL_COUNT=$FAIL_COUNT"
[ "$FAIL_COUNT" = "0" ]
