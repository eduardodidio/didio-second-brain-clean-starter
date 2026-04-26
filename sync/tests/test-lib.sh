#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/assert.sh" || { echo "missing assert.sh"; exit 1; }

HUB_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
export SYNC_HUB_DIR="$HUB_DIR"

# shellcheck source=../lib.sh
source "$SCRIPT_DIR/../lib.sh"

PASS=0
FAIL=0

run_test() {
  local name="$1"
  shift
  if "$@"; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name"
    FAIL=$((FAIL+1))
  fi
}

echo "=== log ==="

test_log_happy() {
  local stderr_out
  stderr_out="$(log info "hello" 2>&1)"
  local stdout_out
  stdout_out="$(log info "hello" 2>/dev/null)"
  [ -z "$stdout_out" ] || die "log should produce no stdout"
  echo "$stderr_out" | grep -q "\[info\]" || die "expected [info] in stderr"
}
run_test "log happy: info writes to stderr, stdout empty" test_log_happy

test_log_debug_silent() {
  local out
  out="$(SYNC_DEBUG=0 log debug "should be silent" 2>&1)"
  [ -z "$out" ] || die "debug should be silent without SYNC_DEBUG=1"
}
run_test "log edge: debug silenced without SYNC_DEBUG=1" test_log_debug_silent

test_log_debug_visible() {
  local out
  out="$(SYNC_DEBUG=1 log debug "visible" 2>&1)"
  echo "$out" | grep -q "\[debug\]" || die "expected [debug] in output"
}
run_test "log edge: debug visible with SYNC_DEBUG=1" test_log_debug_visible

test_log_no_args() {
  log 2>/dev/null || true
}
run_test "log error: no args does not crash" test_log_no_args

test_log_special_chars() {
  local out
  out="$(log info 'msg with $VAR and "quotes"' 2>&1)"
  echo "$out" | grep -q "msg with" || die "special chars broke log"
}
run_test "log boundary: special chars in message" test_log_special_chars

echo "=== require_jq ==="

test_require_jq_happy() {
  require_jq
}
run_test "require_jq happy: jq installed returns 0" test_require_jq_happy

test_require_jq_missing() {
  local out rc
  out="$(PATH=/tmp require_jq 2>&1)" || true
  # require_jq calls `exit`, so run in a subshell to capture exit code without killing the test
  ( PATH=/tmp require_jq 2>/dev/null ); rc=$?
  [ "$rc" = "2" ] || die "expected exit 2, got $rc"
  echo "$out" | grep -qi "jq" || die "expected jq mention in stderr"
}
run_test "require_jq error: missing jq exits 2 with message" test_require_jq_missing

echo "=== backup_file ==="

test_backup_happy() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  local file="$tmpdir/myfile.json"
  echo '{"a":1}' > "$file"
  local backup
  backup="$(backup_file "$file")"
  [ -f "$backup" ] || die "backup file not created"
  diff "$file" "$backup" || die "backup content differs"
  echo "$backup" | grep -q "\.backup-" || die "backup name missing .backup-"
  rm -rf "$tmpdir"
}
run_test "backup_file happy: creates backup with identical content" test_backup_happy

test_backup_absent() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  local file="$tmpdir/nonexistent"
  local stdout_out
  stdout_out="$(backup_file "$file" 2>/dev/null)"
  [ -z "$stdout_out" ] || die "stdout should be empty for absent file"
  local count
  count="$(ls "$tmpdir" | wc -l | tr -d ' ')"
  [ "$count" = "0" ] || die "no backup should be created for absent file"
  rm -rf "$tmpdir"
}
run_test "backup_file edge: absent file returns 0, no backup created" test_backup_absent

test_backup_twice() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  local file="$tmpdir/f.txt"
  echo "content" > "$file"
  local b1
  b1="$(backup_file "$file")"
  sleep 1
  local b2
  b2="$(backup_file "$file")"
  [ "$b1" != "$b2" ] || die "two rapid backups should have different timestamps"
  rm -rf "$tmpdir"
}
run_test "backup_file boundary: two calls 1s apart produce different backup paths" test_backup_twice

echo "=== jq_merge_into ==="

test_jq_merge_happy() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  local file="$tmpdir/data.json"
  echo '{"baz":1}' > "$file"
  jq_merge_into "$file" '.foo = "bar"'
  local baz foo
  baz="$(jq -r '.baz' "$file")"
  foo="$(jq -r '.foo' "$file")"
  assert_eq "1" "$baz" "baz preserved"
  assert_eq "bar" "$foo" "foo added"
  rm -rf "$tmpdir"
}
run_test "jq_merge_into happy: merge adds key, preserves existing" test_jq_merge_happy

test_jq_merge_absent_file() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  local file="$tmpdir/new.json"
  jq_merge_into "$file" '.hello = "world"'
  local val
  val="$(jq -r '.hello' "$file")"
  assert_eq "world" "$val" "key set on new file"
  rm -rf "$tmpdir"
}
run_test "jq_merge_into edge: absent file created as {} then merged" test_jq_merge_absent_file

test_jq_merge_invalid_expr() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  local file="$tmpdir/data.json"
  echo '{"orig":1}' > "$file"
  local before
  before="$(cat "$file")"
  jq_merge_into "$file" 'THIS IS NOT VALID JQ !!!' 2>/dev/null && die "should fail on bad expr" || true
  local after
  after="$(cat "$file")"
  assert_eq "$before" "$after" "file unchanged after bad expr"
  rm -rf "$tmpdir"
}
run_test "jq_merge_into error: bad jq expr returns non-zero, file unchanged" test_jq_merge_invalid_expr

test_jq_merge_many_keys() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  local file="$tmpdir/big.json"
  echo '{"k1":1,"k2":2,"k3":3,"k4":4,"k5":5,"k6":6,"k7":7,"k8":8,"k9":9,"k10":10}' > "$file"
  jq_merge_into "$file" '.k11 = "new"'
  local count
  count="$(jq 'keys | length' "$file")"
  assert_eq "11" "$count" "all 11 keys present"
  rm -rf "$tmpdir"
}
run_test "jq_merge_into boundary: 10 existing keys + 1 new = 11 total" test_jq_merge_many_keys

echo "=== registry_mark_integrated ==="

make_registry() {
  local dir="$1"
  mkdir -p "$dir/projects"
  cat > "$dir/projects/registry.yaml" << 'YAML'
version: 1
projects:
  - name: proj-a
    path: /tmp/proj-a
    mcp_integrated: false

  - name: proj-b
    path: /tmp/proj-b
    mcp_integrated: false
YAML
}

test_registry_happy() {
  local sandbox
  sandbox="$(mktemp -d)"
  make_registry "$sandbox"
  SYNC_HUB_DIR="$sandbox" registry_mark_integrated "/tmp/proj-a"
  grep -A5 "proj-a" "$sandbox/projects/registry.yaml" | grep -q "mcp_integrated: true" || die "proj-a not marked true"
  rm -rf "$sandbox"
}
run_test "registry_mark_integrated happy: marks target true" test_registry_happy

test_registry_idempotent() {
  local sandbox
  sandbox="$(mktemp -d)"
  make_registry "$sandbox"
  SYNC_HUB_DIR="$sandbox" registry_mark_integrated "/tmp/proj-a"
  SYNC_HUB_DIR="$sandbox" registry_mark_integrated "/tmp/proj-a"
  local count
  count="$(grep -c "mcp_integrated: true" "$sandbox/projects/registry.yaml")"
  assert_eq "1" "$count" "only one true after idempotent run"
  rm -rf "$sandbox"
}
run_test "registry_mark_integrated edge: idempotent when already true" test_registry_idempotent

test_registry_not_found() {
  local sandbox
  sandbox="$(mktemp -d)"
  make_registry "$sandbox"
  SYNC_HUB_DIR="$sandbox" registry_mark_integrated "/tmp/does-not-exist" 2>/dev/null
  local rc=$?
  assert_eq "0" "$rc" "missing project is not an error"
  rm -rf "$sandbox"
}
run_test "registry_mark_integrated error: unknown path exits 0 with warn" test_registry_not_found

test_registry_neighbor_preserved() {
  local sandbox
  sandbox="$(mktemp -d)"
  make_registry "$sandbox"
  SYNC_HUB_DIR="$sandbox" registry_mark_integrated "/tmp/proj-a"
  grep -A5 "proj-b" "$sandbox/projects/registry.yaml" | grep -q "mcp_integrated: false" || die "proj-b should still be false"
  rm -rf "$sandbox"
}
run_test "registry_mark_integrated boundary: only target changes, neighbor preserved" test_registry_neighbor_preserved

test_registry_empty() {
  local sandbox
  sandbox="$(mktemp -d)"
  mkdir -p "$sandbox/projects"
  echo "version: 1" > "$sandbox/projects/registry.yaml"
  SYNC_HUB_DIR="$sandbox" registry_mark_integrated "/tmp/x" 2>/dev/null
  local rc=$?
  assert_eq "0" "$rc" "empty registry returns 0"
  rm -rf "$sandbox"
}
run_test "registry_mark_integrated boundary: empty registry (0 projects) returns 0" test_registry_empty

test_registry_ten_projects() {
  local sandbox
  sandbox="$(mktemp -d)"
  mkdir -p "$sandbox/projects"
  {
    echo "version: 1"
    echo "projects:"
    for i in $(seq 1 10); do
      echo "  - name: proj-$i"
      echo "    path: /tmp/proj-$i"
      echo "    mcp_integrated: false"
      echo ""
    done
  } > "$sandbox/projects/registry.yaml"
  SYNC_HUB_DIR="$sandbox" registry_mark_integrated "/tmp/proj-5"
  local true_count false_count
  true_count="$(grep -c "mcp_integrated: true" "$sandbox/projects/registry.yaml")"
  false_count="$(grep -c "mcp_integrated: false" "$sandbox/projects/registry.yaml")"
  assert_eq "1" "$true_count" "exactly one true"
  assert_eq "9" "$false_count" "exactly nine false"
  rm -rf "$sandbox"
}
run_test "registry_mark_integrated boundary: 10 projects, only target changes" test_registry_ten_projects

echo ""
echo "passed: $PASS   failed: $FAIL"
exit "$FAIL"
