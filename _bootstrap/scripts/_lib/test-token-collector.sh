#!/usr/bin/env bash
# F15-T03 hermetic test for token-collector.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HUB_ROOT="$(cd "$HERE/../../.." && pwd)"
FIXTURES="$HUB_ROOT/_bootstrap/scripts/_lib/fixtures/token-report/projects"

# Sandbox copy so we can touch mtimes without polluting the repo.
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
cp -R "$FIXTURES" "$SANDBOX/projects"

# Touch all fixture files to "now" so they're inside the 24h window.
find "$SANDBOX/projects" -type f -exec touch {} \;

# shellcheck source=/dev/null
. "$HERE/token-collector.sh"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

# Test 1: collect_usage_files lists 3 files
count=$(collect_usage_files "$SANDBOX/projects" 86400 | wc -l | tr -d ' ')
[ "$count" = "3" ] && pass "collect_usage_files=3" || fail "got $count"

# Test 2: aggregate_by_project shows projA totals
proj_a=$(collect_usage_files "$SANDBOX/projects" 86400 \
  | aggregate_by_project | awk -F'\t' '$1=="-Users-X-projA"')
[ -n "$proj_a" ] && pass "projA aggregated" || fail "projA empty"

# Test 3: aggregate_by_model finds sonnet + opus + haiku
models=$(collect_usage_files "$SANDBOX/projects" 86400 \
  | aggregate_by_model | awk -F'\t' '{print $1}' | sort -u)
echo "$models" | grep -q 'claude-sonnet-4-6' && pass "sonnet" || fail "no sonnet"
echo "$models" | grep -q 'claude-opus-4-7' && pass "opus" || fail "no opus"
echo "$models" | grep -q 'claude-haiku-4-5-20251001' && pass "haiku" || fail "no haiku"

# Test 4: malformed line in session-ccc didn't crash
ccc_input=$(collect_usage_files "$SANDBOX/projects" 86400 \
  | aggregate_by_project | awk -F'\t' '$1=="-Users-X-projB"')
[ -n "$ccc_input" ] && pass "malformed-tolerant" || fail "projB empty"

# Test 5: empty root → empty output, exit 0
empty_dir="$(mktemp -d)"
out=$(collect_usage_files "$empty_dir" 86400; echo "EXIT=$?")
echo "$out" | grep -q 'EXIT=0' && pass "empty-soft" || fail "empty-hard"

# Test 6: nonexistent root → exit 0, empty
out=$(collect_usage_files "/nonexistent-$$" 86400; echo "EXIT=$?")
echo "$out" | grep -q 'EXIT=0' && pass "missing-soft" || fail "missing-hard"

echo "ALL PASSED"
