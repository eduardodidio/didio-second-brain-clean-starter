#!/usr/bin/env bash
# Hermetic test for patterns/hooks/_lib/feature-context.sh.
# Uses mktemp -d sandbox + deterministic touch -t. Zero external deps.
# Run: bash patterns/hooks/_lib/test-feature-context.sh
set -euo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
HELPER="$TEST_DIR/feature-context.sh"
FIX_SRC="$TEST_DIR/fixtures/feature-context"

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

# ─── Fixture setup ────────────────────────────────────────────────────────────

cp -R "$FIX_SRC"/. "$SANDBOX/"

NOW="$(date -u +%Y%m%d%H%M.%S)"
OLD="202501010000.00"
# macOS: date -v-1H; Linux: date -d '1 hour ago'
HOUR_AGO="$(date -v-1H -u +%Y%m%d%H%M.%S 2>/dev/null || date -u -d '1 hour ago' +%Y%m%d%H%M.%S)"

# Happy: F90 newest (feature + tasks dir), F89 old; T02 newest, T01 old
touch -t "$NOW" \
  "$SANDBOX/happy/tasks/features/F90-active-feature" \
  "$SANDBOX/happy/tasks/features/F90-active-feature/F90-README.md" \
  "$SANDBOX/happy/tasks/features/F90-active-feature/F90-T02.md"
touch -t "$OLD" \
  "$SANDBOX/happy/tasks/features/F89-old-feature" \
  "$SANDBOX/happy/tasks/features/F89-old-feature/F89-T01.md" \
  "$SANDBOX/happy/tasks/features/F90-active-feature/F90-T01.md"

# Multi-active: F87 newest (now), F86 older (1 hour ago)
touch -t "$NOW" \
  "$SANDBOX/multi-active/tasks/features/F87-feature-a" \
  "$SANDBOX/multi-active/tasks/features/F87-feature-a/F87-T01.md"
touch -t "$HOUR_AGO" \
  "$SANDBOX/multi-active/tasks/features/F86-feature-b" \
  "$SANDBOX/multi-active/tasks/features/F86-feature-b/F86-T01.md"

# ─── Source helper ────────────────────────────────────────────────────────────

# shellcheck source=/dev/null
. "$HELPER"

# ─── Test harness ─────────────────────────────────────────────────────────────

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

# ─── Cases 1–9: phase_for_role ───────────────────────────────────────────────

assert_eq "phase_for_role:architect"        "🧭 Planning"   "$(phase_for_role architect)"
assert_eq "phase_for_role:developer"        "🔨 Building"   "$(phase_for_role developer)"
assert_eq "phase_for_role:techlead"         "🔍 Review"     "$(phase_for_role techlead)"
assert_eq "phase_for_role:qa"              "✅ Validation"  "$(phase_for_role qa)"
assert_eq "phase_for_role:Explore"          "🔎 Research"   "$(phase_for_role Explore)"
assert_eq "phase_for_role:general-purpose"  "🔎 Research"   "$(phase_for_role general-purpose)"
assert_eq "phase_for_role:randomfoo"        "🔎 Research"   "$(phase_for_role randomfoo)"
assert_eq "phase_for_role:empty"            ""              "$(phase_for_role '')"
assert_eq "phase_for_role:unknown"          ""              "$(phase_for_role unknown)"

# ─── Cases 10–12: detect_active_feature ──────────────────────────────────────

# Case 10: DIDIO_FEATURE env var wins over mtime detection
assert_eq "detect_active_feature:env-var-wins" "F87" \
  "$(DIDIO_FEATURE=F87 SECOND_BRAIN_HUB="$SANDBOX/multi-active" detect_active_feature)"

# Case 11: mtime picks F90 (newer) over F89 (older)
assert_eq "detect_active_feature:mtime-happy" "F90" \
  "$(SECOND_BRAIN_HUB="$SANDBOX/happy" detect_active_feature)"

# Case 12: no tasks/features/ dir (ad-hoc) → empty
assert_eq "detect_active_feature:ad-hoc" "" \
  "$(SECOND_BRAIN_HUB="$SANDBOX/ad-hoc" detect_active_feature)"

# ─── Cases 13–14: detect_active_task ─────────────────────────────────────────

# Case 13: no tasks/features/ dir (ad-hoc) → empty
assert_eq "detect_active_task:ad-hoc" "" \
  "$(SECOND_BRAIN_HUB="$SANDBOX/ad-hoc" detect_active_task)"

# Case 14: happy → F90-T02 (T02 newest), README.md excluded by *-T*.md glob
assert_eq "detect_active_task:happy" "F90-T02" \
  "$(SECOND_BRAIN_HUB="$SANDBOX/happy" detect_active_task)"

# ─── Cases 15–16: detect_task_wave / detect_task_status (valid) ──────────────

TASK_F90_T02="$SANDBOX/happy/tasks/features/F90-active-feature/F90-T02.md"

# Case 15: valid Wave line → "2"
assert_eq "detect_task_wave:valid" "2" \
  "$(detect_task_wave "$TASK_F90_T02")"

# Case 16: valid Status line → "in_progress"
assert_eq "detect_task_status:valid" "in_progress" \
  "$(detect_task_status "$TASK_F90_T02")"

# ─── Cases 17–18: malformed frontmatter ──────────────────────────────────────

TASK_F88_T01="$SANDBOX/malformed/tasks/features/F88-no-frontmatter/F88-T01.md"

# Case 17: no **Wave:** line → empty
assert_eq "detect_task_wave:malformed" "" \
  "$(detect_task_wave "$TASK_F88_T01")"

# Case 18: no **Status:** line → empty
assert_eq "detect_task_status:malformed" "" \
  "$(detect_task_status "$TASK_F88_T01")"

# ─── Case 19: nonexistent task file ──────────────────────────────────────────

assert_eq "detect_task_wave:nonexistent" "" \
  "$(detect_task_wave "/tmp/nope-$$.md")"

# ─── Case 20: fail-soft canary (invalid hub must not propagate error) ─────────

set +e
canary_out="$(SECOND_BRAIN_HUB="/dev/null/nope" detect_active_feature 2>/dev/null)"
canary_rc=$?
set -e
if [ "$canary_rc" -eq 0 ] && [ -z "$canary_out" ]; then
  echo "PASS fail-soft-canary"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "FAIL fail-soft-canary: expected rc=0 and empty output, got rc=$canary_rc out='$canary_out'"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ─── Cases for summarize_last_wave_activity (F17) ──────────────────────────

LWA_FIX="$TEST_DIR/fixtures/last-wave-activity"

# Case A: happy path — returns string with task ID and at least one filename.
got="$(SECOND_BRAIN_HUB="$LWA_FIX/happy" summarize_last_wave_activity F90)"
case "$got" in
  *"T01"*)
    echo "PASS summarize:happy:contains-T01"; PASS_COUNT=$((PASS_COUNT+1)) ;;
  *)
    echo "FAIL summarize:happy:contains-T01: got '$got'"; FAIL_COUNT=$((FAIL_COUNT+1)) ;;
esac

# Case B: privacy — fixture log has a sensitive prompt; output must NOT
# contain any content from user/assistant text fields. The fixture now
# has a tasks/features/F91-sensitive/ dir AND a file_path entry so the
# function actually reaches the log-reading code path (not just exits
# early on missing dir). The benign filename MUST appear; the secret MUST NOT.
SENSITIVE_NEEDLE="abc123"
BENIGN_FILENAME="privacy-benign-filename.sh"
got="$(SECOND_BRAIN_HUB="$LWA_FIX/privacy" summarize_last_wave_activity F91)"
_b_pass=1
case "$got" in
  *"$SENSITIVE_NEEDLE"*)
    echo "FAIL summarize:privacy:no-leak: sensitive needle found in '$got'"; FAIL_COUNT=$((FAIL_COUNT+1)); _b_pass=0 ;;
esac
if [ "$_b_pass" = "1" ]; then
  case "$got" in
    *"$BENIGN_FILENAME"*)
      echo "PASS summarize:privacy:no-leak (log actually read, no secret in output)"; PASS_COUNT=$((PASS_COUNT+1)) ;;
    *)
      echo "FAIL summarize:privacy:log-not-read: filename absent from output '$got'"; FAIL_COUNT=$((FAIL_COUNT+1)) ;;
  esac
fi

# Case C: empty README + no logs → empty string.
assert_eq "summarize:empty:returns-empty" "" \
  "$(SECOND_BRAIN_HUB="$LWA_FIX/empty" summarize_last_wave_activity F92)"

# Case D: missing feature argument → empty string + exit 0.
assert_eq "summarize:no-arg:returns-empty" "" \
  "$(SECOND_BRAIN_HUB="$LWA_FIX/happy" summarize_last_wave_activity)"

# Case E: 200-char truncation — if output is non-empty, must be ≤ 200 chars.
got="$(SECOND_BRAIN_HUB="$LWA_FIX/happy" summarize_last_wave_activity F90)"
if [ "${#got}" -le 200 ]; then
  echo "PASS summarize:happy:within-200-chars (len=${#got})"
  PASS_COUNT=$((PASS_COUNT+1))
else
  echo "FAIL summarize:happy:within-200-chars: len=${#got} got '$got'"
  FAIL_COUNT=$((FAIL_COUNT+1))
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "RESULT: $FAIL_COUNT/$TOTAL cases FAILED"
  exit 1
fi
echo "OK: $PASS_COUNT/$TOTAL cases"
exit 0
