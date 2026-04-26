#!/usr/bin/env bash
# sync/install-feature-end-digest-hook.sh
# Propagates the feature-end-digest hook + digest-context helper to every
# downstream project listed in projects/registry.yaml.
#
# Usage: bash sync/install-feature-end-digest-hook.sh [--dry-run]
#
# Flags:
#   --dry-run   Print what would change; do not write files.
#
# Output: installed: N, skipped: M (already identical), failed: K
#
# Idempotent: a 2nd run with identical source files prints installed: 0, skipped: N, failed: 0.
# Backup: if a destination file exists and differs from source, it is backed up as
# <file>.bak.<UTC-ts> before being overwritten.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Error: unknown option '$1'" >&2; exit 64 ;;
  esac
  shift
done

REGISTRY="$SYNC_HUB_DIR/projects/registry.yaml"
if [ ! -f "$REGISTRY" ]; then
  log error "registry not found: $REGISTRY"
  exit 1
fi

# Source directories / files to propagate
HOOK_SRC_DIR="$SYNC_HUB_DIR/patterns/hooks/feature-end-digest"
HELPER_SRC="$SYNC_HUB_DIR/patterns/hooks/_lib/digest-context.sh"

if [ ! -d "$HOOK_SRC_DIR" ]; then
  log error "hook source directory absent: $HOOK_SRC_DIR"
  exit 4
fi
if [ ! -f "$HELPER_SRC" ]; then
  log error "helper source absent: $HELPER_SRC"
  exit 4
fi

# Canonical list of hook files to propagate (skip .gitkeep and hidden files)
HOOK_FILES=("hook.sh" "hook.json" "README.md" "test-hook.sh")

for f in "${HOOK_FILES[@]}"; do
  if [ ! -f "$HOOK_SRC_DIR/$f" ]; then
    log error "hook source file absent: $HOOK_SRC_DIR/$f"
    exit 4
  fi
done

# Extract project paths from registry.yaml (awk: zero-dep, portable)
PROJECT_PATHS=()
while IFS= read -r path_val; do
  [ -n "$path_val" ] && PROJECT_PATHS+=("$path_val")
done < <(awk '/^[[:space:]]+path:/{sub(/^[[:space:]]+path:[[:space:]]*/,""); print}' "$REGISTRY")

if [ "${#PROJECT_PATHS[@]}" -eq 0 ]; then
  log error "no project paths found in registry: $REGISTRY"
  exit 1
fi

INSTALLED=0
SKIPPED=0
FAILED=0

_install_project() {
  local proj_path="$1"

  if [ ! -d "$proj_path" ]; then
    log warn "project path not found, skipping: $proj_path"
    FAILED=$((FAILED + 1))
    return 0
  fi

  local dest_hook_dir="$proj_path/patterns/hooks/feature-end-digest"
  local dest_lib_dir="$proj_path/patterns/hooks/_lib"
  local dest_helper="$dest_lib_dir/digest-context.sh"

  # Idempotency: check if every file is already identical to source
  local all_identical=1
  for f in "${HOOK_FILES[@]}"; do
    if [ ! -f "$dest_hook_dir/$f" ] || ! cmp -s "$HOOK_SRC_DIR/$f" "$dest_hook_dir/$f"; then
      all_identical=0
      break
    fi
  done
  if [ "$all_identical" -eq 1 ]; then
    if [ ! -f "$dest_helper" ] || ! cmp -s "$HELPER_SRC" "$dest_helper"; then
      all_identical=0
    fi
  fi

  if [ "$all_identical" -eq 1 ]; then
    log debug "already identical, skipping: $proj_path"
    SKIPPED=$((SKIPPED + 1))
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    log info "[dry-run] would install to: $proj_path"
    INSTALLED=$((INSTALLED + 1))
    return 0
  fi

  mkdir -p "$dest_hook_dir" "$dest_lib_dir"

  local ts
  ts="$(date -u +%Y%m%dT%H%M%SZ)"

  for f in "${HOOK_FILES[@]}"; do
    local src="$HOOK_SRC_DIR/$f"
    local dst="$dest_hook_dir/$f"
    if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
      cp -p "$dst" "${dst}.bak.${ts}"
    fi
    cp -p "$src" "$dst"
  done

  if [ -f "$dest_helper" ] && ! cmp -s "$HELPER_SRC" "$dest_helper"; then
    cp -p "$dest_helper" "${dest_helper}.bak.${ts}"
  fi
  cp -p "$HELPER_SRC" "$dest_helper"

  chmod +x "$dest_hook_dir/hook.sh" 2>/dev/null || true

  log info "installed to: $proj_path"
  INSTALLED=$((INSTALLED + 1))
}

for proj_path in "${PROJECT_PATHS[@]}"; do
  _install_project "$proj_path"
done

echo "installed: ${INSTALLED}, skipped: ${SKIPPED} (already identical), failed: ${FAILED}"
exit 0
