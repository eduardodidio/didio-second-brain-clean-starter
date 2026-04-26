#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/assert.sh" || { echo "missing assert.sh"; exit 1; }

HUB_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALL_SCRIPT="$SCRIPT_DIR/../install-discord-hooks.sh"

PASS=0; FAIL=0

run_test() {
  local name="$1"; shift
  local rc=0
  ( "$@" ) || rc=$?
  if [ "$rc" = "0" ]; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name (exit $rc)"
    FAIL=$((FAIL+1))
  fi
}

# Create a sandbox with an isolated HOME and hub pointing at real patterns/hooks
make_sandbox() {
  local sandbox
  sandbox="$(mktemp -d)"
  echo "$sandbox"
}

# Run the install script with SYNC_HUB_DIR pointing at real hub
run_script() {
  SYNC_HUB_DIR="$HUB_DIR" bash "$INSTALL_SCRIPT" "$@"
}

echo "=== install-discord-hooks.sh ==="

# 1. Happy --user-scope, settings absent
test_user_scope_creates_settings() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  run_script --user-scope

  local settings="$HOME/.claude/settings.json"
  [ -f "$settings" ] || die "settings.json not created"
  jq empty "$settings" || die "settings.json is not valid JSON"
  [ "$(jq '.hooks.Stop | length' "$settings")" = "3" ] || die "expected 3 Stop hooks"
  [ "$(jq '.hooks.PostToolUse | length' "$settings")" = "1" ] || die "expected 1 PostToolUse hook"
  [ "$(jq '.hooks.SubagentStop | length' "$settings")" = "1" ] || die "expected 1 SubagentStop hook"
}
run_test "happy --user-scope settings absent: creates with 5 hooks" test_user_scope_creates_settings

# 2. Happy --user-scope, settings pre-existing with other keys preserved
test_user_scope_preserves_existing() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"
  echo '{"permissions":{"allow":["Read(./**)"]}}' > "$HOME/.claude/settings.json"

  run_script --user-scope

  local settings="$HOME/.claude/settings.json"
  jq empty "$settings" || die "settings.json is not valid JSON"
  local allow_val
  allow_val="$(jq -r '.permissions.allow[0]' "$settings")"
  [ "$allow_val" = "Read(./**)" ] || die "permissions.allow not preserved: $allow_val"
  [ "$(jq '.hooks.Stop | length' "$settings")" = "3" ] || die "expected 3 Stop hooks"
}
run_test "happy --user-scope existing settings: preserves permissions, adds hooks" test_user_scope_preserves_existing

# 3. Idempotency: 2nd run logs already installed, no extra backup
test_idempotency_user_scope() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"
  echo '{"permissions":{"allow":[]}}' > "$HOME/.claude/settings.json"

  run_script --user-scope

  local backup_count_1
  backup_count_1="$(ls "$HOME/.claude/" | grep -c "backup-" 2>/dev/null || echo 0)"

  local before_hash after_hash
  before_hash="$(md5 -q "$HOME/.claude/settings.json" 2>/dev/null || md5sum "$HOME/.claude/settings.json" | awk '{print $1}')"

  local log_output
  log_output="$(run_script --user-scope 2>&1)"

  after_hash="$(md5 -q "$HOME/.claude/settings.json" 2>/dev/null || md5sum "$HOME/.claude/settings.json" | awk '{print $1}')"

  local backup_count_2
  backup_count_2="$(ls "$HOME/.claude/" | grep -c "backup-" 2>/dev/null || echo 0)"

  echo "$log_output" | grep -q "already installed" || die "2nd run should log 'already installed'"
  [ "$before_hash" = "$after_hash" ] || die "file changed on 2nd run"
  [ "$backup_count_1" = "$backup_count_2" ] || die "extra backup created on 2nd run ($backup_count_1 -> $backup_count_2)"
}
run_test "idempotency --user-scope: 2nd run skips all, no extra backup" test_idempotency_user_scope

# 4. Merge preserves existing hooks.Stop entries from user
test_merge_preserves_user_hooks() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"
  printf '%s\n' '{"hooks":{"Stop":[{"matcher":"*","hooks":[{"type":"command","command":"echo bye"}]}]}}' \
    > "$HOME/.claude/settings.json"

  run_script --user-scope

  local settings="$HOME/.claude/settings.json"
  jq empty "$settings" || die "settings.json not valid JSON"
  local stop_count
  stop_count="$(jq '.hooks.Stop | length' "$settings")"
  [ "$stop_count" = "4" ] || die "expected 4 Stop entries (3 hub + 1 pre-existing), got $stop_count"
  jq -e '.hooks.Stop[] | select(.hooks[0].command == "echo bye")' "$settings" >/dev/null \
    || die "user's custom Stop hook not preserved"
}
run_test "merge: preserves user's existing hooks.Stop entry alongside new hub entry" test_merge_preserves_user_hooks

# 5. Happy --project <path>: installs in project, does not touch HOME
test_project_scope() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"
  local proj="$sandbox/target"
  mkdir -p "$proj"

  run_script --project "$proj"

  local proj_settings="$proj/.claude/settings.json"
  local home_settings="$HOME/.claude/settings.json"
  [ -f "$proj_settings" ] || die "project settings.json not created"
  jq empty "$proj_settings" || die "project settings.json is not valid JSON"
  [ "$(jq '.hooks.Stop | length' "$proj_settings")" = "3" ] || die "expected 3 Stop hooks in project"
  [ ! -f "$home_settings" ] || die "HOME settings.json was touched by --project mode"
}
run_test "happy --project <path>: installs in project dir, HOME untouched" test_project_scope

# 6. Error: no mode provided → exit 1
test_error_no_mode() {
  local rc=0
  SYNC_HUB_DIR="$HUB_DIR" bash "$INSTALL_SCRIPT" 2>/dev/null || rc=$?
  [ "$rc" = "1" ] || die "expected exit 1 for no mode, got $rc"
}
run_test "error: no mode exits 1" test_error_no_mode

# 7. Error: both modes → exit 1
test_error_both_modes() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  local rc=0
  SYNC_HUB_DIR="$HUB_DIR" bash "$INSTALL_SCRIPT" --user-scope --project "$sandbox" 2>/dev/null || rc=$?
  [ "$rc" = "1" ] || die "expected exit 1 for both modes, got $rc"
}
run_test "error: both --user-scope and --project exits 1" test_error_both_modes

# 8. Error: corrupt settings.json → exit 3, file unchanged
test_error_corrupt_json() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"
  printf '%s' '{{{not json' > "$HOME/.claude/settings.json"
  local before_content
  before_content="$(cat "$HOME/.claude/settings.json")"

  local rc=0
  run_script --user-scope 2>/dev/null || rc=$?

  local after_content
  after_content="$(cat "$HOME/.claude/settings.json")"
  [ "$rc" = "3" ] || die "expected exit 3 for corrupt JSON, got $rc"
  [ "$before_content" = "$after_content" ] || die "corrupt file was modified"
}
run_test "error: corrupt settings.json exits 3, file unchanged" test_error_corrupt_json

# 9. Error: hook source absent → exit 4
test_error_hook_source_absent() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  # Point SYNC_HUB_DIR to a dir that lacks the hook files
  local fake_hub="$sandbox/fake_hub"
  mkdir -p "$fake_hub/patterns/hooks/post-tool-use-error"
  mkdir -p "$fake_hub/patterns/hooks/subagent-stop-progress"
  # stop-session-summary is intentionally absent

  local rc=0
  SYNC_HUB_DIR="$fake_hub" bash "$INSTALL_SCRIPT" --user-scope 2>/dev/null || rc=$?
  [ "$rc" = "4" ] || die "expected exit 4 for absent hook.json, got $rc"
  [ ! -f "$HOME/.claude/settings.json" ] || die "settings.json created despite missing hook source"
}
run_test "error: hook source absent exits 4, no settings written" test_error_hook_source_absent

# 10. Dry-run: file unchanged, stdout shows diff
test_dry_run_no_write() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"
  echo '{"permissions":{"allow":["Bash"]}}' > "$HOME/.claude/settings.json"

  local before_content
  before_content="$(cat "$HOME/.claude/settings.json")"

  local stdout_output
  stdout_output="$(run_script --user-scope --dry-run)"

  local after_content
  after_content="$(cat "$HOME/.claude/settings.json")"

  [ "$before_content" = "$after_content" ] || die "file modified during --dry-run"
  [ -n "$stdout_output" ] || die "dry-run produced no stdout diff"
}
run_test "dry-run: file unchanged, stdout shows diff" test_dry_run_no_write

# 11. Absolute path in command: no $CLAUDE_PROJECT_DIR residual
test_absolute_path_in_command() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  run_script --user-scope

  local settings="$HOME/.claude/settings.json"
  local stop_cmd
  stop_cmd="$(jq -r '.hooks.Stop[0].hooks[0].command' "$settings")"

  echo "$stop_cmd" | grep -q "\$CLAUDE_PROJECT_DIR" \
    && die "command contains literal \$CLAUDE_PROJECT_DIR: $stop_cmd" || true
  echo "$stop_cmd" | grep -qF "$HUB_DIR" \
    || die "command does not contain hub absolute path: $stop_cmd"
  echo "$stop_cmd" | grep -qF "stop-session-summary/hook.sh" \
    || die "command does not reference hook.sh: $stop_cmd"
}
run_test "absolute path: command contains hub abs path, no \$CLAUDE_PROJECT_DIR" test_absolute_path_in_command

# 12. Idempotency under 5 consecutive runs — always exactly the same output
test_idempotency_five_runs() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  for i in 1 2 3 4 5; do
    run_script --user-scope 2>/dev/null
  done

  local settings="$HOME/.claude/settings.json"
  jq empty "$settings" || die "settings.json invalid after 5 runs"
  [ "$(jq '.hooks.Stop | length' "$settings")" = "3" ] || die "Stop has ≠3 entries after 5 runs"
  [ "$(jq '.hooks.PostToolUse | length' "$settings")" = "1" ] || die "PostToolUse has ≠1 entry after 5 runs"
  [ "$(jq '.hooks.SubagentStop | length' "$settings")" = "1" ] || die "SubagentStop has ≠1 entry after 5 runs"
}
run_test "idempotency: 5 consecutive runs produce exactly 1 entry per event" test_idempotency_five_runs

# 13. Syntax check
test_syntax_valid() {
  bash -n "$INSTALL_SCRIPT"
}
run_test "syntax: bash -n passes" test_syntax_valid

# 14. Error: feature-context.sh absent in hub → exit 4, names missing path
test_error_helper_feature_context_absent() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  # Build a fake hub with hook.json files but missing feature-context.sh
  local fake_hub="$sandbox/fake_hub"
  for hook_dir in stop-session-summary post-tool-use-error subagent-stop-progress no-pending-work-alert rate-limit-alert; do
    mkdir -p "$fake_hub/patterns/hooks/$hook_dir"
    cp "$HUB_DIR/patterns/hooks/$hook_dir/hook.json" "$fake_hub/patterns/hooks/$hook_dir/hook.json"
  done
  mkdir -p "$fake_hub/patterns/hooks/_lib"
  cp "$HUB_DIR/patterns/hooks/_lib/load-env.sh"          "$fake_hub/patterns/hooks/_lib/load-env.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/registry-match.sh"    "$fake_hub/patterns/hooks/_lib/registry-match.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/no-pending-work.sh"   "$fake_hub/patterns/hooks/_lib/no-pending-work.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/rate-limit-detect.sh" "$fake_hub/patterns/hooks/_lib/rate-limit-detect.sh"
  # feature-context.sh intentionally absent

  local rc=0 err_output
  err_output="$(SYNC_HUB_DIR="$fake_hub" bash "$INSTALL_SCRIPT" --user-scope 2>&1)" || rc=$?

  [ "$rc" = "4" ] || die "expected exit 4 for absent feature-context.sh, got $rc"
  echo "$err_output" | grep -q "feature-context.sh" \
    || die "error message does not name feature-context.sh: $err_output"
  [ ! -f "$HOME/.claude/settings.json" ] || die "settings.json created despite missing helper"
}
run_test "error: feature-context.sh absent in hub exits 4 naming the path" test_error_helper_feature_context_absent

# 15. Error: load-env.sh absent in hub → exit 4, names missing path (loop covers all 3)
test_error_helper_load_env_absent() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  local fake_hub="$sandbox/fake_hub"
  for hook_dir in stop-session-summary post-tool-use-error subagent-stop-progress no-pending-work-alert rate-limit-alert; do
    mkdir -p "$fake_hub/patterns/hooks/$hook_dir"
    cp "$HUB_DIR/patterns/hooks/$hook_dir/hook.json" "$fake_hub/patterns/hooks/$hook_dir/hook.json"
  done
  mkdir -p "$fake_hub/patterns/hooks/_lib"
  # load-env.sh intentionally absent; the others are present
  cp "$HUB_DIR/patterns/hooks/_lib/registry-match.sh"    "$fake_hub/patterns/hooks/_lib/registry-match.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/feature-context.sh"   "$fake_hub/patterns/hooks/_lib/feature-context.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/no-pending-work.sh"   "$fake_hub/patterns/hooks/_lib/no-pending-work.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/rate-limit-detect.sh" "$fake_hub/patterns/hooks/_lib/rate-limit-detect.sh"

  local rc=0 err_output
  err_output="$(SYNC_HUB_DIR="$fake_hub" bash "$INSTALL_SCRIPT" --user-scope 2>&1)" || rc=$?

  [ "$rc" = "4" ] || die "expected exit 4 for absent load-env.sh, got $rc"
  echo "$err_output" | grep -q "load-env.sh" \
    || die "error message does not name load-env.sh: $err_output"
}
run_test "error: load-env.sh absent in hub exits 4 naming the path" test_error_helper_load_env_absent

# 16. Error: no-pending-work.sh absent in hub → exit 4, names missing path
test_error_helper_no_pending_work_absent() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  local fake_hub="$sandbox/fake_hub"
  for hook_dir in stop-session-summary post-tool-use-error subagent-stop-progress no-pending-work-alert rate-limit-alert; do
    mkdir -p "$fake_hub/patterns/hooks/$hook_dir"
    cp "$HUB_DIR/patterns/hooks/$hook_dir/hook.json" "$fake_hub/patterns/hooks/$hook_dir/hook.json"
  done
  mkdir -p "$fake_hub/patterns/hooks/_lib"
  cp "$HUB_DIR/patterns/hooks/_lib/load-env.sh"          "$fake_hub/patterns/hooks/_lib/load-env.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/registry-match.sh"    "$fake_hub/patterns/hooks/_lib/registry-match.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/feature-context.sh"   "$fake_hub/patterns/hooks/_lib/feature-context.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/rate-limit-detect.sh" "$fake_hub/patterns/hooks/_lib/rate-limit-detect.sh"
  # no-pending-work.sh intentionally absent

  local rc=0 err_output
  err_output="$(SYNC_HUB_DIR="$fake_hub" bash "$INSTALL_SCRIPT" --user-scope 2>&1)" || rc=$?

  [ "$rc" = "4" ] || die "expected exit 4 for absent no-pending-work.sh, got $rc"
  echo "$err_output" | grep -q "no-pending-work.sh" \
    || die "error message does not name no-pending-work.sh: $err_output"
  [ ! -f "$HOME/.claude/settings.json" ] || die "settings.json created despite missing helper"
}
run_test "error: no-pending-work.sh absent in hub exits 4 naming the path" test_error_helper_no_pending_work_absent

# 17. Error: rate-limit-detect.sh absent in hub → exit 4, names missing path
test_error_helper_rate_limit_detect_absent() {
  local sandbox; sandbox="$(make_sandbox)"
  trap 'rm -rf "$sandbox"' RETURN
  export HOME="$sandbox/home"
  mkdir -p "$HOME/.claude"

  local fake_hub="$sandbox/fake_hub"
  for hook_dir in stop-session-summary post-tool-use-error subagent-stop-progress no-pending-work-alert rate-limit-alert; do
    mkdir -p "$fake_hub/patterns/hooks/$hook_dir"
    cp "$HUB_DIR/patterns/hooks/$hook_dir/hook.json" "$fake_hub/patterns/hooks/$hook_dir/hook.json"
  done
  mkdir -p "$fake_hub/patterns/hooks/_lib"
  cp "$HUB_DIR/patterns/hooks/_lib/load-env.sh"          "$fake_hub/patterns/hooks/_lib/load-env.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/registry-match.sh"    "$fake_hub/patterns/hooks/_lib/registry-match.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/feature-context.sh"   "$fake_hub/patterns/hooks/_lib/feature-context.sh"
  cp "$HUB_DIR/patterns/hooks/_lib/no-pending-work.sh"   "$fake_hub/patterns/hooks/_lib/no-pending-work.sh"
  # rate-limit-detect.sh intentionally absent

  local rc=0 err_output
  err_output="$(SYNC_HUB_DIR="$fake_hub" bash "$INSTALL_SCRIPT" --user-scope 2>&1)" || rc=$?

  [ "$rc" = "4" ] || die "expected exit 4 for absent rate-limit-detect.sh, got $rc"
  echo "$err_output" | grep -q "rate-limit-detect.sh" \
    || die "error message does not name rate-limit-detect.sh: $err_output"
  [ ! -f "$HOME/.claude/settings.json" ] || die "settings.json created despite missing helper"
}
run_test "error: rate-limit-detect.sh absent in hub exits 4 naming the path" test_error_helper_rate_limit_detect_absent

echo ""
echo "passed: $PASS   failed: $FAIL"
exit "$FAIL"
