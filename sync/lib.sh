#!/usr/bin/env bash
set -o pipefail

SYNC_HUB_DIR="${SYNC_HUB_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# log <level> <msg> — writes [UTC-iso] [level] msg to stderr; debug suppressed unless SYNC_DEBUG=1
log() {
  local level="${1:-info}" msg="${2:-}"
  [ "$level" = "debug" ] && [ "${SYNC_DEBUG:-0}" != "1" ] && return 0
  local ts
  ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  echo "[$ts] [$level] $msg" >&2
}

# require_jq — exits 2 with friendly message if jq is not installed
require_jq() {
  if ! command -v jq > /dev/null 2>&1; then
    echo "Error: 'jq' is required but not installed. Install it (e.g. brew install jq) and retry." >&2
    exit 2
  fi
}

# backup_file <path> — copies <path> to <path>.backup-<ts>; prints backup path to stdout; noop if absent
backup_file() {
  local path="$1"
  if [ ! -e "$path" ]; then
    log warn "backup_file: '$path' does not exist — skipping"
    return 0
  fi
  local ts backup
  ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  backup="${path}.backup-${ts}"
  cp -p "$path" "$backup"
  echo "$backup"
}

# jq_merge_into <file> <jq-expression> — applies jq expr to file atomically; creates file as {} if absent
jq_merge_into() {
  local file="$1" expr="$2"
  local tmp
  tmp="$(mktemp)"
  if [ ! -e "$file" ]; then echo '{}' > "$file"; fi
  jq "$expr" "$file" > "$tmp" || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$file"
}

# registry_mark_integrated <project-path> — sets mcp_integrated: true for matching path in registry.yaml
registry_mark_integrated() {
  local target_path="$1"
  local registry="$SYNC_HUB_DIR/projects/registry.yaml"
  if [ ! -f "$registry" ]; then
    log error "registry not found: $registry"
    return 1
  fi
  local tmp
  tmp="$(mktemp)"
  awk -v target="$target_path" '
    BEGIN { in_match=0; found=0 }
    /^  - name:/ { in_match=0 }
    /^    path:/ {
      val=$0
      sub(/^    path: */, "", val)
      sub(/#.*$/, "", val)
      gsub(/[ \t]+$/, "", val)
      gsub(/^[ \t]+/, "", val)
      if (val == target) { in_match=1; found=1 }
    }
    in_match==1 && /^    mcp_integrated:/ {
      print "    mcp_integrated: true"
      in_match=0
      next
    }
    { print }
    END { if (!found) print "WARN: project not found" > "/dev/stderr" }
  ' "$registry" > "$tmp"
  mv "$tmp" "$registry"
  return 0
}
