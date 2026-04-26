#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/_bootstrap/scripts/daily-heartbeat.sh"
PASS=0; FAIL=0
SANDBOX=""

# ── assertion helpers ─────────────────────────────────────────────────────────

fail() { echo "  FAIL: $*"; FAIL=$((FAIL+1)); }
pass() { echo "  PASS: $*"; PASS=$((PASS+1)); }

assert_score_eq() {
  local expected="$1" actual
  actual="$(awk '/^score:/ {print $2; exit}' "$SANDBOX/memory/heartbeat-latest.md")"
  [ "$actual" = "$expected" ] || fail "score: esperado=$expected actual=$actual"
}

assert_curl_called() {
  [ -s "$SANDBOX/curl.log" ] || fail "curl não foi chamado"
}

assert_curl_not_called() {
  [ ! -s "$SANDBOX/curl.log" ] || fail "curl foi chamado e não deveria"
}

assert_log_line_count() {
  local expected="$1" actual
  actual="$(wc -l < "$SANDBOX/memory/activity-log.md")"
  [ "$actual" -eq "$expected" ] || fail "activity-log: esperado=$expected actual=$actual"
}

# ── sandbox ───────────────────────────────────────────────────────────────────

make_sandbox() {
  # Clean up previous sandbox before creating a new one
  [ -n "${SANDBOX:-}" ] && [ -d "$SANDBOX" ] && rm -rf "$SANDBOX"

  SANDBOX="$(mktemp -d -t f09-heartbeat.XXXXXX)"
  mkdir -p "$SANDBOX/memory" "$SANDBOX/projects" "$SANDBOX/patterns/hooks/_lib" "$SANDBOX/bin"

  cp "$REPO_ROOT/patterns/hooks/_lib/load-env.sh" "$SANDBOX/patterns/hooks/_lib/"

  # curl fake: logs args to SANDBOX_CURL_LOG env var (expanded at runtime)
  cat > "$SANDBOX/bin/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
echo "$@" >> "$SANDBOX_CURL_LOG"
FAKE_CURL
  chmod +x "$SANDBOX/bin/curl"

  printf '# Activity log\n\n' > "$SANDBOX/memory/activity-log.md"
  printf -- '---\nupdated: %s\nstatus: active\n---\nseed\n' "$(date -u +%F)" \
    > "$SANDBOX/memory/current-state.md"
  printf 'version: 1\nprojects: []\n' > "$SANDBOX/projects/registry.yaml"

  cat > "$SANDBOX/.env" <<DOTENV
DISCORD_ENABLED=true
DISCORD_WEBHOOK_ALERTS=https://example.invalid/webhook
DOTENV

  export SANDBOX_CURL_LOG="$SANDBOX/curl.log"
  : > "$SANDBOX_CURL_LOG"
}

cleanup() { [ -n "${SANDBOX:-}" ] && [ -d "$SANDBOX" ] && rm -rf "$SANDBOX"; }
trap cleanup EXIT

# ── helpers ───────────────────────────────────────────────────────────────────

touch_old() {
  local file="$1" days="$2"
  if [ "$(uname)" = "Darwin" ]; then
    touch -t "$(date -v-${days}d +%Y%m%d%H%M)" "$file"
  else
    touch -d "${days} days ago" "$file"
  fi
}

plant_stale_registry() {
  local count="$1" stale_date
  if [ "$(uname)" = "Darwin" ]; then
    stale_date="$(date -v-60d +%F)"
  else
    stale_date="$(date -d '60 days ago' +%F)"
  fi
  {
    printf 'version: 1\nprojects:\n'
    for i in $(seq 1 "$count"); do
      printf '  - name: project-%d\n    status: active\n    last_activity: %s\n' \
        "$i" "$stale_date"
    done
  } > "$SANDBOX/projects/registry.yaml"
}

run() {
  SECOND_BRAIN_HUB="$SANDBOX" PATH="$SANDBOX/bin:$PATH" \
    bash "$SCRIPT" --hub "$SANDBOX" "$@"
}

# ── scenarios ─────────────────────────────────────────────────────────────────

# Fresh vault: score 10, no alert
scenario_clean_vault() {
  make_sandbox
  run
  assert_score_eq 10
  assert_curl_not_called
}

# current-state.md 20d old → penalty -4 → score 6 → alert
scenario_stale_current() {
  make_sandbox
  touch_old "$SANDBOX/memory/current-state.md" 20
  run
  assert_score_eq 6
  assert_curl_called
}

# 3 .needs-end-session flags → penalty -3 → score 7 → no alert (boundary: not < 7)
scenario_needs_end_flags() {
  make_sandbox
  touch "$SANDBOX/memory/.needs-end-session-a" \
        "$SANDBOX/memory/.needs-end-session-b" \
        "$SANDBOX/memory/.needs-end-session-c"
  run
  assert_score_eq 7
  assert_curl_not_called
}

# 5 stale active projects → penalty -5 → score 5 → alert
scenario_stale_registry() {
  make_sandbox
  plant_stale_registry 5
  run
  assert_score_eq 5
  assert_curl_called
}

# webhook URL empty → no curl even when score < 7
scenario_webhook_empty() {
  make_sandbox
  sed -i.bak 's|^DISCORD_WEBHOOK_ALERTS=.*|DISCORD_WEBHOOK_ALERTS=|' "$SANDBOX/.env"
  touch_old "$SANDBOX/memory/current-state.md" 20
  run
  assert_curl_not_called
}

# Explicit boundary: score = 7 must NOT trigger alert (alert only when score < 7)
scenario_boundary_score_7() {
  make_sandbox
  touch "$SANDBOX/memory/.needs-end-session-a" \
        "$SANDBOX/memory/.needs-end-session-b" \
        "$SANDBOX/memory/.needs-end-session-c"
  run
  assert_score_eq 7
  assert_curl_not_called
}

# missing current-state.md → penalty -4 → score 6 → alert
scenario_missing_current() {
  make_sandbox
  rm "$SANDBOX/memory/current-state.md"
  run
  assert_score_eq 6
  assert_curl_called
}

# two runs append two lines; initial stub has 2 lines → total 4
scenario_log_append() {
  make_sandbox
  run
  run
  assert_log_line_count 4
}

# ── main ──────────────────────────────────────────────────────────────────────

for s in scenario_clean_vault scenario_stale_current scenario_needs_end_flags \
          scenario_stale_registry scenario_webhook_empty scenario_boundary_score_7 \
          scenario_missing_current scenario_log_append; do
  echo "[$s]"
  $s && pass "$s" || fail "$s"
done

echo "===== $PASS passed, $FAIL failed ====="
[ "$FAIL" -eq 0 ] || exit 1
