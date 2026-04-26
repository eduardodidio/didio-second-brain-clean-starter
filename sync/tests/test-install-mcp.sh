#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/assert.sh"

INSTALL_SCRIPT="$SCRIPT_DIR/../install-mcp-in-project.sh"

PASS=0; FAIL=0

run_test() {
  local name="$1"; shift
  if "$@"; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name"
    FAIL=$((FAIL+1))
  fi
}

make_hub() {
  local hub="$1"
  mkdir -p "$hub/projects"
  printf 'version: 1\nprojects:\n' > "$hub/projects/registry.yaml"
}

echo "=== install-mcp-in-project.sh ==="

# 1. Happy — empty target (no .claude/)
test_happy_empty_target() {
  local hub target
  hub="$(mktemp -d)"; make_hub "$hub"
  target="$(mktemp -d)"
  SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target" 2>/dev/null
  local ok=0
  [ -f "$target/.claude/settings.json" ] || { ok=1; echo "  >> settings.json not created" >&2; }
  jq '.' "$target/.claude/settings.json" > /dev/null 2>&1 || { ok=1; echo "  >> invalid JSON" >&2; }
  jq -e '.mcpServers["second-brain"].command == "bun"' "$target/.claude/settings.json" > /dev/null \
    || { ok=1; echo "  >> second-brain.command != bun" >&2; }
  jq -e '.mcpServers["second-brain"].args[1] | endswith("mcp-server/src/index.ts")' \
    "$target/.claude/settings.json" > /dev/null || { ok=1; echo "  >> args[1] wrong" >&2; }
  rm -rf "$hub" "$target"
  return "$ok"
}
run_test "happy: empty target — creates .claude/settings.json with second-brain" test_happy_empty_target

# 2. Idempotence — 2nd run produces no changes and no 2nd backup
test_idempotent() {
  local hub target
  hub="$(mktemp -d)"; make_hub "$hub"
  target="$(mktemp -d)"
  SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target" 2>/dev/null
  local backup_count_before
  backup_count_before="$(ls "$target/.claude/" | { grep -c '\.backup-' || true; })"
  local stderr_out ok=0
  stderr_out="$(SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target" 2>&1 >/dev/null || true)"
  echo "$stderr_out" | grep -q "no changes" || { ok=1; echo "  >> 2nd run did not log no changes" >&2; }
  local backup_count_after
  backup_count_after="$(ls "$target/.claude/" | { grep -c '\.backup-' || true; })"
  [ "$backup_count_before" = "$backup_count_after" ] \
    || { ok=1; echo "  >> 2nd run created a backup" >&2; }
  rm -rf "$hub" "$target"
  return "$ok"
}
run_test "edge: idempotent — 2nd run logs no changes, no extra backup" test_idempotent

# 3. Merge preserves existing keys
test_merge_preserves() {
  local hub target settings
  hub="$(mktemp -d)"; make_hub "$hub"
  target="$(mktemp -d)"
  mkdir -p "$target/.claude"
  settings="$target/.claude/settings.json"
  printf '{"permissions":{"allow":["Read(./**)"]}}' > "$settings"
  SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target" 2>/dev/null
  local ok=0
  jq -e '.permissions.allow | length > 0' "$settings" > /dev/null \
    || { ok=1; echo "  >> permissions.allow not preserved" >&2; }
  jq -e '.mcpServers["second-brain"].command == "bun"' "$settings" > /dev/null \
    || { ok=1; echo "  >> second-brain not added" >&2; }
  jq '.' "$settings" > /dev/null 2>&1 \
    || { ok=1; echo "  >> result is invalid JSON" >&2; }
  rm -rf "$hub" "$target"
  return "$ok"
}
run_test "edge: merge — preserves existing permissions, adds second-brain" test_merge_preserves

# 4. Dry-run — file unchanged, stdout has diff
test_dry_run() {
  local hub target settings
  hub="$(mktemp -d)"; make_hub "$hub"
  target="$(mktemp -d)"
  mkdir -p "$target/.claude"
  settings="$target/.claude/settings.json"
  printf '{"permissions":{"allow":["Read(./**)"]}}' > "$settings"
  cp "$settings" "$settings.orig"
  local dry_out ok=0
  dry_out="$(SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target" --dry-run 2>/dev/null || true)"
  cmp -s "$settings" "$settings.orig" \
    || { ok=1; echo "  >> settings.json was modified by --dry-run" >&2; }
  echo "$dry_out" | grep -q '"second-brain"' \
    || { ok=1; echo "  >> dry-run stdout missing second-brain" >&2; }
  rm -rf "$hub" "$target"
  return "$ok"
}
run_test "dry-run: file unchanged, stdout contains diff with second-brain" test_dry_run

# 5. Error — target does not exist
test_error_target_missing() {
  local hub
  hub="$(mktemp -d)"; make_hub "$hub"
  local rc=0 ok=0
  local stderr_out
  stderr_out="$(SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" /no/such/path 2>&1 >/dev/null)" || rc=$?
  [ "$rc" = "1" ] || { ok=1; echo "  >> expected exit 1, got $rc" >&2; }
  echo "$stderr_out" | grep -qi "not a directory" \
    || { ok=1; echo "  >> stderr missing 'not a directory'" >&2; }
  rm -rf "$hub"
  return "$ok"
}
run_test "error: target missing — exit 1, stderr 'not a directory'" test_error_target_missing

# 6. Error — settings.json is corrupted JSON
test_error_corrupted_json() {
  local hub target settings
  hub="$(mktemp -d)"; make_hub "$hub"
  target="$(mktemp -d)"
  mkdir -p "$target/.claude"
  settings="$target/.claude/settings.json"
  printf 'not json {{' > "$settings"
  local before_content rc=0 ok=0
  before_content="$(cat "$settings")"
  SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target" 2>/dev/null || rc=$?
  [ "$rc" = "3" ] || { ok=1; echo "  >> expected exit 3, got $rc" >&2; }
  local after_content
  after_content="$(cat "$settings")"
  [ "$before_content" = "$after_content" ] \
    || { ok=1; echo "  >> corrupted file was modified" >&2; }
  local backup_count
  backup_count="$(ls "$target/.claude/" | { grep -c '\.backup-' || true; })"
  [ "$backup_count" = "0" ] \
    || { ok=1; echo "  >> backup created for corrupted file (unexpected)" >&2; }
  rm -rf "$hub" "$target"
  return "$ok"
}
run_test "error: corrupted settings.json — exit 3, file not modified" test_error_corrupted_json

# 7. Boundary — registry updated for known project, neighbor unchanged
test_registry_updated() {
  local hub target_a
  hub="$(mktemp -d)"
  # Resolve symlinks so the path matches what the script stores after `cd ... && pwd`
  target_a="$(mktemp -d)"; target_a="$(cd "$target_a" && pwd)"
  mkdir -p "$hub/projects"
  cat > "$hub/projects/registry.yaml" << YAML
version: 1
projects:
  - name: claude-didio-config
    path: ${target_a}
    claude_framework: true
    mcp_integrated: false

  - name: my-project
    path: /tmp/my-project-test-neighbor
    claude_framework: true
    mcp_integrated: false
YAML
  SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target_a" 2>/dev/null
  local ok=0
  grep -A4 "claude-didio-config" "$hub/projects/registry.yaml" \
    | grep -q "mcp_integrated: true" \
    || { ok=1; echo "  >> claude-didio-config not marked true" >&2; }
  grep -A4 "my-project" "$hub/projects/registry.yaml" \
    | grep -q "mcp_integrated: false" \
    || { ok=1; echo "  >> my-project should still be false" >&2; }
  rm -rf "$hub" "$target_a"
  return "$ok"
}
run_test "boundary: registry — target marked integrated, neighbor unchanged" test_registry_updated

# 8. Boundary — target not in registry: registry unchanged, warn logged
test_registry_unknown_target() {
  local hub target
  hub="$(mktemp -d)"
  target="$(mktemp -d)"
  mkdir -p "$hub/projects"
  cat > "$hub/projects/registry.yaml" << 'YAML'
version: 1
projects:
  - name: my-project
    path: /tmp/my-project
    mcp_integrated: false
YAML
  local stderr_out ok=0
  stderr_out="$(SYNC_HUB_DIR="$hub" bash "$INSTALL_SCRIPT" "$target" 2>&1 >/dev/null || true)"
  [ -f "$target/.claude/settings.json" ] \
    || { ok=1; echo "  >> settings.json not created" >&2; }
  local entry_count
  entry_count="$(grep -c 'name:' "$hub/projects/registry.yaml")"
  [ "$entry_count" = "1" ] \
    || { ok=1; echo "  >> registry gained unexpected entry (count=$entry_count)" >&2; }
  echo "$stderr_out" | grep -qi "warn" \
    || { ok=1; echo "  >> expected warn in stderr for unknown project" >&2; }
  rm -rf "$hub" "$target"
  return "$ok"
}
run_test "boundary: target not in registry — apply succeeds, no new entry, warn logged" test_registry_unknown_target

echo ""
echo "passed: $PASS   failed: $FAIL"
exit "$FAIL"
