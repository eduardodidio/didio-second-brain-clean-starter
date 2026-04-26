#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/assert.sh"

HELPER="$SCRIPT_DIR/../../patterns/hooks/_lib/registry-match.sh"
[ -f "$HELPER" ] || die "helper not found: $HELPER"

PASS=0; FAIL=0
run_test() {
  local n=$1; shift
  if "$@"; then
    echo "  PASS: $n"; PASS=$((PASS+1))
  else
    echo "  FAIL: $n"; FAIL=$((FAIL+1))
  fi
}

make_hub() {
  local hub="$1"
  mkdir -p "$hub/projects"
  cat > "$hub/projects/registry.yaml" <<'YAML'
version: 1
projects:
  - name: my-project
    path: /tmp/my-project
    mcp_integrated: true
  - name: claude-didio-config
    path: /tmp/claude-didio-config
    mcp_integrated: true
YAML
}

# 1. match → exit 0
test_match() {
  local hub; hub="$(mktemp -d)"; make_hub "$hub"
  ( . "$HELPER"; SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR=/tmp/my-project registry_match )
  local rc=$?
  rm -rf "$hub"
  [ "$rc" -eq 0 ] || die "expected match for my-project (exit $rc)"
}

# 2. no-match → exit 1
test_no_match() {
  local hub; hub="$(mktemp -d)"; make_hub "$hub"
  ( . "$HELPER"; SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR=/tmp/foreign registry_match )
  local rc=$?
  rm -rf "$hub"
  [ "$rc" -eq 1 ] || die "expected exit 1 for /tmp/foreign (got $rc)"
}

# 3. registry absent → exit 1
test_registry_absent() {
  local hub; hub="$(mktemp -d)"
  ( . "$HELPER"; SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR=/tmp/my-project registry_match )
  local rc=$?
  rm -rf "$hub"
  [ "$rc" -eq 1 ] || die "expected exit 1 when registry missing (got $rc)"
}

# 4. empty CLAUDE_PROJECT_DIR → exit 1
test_empty_var() {
  local hub; hub="$(mktemp -d)"; make_hub "$hub"
  ( . "$HELPER"; SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR="" registry_match )
  local rc=$?
  rm -rf "$hub"
  [ "$rc" -eq 1 ] || die "expected exit 1 when CLAUDE_PROJECT_DIR empty (got $rc)"
}

# 5. escape hatch → exit 0 even for foreign project
test_escape_hatch() {
  local hub; hub="$(mktemp -d)"; make_hub "$hub"
  ( . "$HELPER"; DIDIO_HOOKS_DISABLE_FILTER=1 SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR=/tmp/foreign registry_match )
  local rc=$?
  rm -rf "$hub"
  [ "$rc" -eq 0 ] || die "expected escape hatch to force exit 0 (got $rc)"
}

# 6. syntax check
test_syntax() { bash -n "$HELPER"; }

# 7. empty registry (no entries) → exit 1
test_empty_registry() {
  local hub; hub="$(mktemp -d)"
  mkdir -p "$hub/projects"
  printf 'version: 1\nprojects:\n' > "$hub/projects/registry.yaml"
  ( . "$HELPER"; SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR=/tmp/my-project registry_match )
  local rc=$?
  rm -rf "$hub"
  [ "$rc" -eq 1 ] || die "expected exit 1 for empty registry (got $rc)"
}

# 8. trailing slash does NOT match (exact comparison)
test_trailing_slash_no_match() {
  local hub; hub="$(mktemp -d)"; make_hub "$hub"
  ( . "$HELPER"; SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR=/tmp/my-project/ registry_match )
  local rc=$?
  rm -rf "$hub"
  [ "$rc" -eq 1 ] || die "expected exit 1 for trailing-slash path (got $rc)"
}

# 9. no stdout/stderr in normal operation
test_no_output() {
  local hub; hub="$(mktemp -d)"; make_hub "$hub"
  local out
  out=$(SECOND_BRAIN_HUB="$hub" CLAUDE_PROJECT_DIR=/tmp/my-project bash -c ". '$HELPER'; registry_match" 2>&1) || true
  rm -rf "$hub"
  [ -z "$out" ] || die "expected no output, got: $out"
}

run_test "happy: match" test_match
run_test "no-match: foreign project" test_no_match
run_test "edge: registry absent" test_registry_absent
run_test "edge: empty CLAUDE_PROJECT_DIR" test_empty_var
run_test "override: DIDIO_HOOKS_DISABLE_FILTER=1" test_escape_hatch
run_test "syntax: bash -n passes" test_syntax
run_test "edge: empty registry no entries" test_empty_registry
run_test "boundary: trailing slash no match" test_trailing_slash_no_match
run_test "no output in normal operation" test_no_output

echo ""
echo "passed: $PASS   failed: $FAIL"
exit "$FAIL"
