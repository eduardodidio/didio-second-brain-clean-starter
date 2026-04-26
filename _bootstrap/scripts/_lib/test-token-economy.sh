#!/usr/bin/env bash
# F15-T04 hermetic test for token-economy.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HUB_ROOT="$(cd "$HERE/../../.." && pwd)"
FIXTURE="$HUB_ROOT/_bootstrap/scripts/_lib/fixtures/token-report/projects/-Users-X-projA/session-bbb.jsonl"

# shellcheck source=/dev/null
. "$HERE/token-economy.sh"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

# Test 1: count_secondbrain_calls finds 2 distinct tools (memory_search, knowledge_get)
out=$(count_secondbrain_calls "$FIXTURE")
echo "$out" | awk -F'\t' '{print $1}' | grep -q 'mcp__second-brain__memory_search' \
  && pass "memory_search detected" || fail "no memory_search"
echo "$out" | awk -F'\t' '{print $1}' | grep -q 'mcp__second-brain__knowledge_get' \
  && pass "knowledge_get detected" || fail "no knowledge_get"

# Test 2: estimate_savings returns nonzero saved tokens for both
saved=$(echo "$out" | estimate_savings -)
total=$(echo "$saved" | awk -F'\t' '{s+=$3} END{print s}')
[ "$total" -gt 0 ] && pass "savings > 0 (got $total)" || fail "savings <= 0"

# Test 3: count_secondbrain_calls on empty/missing file → empty, exit 0
out=$(count_secondbrain_calls "/nonexistent-$$"; echo "EXIT=$?")
echo "$out" | tail -1 | grep -q 'EXIT=0' && pass "missing-soft" || fail "missing-hard"

# Test 4: count_secondbrain_calls on a session with no MCP calls → empty
out=$(count_secondbrain_calls "$HUB_ROOT/_bootstrap/scripts/_lib/fixtures/token-report/projects/-Users-X-projA/session-aaa.jsonl")
[ -z "$(echo "$out" | tr -d '[:space:]')" ] && pass "no-mcp-empty" || fail "got $out"

# Test 5: estimate_savings clamps negative results to 0
echo -e "mcp__second-brain__memory_search\t1\t10\t100" | estimate_savings - \
  | awk -F'\t' '{print $3}' | grep -q '^0$' && pass "clamp-zero" || fail "negative not clamped"

echo "ALL PASSED"
