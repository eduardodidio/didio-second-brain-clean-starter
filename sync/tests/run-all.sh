#!/usr/bin/env bash
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0; pass=0
for t in "$SCRIPT_DIR"/test-*.sh; do
  [ -f "$t" ] || continue
  echo "=== $(basename "$t") ==="
  if bash "$t"; then pass=$((pass+1)); else fail=$((fail+1)); fi
done
echo "passed: $pass   failed: $fail"
exit "$fail"
