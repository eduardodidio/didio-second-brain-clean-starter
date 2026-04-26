#!/usr/bin/env bash
# F15-T05 e2e hermetic test for token-report.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HUB_ROOT="$(cd "$HERE/../../.." && pwd)"
SCRIPT="$HUB_ROOT/_bootstrap/scripts/token-report.sh"

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

# Copy fixture into sandbox; touch all to "now"
cp -R "$HUB_ROOT/_bootstrap/scripts/_lib/fixtures/token-report/projects" \
      "$SANDBOX/projects"
find "$SANDBOX/projects" -type f -exec touch {} \;

# Sandbox hub: minimal copy with helpers + lib + load-env stub
mkdir -p "$SANDBOX/hub/_bootstrap/scripts/_lib"
mkdir -p "$SANDBOX/hub/patterns/hooks/_lib"
mkdir -p "$SANDBOX/hub/memory/token-reports"
mkdir -p "$SANDBOX/hub/docs/adr"
cp "$HUB_ROOT/_bootstrap/scripts/_lib/token-collector.sh" "$SANDBOX/hub/_bootstrap/scripts/_lib/"
cp "$HUB_ROOT/_bootstrap/scripts/_lib/token-economy.sh" "$SANDBOX/hub/_bootstrap/scripts/_lib/"
cp "$SCRIPT" "$SANDBOX/hub/_bootstrap/scripts/"
# Stub load-env that does nothing (no .env in sandbox)
cat > "$SANDBOX/hub/patterns/hooks/_lib/load-env.sh" <<'EOF'
load_hub_env() { :; }
EOF

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

# Run dry-run — captures stderr (report body written there in dry-run mode)
out_err="$(bash "$SANDBOX/hub/_bootstrap/scripts/token-report.sh" \
  --dry-run --hub "$SANDBOX/hub" --transcripts-root "$SANDBOX/projects" \
  2>&1 >/dev/null)"

echo "$out_err" | grep -q '# Token usage report' && pass "h1" || fail "no h1"
echo "$out_err" | grep -q '## Totals' && pass "totals-section" || fail "no totals"
echo "$out_err" | grep -q '## By project' && pass "by-project" || fail "no by-project"
echo "$out_err" | grep -q '## By model' && pass "by-model" || fail "no by-model"
echo "$out_err" | grep -q '## Estimated economy' && pass "economy" || fail "no economy"
echo "$out_err" | grep -q '0009-token-economy-estimation.md' && pass "adr-link" || fail "no adr link"
echo "$out_err" | grep -qi 'Privacy' && pass "privacy-note" || fail "no privacy"

# Exit code is 0 even with no webhook (fire-and-forget)
bash "$SANDBOX/hub/_bootstrap/scripts/token-report.sh" \
  --hub "$SANDBOX/hub" --transcripts-root "$SANDBOX/projects" \
  >/dev/null 2>&1
rc=$?
[ "$rc" = "0" ] && pass "exit-0" || fail "exit=$rc"

# File was written
[ -f "$SANDBOX/hub/memory/token-reports/$(date +%F).md" ] \
  && pass "file-written" || fail "no report file"

echo "ALL PASSED"
