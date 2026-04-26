#!/usr/bin/env bash
# Hermetic end-to-end test for subagent-stop-progress/hook.sh.
# Uses a fake curl stub; zero external dependencies. Safe to run N times.
set -euo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HOOK_DIR/hook.sh"
FIX_DIR="$HOOK_DIR/fixtures"
LIB_FIX_DIR="$HOOK_DIR/../_lib/fixtures/feature-context"

# --- Sandbox setup ---
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

mkdir -p "$SANDBOX/bin"

# --- Fake curl stub ---
# Hook calls: curl ... -d "$PAYLOAD" "$WEBHOOK" > /dev/null 2>&1
# Stub iterates $@ and captures the argument after -d into last-payload.json.
cat > "$SANDBOX/bin/curl" << STUB
#!/usr/bin/env bash
capture_next=false
for arg in "\$@"; do
  if \$capture_next; then
    printf '%s' "\$arg" > "$SANDBOX/last-payload.json"
    capture_next=false
  elif [ "\$arg" = "-d" ]; then
    capture_next=true
  fi
done
exit 0
STUB
chmod +x "$SANDBOX/bin/curl"

export PATH="$SANDBOX/bin:$PATH"

# --- Env: prevent hook early-exits ---
export DISCORD_WEBHOOK_PROGRESS="http://localhost:0/fake"
export DISCORD_ENABLED="true"
# Bypass registry-match filter (this repo is not in projects/registry.yaml)
export DIDIO_HOOKS_DISABLE_FILTER="1"

PASS_COUNT=0
FAIL_COUNT=0

run_case() {
  local name="$1"
  local stdin_json="$2"
  local expected_role="$3"

  rm -f "$SANDBOX/last-payload.json"

  if printf '%s' "$stdin_json" | bash "$HOOK" > /dev/null 2>&1; then
    if [ -f "$SANDBOX/last-payload.json" ] && grep -q "Role: $expected_role" "$SANDBOX/last-payload.json"; then
      echo "PASS $name"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      local actual="(no payload file)"
      [ -f "$SANDBOX/last-payload.json" ] && actual="$(cat "$SANDBOX/last-payload.json")"
      echo "FAIL $name: expected 'Role: $expected_role' in payload, got: $actual"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  else
    echo "FAIL $name: hook exited non-zero"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Case 1: happy path — last subagent_type in transcript is "Explore"
run_case "happy" \
  "{\"session_id\":\"t1\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"$FIX_DIR/happy.jsonl\"}" \
  "Explore"

# Case 2: empty transcript — no subagent_type entries → unknown
run_case "empty" \
  "{\"session_id\":\"t2\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"$FIX_DIR/empty.jsonl\"}" \
  "unknown"

# Case 3: malformed transcript (not JSON) — grep finds nothing → unknown
run_case "malformed" \
  "{\"session_id\":\"t3\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"$FIX_DIR/malformed.jsonl\"}" \
  "unknown"

# Case 4: stdin JSON has no transcript_path field → unknown
run_case "no-transcript-field" \
  "{\"session_id\":\"t4\",\"hook_event_name\":\"SubagentStop\"}" \
  "unknown"

# Case 5: transcript_path points to nonexistent file → unknown
run_case "nonexistent-path" \
  "{\"session_id\":\"t5\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"/tmp/nope-$$-nonexistent.jsonl\"}" \
  "unknown"

# Case 6: sidecar .meta.json supplies agentType even when transcript body has none
run_case "meta-happy" \
  "{\"session_id\":\"t6\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"$FIX_DIR/meta-happy.jsonl\"}" \
  "qa"

# Case 7: sidecar agentType wins over transcript-body subagent_type matches
run_case "meta-overrides-body" \
  "{\"session_id\":\"t7\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"$FIX_DIR/meta-overrides.jsonl\"}" \
  "architect"

# Case 8: feature active via fixture — Phase and Feature fields appear in payload
_HUB8="$SANDBOX/hub8"
cp -R "$LIB_FIX_DIR/happy/." "$_HUB8/"
rm -f "$SANDBOX/last-payload.json"
printf '%s' "{\"session_id\":\"t8\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"$FIX_DIR/happy.jsonl\"}" \
  | SECOND_BRAIN_HUB="$_HUB8" DIDIO_FEATURE="F90" bash "$HOOK" > /dev/null 2>&1 || true
if [ -f "$SANDBOX/last-payload.json" ] \
  && grep -qF '"name":"Phase"' "$SANDBOX/last-payload.json" \
  && grep -qF '"name":"Feature"' "$SANDBOX/last-payload.json"; then
  echo "PASS case-8-feature-active"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  _actual="(no payload file)"
  [ -f "$SANDBOX/last-payload.json" ] && _actual="$(cat "$SANDBOX/last-payload.json")"
  echo "FAIL case-8-feature-active: expected Phase and Feature fields, got: $_actual"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Case 9: empty hub (no tasks/features/) — Feature field absent, project always present
_HUB9="$SANDBOX/hub9"
mkdir -p "$_HUB9"
rm -f "$SANDBOX/last-payload.json"
printf '%s' "{\"session_id\":\"t9\",\"hook_event_name\":\"SubagentStop\",\"transcript_path\":\"$FIX_DIR/happy.jsonl\"}" \
  | SECOND_BRAIN_HUB="$_HUB9" bash "$HOOK" > /dev/null 2>&1 || true
if [ -f "$SANDBOX/last-payload.json" ] \
  && ! grep -qF '"name":"Feature"' "$SANDBOX/last-payload.json" \
  && grep -qF '"name":"project"' "$SANDBOX/last-payload.json"; then
  echo "PASS case-9-no-feature"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  _actual="(no payload file)"
  [ -f "$SANDBOX/last-payload.json" ] && _actual="$(cat "$SANDBOX/last-payload.json")"
  echo "FAIL case-9-no-feature: expected no Feature field and project present, got: $_actual"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "RESULT: $FAIL_COUNT/$((PASS_COUNT + FAIL_COUNT)) cases FAILED"
  exit 1
fi

echo "OK: 9/9 cases"
exit 0
