#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/_bootstrap/scripts/lint-vault.sh"
PASS=0; FAIL=0
SANDBOX=""

fail() { echo "  FAIL: $*"; FAIL=$((FAIL+1)); }
pass() { echo "  PASS: $*"; PASS=$((PASS+1)); }

cleanup() { [ -n "${SANDBOX:-}" ] && [ -d "$SANDBOX" ] && rm -rf "$SANDBOX"; SANDBOX=""; }
trap cleanup EXIT

make_sandbox_with_defects() {
  cleanup
  SANDBOX="$(mktemp -d -t f09-lint.XXXXXX)"
  mkdir -p "$SANDBOX/docs/adr" "$SANDBOX/memory/agent-learnings" \
           "$SANDBOX/memory/notes" "$SANDBOX/knowledge/topic"

  # ADR ok — all required fields present
  cat > "$SANDBOX/docs/adr/0001-ok.md" <<'EOF'
# ADR-0001: Good example

**Status:** accepted
**Date:** 2026-04-24

## Context
Fine.
EOF

  # ADR missing **Status:** -> critical
  cat > "$SANDBOX/docs/adr/0002-broken.md" <<'EOF'
# ADR-0002: Missing status

**Date:** 2026-04-24

## Context
Broken.
EOF

  # learnings ok — both role and updated present
  cat > "$SANDBOX/memory/agent-learnings/developer.md" <<'EOF'
---
role: developer
updated: 2026-04-24
---
# Developer learnings
EOF

  # learnings missing updated -> critical
  cat > "$SANDBOX/memory/agent-learnings/architect.md" <<'EOF'
---
role: architect
---
# Architect learnings
EOF

  # log (timestamp-prefix): IGNORED by lint
  cat > "$SANDBOX/memory/agent-learnings/2026-04-18T00-00-00-000Z-role-developer-x.md" <<'EOF'
(log without frontmatter — lint must ignore)
EOF

  # stale active -> warning (updated well over 30 days ago)
  cat > "$SANDBOX/memory/notes/stale.md" <<'EOF'
---
status: active
updated: 2020-01-01
---
# Ancient.
EOF

  # broken wikilink -> warning (phantom-note does not exist; note-b does)
  cat > "$SANDBOX/memory/notes/broken-link.md" <<'EOF'
Points to [[phantom-note]] and [[note-b]].
EOF

  # entrypoint — orphan audit must skip this file
  cat > "$SANDBOX/knowledge/topic/note-a.md" <<'EOF'
---
entrypoint: true
---
Entrypoint.
EOF

  # linked from broken-link.md via [[note-b]] — not an orphan
  cat > "$SANDBOX/knowledge/topic/note-b.md" <<'EOF'
Linked from broken-link.md.
EOF

  # orphan -> nit (no inbound wikilinks, not an entrypoint)
  cat > "$SANDBOX/knowledge/topic/lonely.md" <<'EOF'
No one links to me.
EOF
}

# --- scenario: all five defect types detected ---
scenario_detects_all_defects() {
  make_sandbox_with_defects
  local out; out="$(bash "$SCRIPT" --hub "$SANDBOX")"

  # 1. missing-frontmatter-adr (critical)
  echo "$out" | grep -q 'missing-frontmatter-adr' \
    || { fail "ADR defect not reported"; return; }
  echo "$out" | grep 'missing-frontmatter-adr' | grep -q 'critical' \
    || { fail "ADR defect severity != critical"; return; }

  # 2. missing-frontmatter-learnings (critical)
  echo "$out" | grep -q 'missing-frontmatter-learnings' \
    || { fail "learnings defect not reported"; return; }

  # 3. broken-wikilink (warning) — phantom-note yes, note-b no
  echo "$out" | grep -q 'phantom-note' \
    || { fail "broken wikilink phantom-note not reported"; return; }
  echo "$out" | grep 'broken-wikilink' | grep -q 'note-b' \
    && { fail "note-b wrongly reported as broken wikilink"; return; } || true

  # 4. stale-active (warning)
  echo "$out" | grep -q 'stale-active' \
    || { fail "stale-active defect not reported"; return; }

  # 5. orphan (nit) — lonely.md yes, note-a.md (entrypoint) no
  echo "$out" | grep -q 'lonely\.md' \
    || { fail "orphan lonely.md not reported"; return; }
  echo "$out" | grep 'orphan' | grep -q 'note-a\.md' \
    && { fail "entrypoint note-a.md wrongly reported as orphan"; return; } || true

  # 6. log file must be ignored entirely
  echo "$out" | grep -q '2026-04-18T00-00-00' \
    && { fail "log file leaked into lint output"; return; } || true

  pass "all defects detected correctly"
}

# --- scenario: severity ordering critical -> warning -> nit ---
scenario_ordering_by_severity() {
  make_sandbox_with_defects
  local out; out="$(bash "$SCRIPT" --hub "$SANDBOX")"

  local severities
  severities="$(echo "$out" | awk '/^\| (critical|warning|nit) /' \
    | awk -F'|' '{gsub(/ /,"",$2); print $2}')"

  [ -n "$severities" ] || { fail "no severity rows found in output table"; return; }

  echo "$severities" | awk '
    BEGIN { phase=1 }
    {
      if ($0 == "critical") { if (phase > 1) { exit 1 } }
      else if ($0 == "warning") { if (phase > 2) { exit 1 } else phase=2 }
      else if ($0 == "nit") { phase=3 }
    }
  ' || { fail "severity order violated (must be critical → warning → nit)"; return; }

  pass "severity ordering correct"
}

# --- scenario: clean vault reports no defects ---
scenario_clean_vault() {
  cleanup
  SANDBOX="$(mktemp -d -t f09-lint.XXXXXX)"
  mkdir -p "$SANDBOX/docs/adr" "$SANDBOX/memory/agent-learnings"

  # Capture first to avoid SIGPIPE from grep -q exiting early with pipefail active
  local out; out="$(bash "$SCRIPT" --hub "$SANDBOX")"
  echo "$out" | grep -q 'No defects found' \
    || { fail "clean vault did not report 'No defects found'"; return; }
  pass "clean vault reports empty"
}

# --- scenario: exit 0 even when defects are present ---
scenario_exit_zero_on_defects() {
  make_sandbox_with_defects
  if bash "$SCRIPT" --hub "$SANDBOX" > /dev/null; then
    pass "exit 0 on defects"
  else
    fail "exit non-zero on defects"
  fi
}

# --- scenario: script is read-only (no sandbox files modified) ---
scenario_read_only() {
  make_sandbox_with_defects
  local before; before="$(find "$SANDBOX" -type f -exec stat -f '%N %m' {} \; 2>/dev/null | sort)"
  bash "$SCRIPT" --hub "$SANDBOX" > /dev/null
  local after; after="$(find "$SANDBOX" -type f -exec stat -f '%N %m' {} \; 2>/dev/null | sort)"
  [ "$before" = "$after" ] \
    && pass "read-only: no file mtime changed" \
    || fail "files were modified by lint-vault.sh"
}

for s in scenario_detects_all_defects scenario_ordering_by_severity \
         scenario_clean_vault scenario_exit_zero_on_defects scenario_read_only; do
  echo "[$s]"; $s || true
done

echo "===== $PASS passed, $FAIL failed ====="
[ "$FAIL" -eq 0 ] || exit 1
