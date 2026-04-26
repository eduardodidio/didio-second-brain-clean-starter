#!/usr/bin/env bash
# Hermetic test for patterns/hooks/_lib/no-pending-work.sh.
# Run: bash patterns/hooks/_lib/test-no-pending-work.sh
set -euo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
HELPER="$TEST_DIR/no-pending-work.sh"
FIX="$TEST_DIR/fixtures/no-pending-work"

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

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

# ─── has_pending_work ────────────────────────────────────────────────────────

# Case 1: busy fixture has Status: in_progress + planned → returns 0.
if ( SECOND_BRAIN_HUB="$FIX/busy" has_pending_work ); then rc=0; else rc=1; fi
assert_eq "has_pending_work:busy" "0" "$rc"

# Case 2: idle fixture only has Status: done → returns 1.
if ( SECOND_BRAIN_HUB="$FIX/idle" has_pending_work ); then rc=0; else rc=1; fi
assert_eq "has_pending_work:idle" "1" "$rc"

# Case 3: missing tasks/features dir → returns 0 (fail-safe).
if ( SECOND_BRAIN_HUB="$SANDBOX/nonexistent-hub" has_pending_work ); then rc=0; else rc=1; fi
assert_eq "has_pending_work:missing-dir" "0" "$rc"

# ─── should_alert_no_work_today ──────────────────────────────────────────────

LOCK="$SANDBOX/lockfile.txt"

# Case 4: lockfile absent → returns 0 (alert).
rm -f "$LOCK"
if ( should_alert_no_work_today "$LOCK" ); then rc=0; else rc=1; fi
assert_eq "should_alert:no-lockfile" "0" "$rc"

# Case 5: lockfile contains today → returns 1 (skip).
TZ='America/Sao_Paulo' date '+%Y-%m-%d' > "$LOCK"
if ( should_alert_no_work_today "$LOCK" ); then rc=0; else rc=1; fi
assert_eq "should_alert:today-already" "1" "$rc"

# Case 6: lockfile contains yesterday → returns 0 (alert).
echo "2020-01-01" > "$LOCK"
if ( should_alert_no_work_today "$LOCK" ); then rc=0; else rc=1; fi
assert_eq "should_alert:yesterday-stale" "0" "$rc"

# Case 7: empty lockfile path → returns 1 (defensive).
if ( should_alert_no_work_today "" ); then rc=0; else rc=1; fi
assert_eq "should_alert:empty-arg" "1" "$rc"

# ─── mark_alerted_today ──────────────────────────────────────────────────────

# Case 8: writes today's date into lockfile (creating parent dir).
NEW_LOCK="$SANDBOX/sub/dir/lock.txt"
mark_alerted_today "$NEW_LOCK"
expected_today="$(TZ='America/Sao_Paulo' date '+%Y-%m-%d')"
got="$(head -n1 "$NEW_LOCK" 2>/dev/null || echo "")"
assert_eq "mark_alerted:writes-today" "$expected_today" "$got"

echo
echo "PASS_COUNT=$PASS_COUNT  FAIL_COUNT=$FAIL_COUNT"
[ "$FAIL_COUNT" = "0" ]
