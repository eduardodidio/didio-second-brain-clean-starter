#!/usr/bin/env bash
# _bootstrap/scripts/lint-vault.sh
# F09: structural, read-only audit of the second-brain vault. Outputs markdown.
# Supports --hub <path> for hermetic/sandbox testing.
# Note: timestamp-prefix log files (^YYYY-MM-DDT...) in agent-learnings/ are
# intentionally ignored — they are hook-generated logs, not canonical learnings.

set -u

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
HUB_ROOT=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --hub)
            HUB_ROOT="$2"
            shift 2
            ;;
        *)
            printf 'Unknown argument: %s\n' "$1" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$HUB_ROOT" ]]; then
    _SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    HUB_ROOT="$(cd "$_SCRIPT_DIR/../.." && pwd)"
fi

TODAY="$(date +%F)"
_SCANNED_COUNT=0

# ---------------------------------------------------------------------------
# File collection helpers
# ---------------------------------------------------------------------------

# Returns 0 (true) if the file's basename matches the timestamp-prefix log pattern
is_log_file() {
    local _bn
    _bn="$(basename "$1")"
    [[ "$_bn" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]
}

# knowledge/ + memory/ + docs/ — used for wikilink scanning and file count
collect_scan_files() {
    local _dirs=()
    [[ -d "$HUB_ROOT/knowledge" ]] && _dirs+=("$HUB_ROOT/knowledge")
    [[ -d "$HUB_ROOT/memory" ]]    && _dirs+=("$HUB_ROOT/memory")
    [[ -d "$HUB_ROOT/docs" ]]      && _dirs+=("$HUB_ROOT/docs")
    [[ ${#_dirs[@]} -eq 0 ]] && return
    find "${_dirs[@]}" -name "*.md" 2>/dev/null | sort
}

# knowledge/ + memory/ only — used for stale-active and orphan audits
collect_vault_files() {
    local _dirs=()
    [[ -d "$HUB_ROOT/knowledge" ]] && _dirs+=("$HUB_ROOT/knowledge")
    [[ -d "$HUB_ROOT/memory" ]]    && _dirs+=("$HUB_ROOT/memory")
    [[ ${#_dirs[@]} -eq 0 ]] && return
    find "${_dirs[@]}" -name "*.md" 2>/dev/null | sort
}

# ---------------------------------------------------------------------------
# Audit 1 — ADR frontmatter (markdown-style, not YAML)
# Checks: H1 = "# ADR-NNNN: title", **Status:** and **Date:** in first 10 lines
# ---------------------------------------------------------------------------
audit_adr_frontmatter() {
    local _adr_dir="$HUB_ROOT/docs/adr"
    [[ -d "$_adr_dir" ]] || return

    local _f
    while IFS= read -r _f; do
        local _bn
        _bn="$(basename "$_f")"
        [[ "$_bn" == "0000-template.md" ]] && continue

        local _rel="${_f#"$HUB_ROOT/"}"
        local _l1
        _l1="$(sed -n '1p' "$_f" 2>/dev/null)"
        local _top10
        _top10="$(head -10 "$_f" 2>/dev/null)"

        if ! printf '%s' "$_l1" | grep -qE '^# ADR-[0-9]{4}: '; then
            printf 'critical\tmissing-frontmatter-adr\t%s\tMissing `# ADR-NNNN: title` heading on line 1\n' "$_rel"
        fi
        if ! printf '%s\n' "$_top10" | grep -q '\*\*Status:\*\*'; then
            printf 'critical\tmissing-frontmatter-adr\t%s\tMissing `**Status:**` in first 10 lines\n' "$_rel"
        fi
        if ! printf '%s\n' "$_top10" | grep -q '\*\*Date:\*\*'; then
            printf 'critical\tmissing-frontmatter-adr\t%s\tMissing `**Date:**` in first 10 lines\n' "$_rel"
        fi
    done < <(find "$_adr_dir" -maxdepth 1 -name "*.md" 2>/dev/null | sort)
}

# ---------------------------------------------------------------------------
# Audit 2 — agent-learnings YAML frontmatter
# Canonical files: architect.md, developer.md, qa.md, techlead.md
# Log files (timestamp-prefix basename) are intentionally skipped
# Checks: line 1 = "---", frontmatter contains "role:" and "updated:"
# ---------------------------------------------------------------------------
audit_learnings_frontmatter() {
    local _dir="$HUB_ROOT/memory/agent-learnings"
    [[ -d "$_dir" ]] || return

    local _f
    while IFS= read -r _f; do
        local _bn
        _bn="$(basename "$_f")"
        # Skip timestamp-prefix log files (hook-generated, not canonical learnings)
        if [[ "$_bn" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]; then
            continue
        fi

        local _rel="${_f#"$HUB_ROOT/"}"
        local _l1
        _l1="$(sed -n '1p' "$_f" 2>/dev/null)"

        if [[ "$_l1" != "---" ]]; then
            printf 'critical\tmissing-frontmatter-learnings\t%s\tMissing YAML frontmatter (line 1 must be `---`)\n' "$_rel"
            continue
        fi

        # Extract body between first and second ---
        local _fm
        _fm="$(awk 'NR==1{next} /^---$/{exit} {print}' "$_f" 2>/dev/null)"

        if ! printf '%s\n' "$_fm" | grep -qE '^role:'; then
            printf 'critical\tmissing-frontmatter-learnings\t%s\tMissing `role:` in YAML frontmatter\n' "$_rel"
        fi
        if ! printf '%s\n' "$_fm" | grep -qE '^updated:'; then
            printf 'critical\tmissing-frontmatter-learnings\t%s\tMissing `updated:` in YAML frontmatter\n' "$_rel"
        fi
    done < <(find "$_dir" -maxdepth 1 -name "*.md" 2>/dev/null | sort)
}

# ---------------------------------------------------------------------------
# Audit 3 — broken WikiLinks [[target]] / [[target|display]]
# Scans knowledge/, memory/, docs/. Resolves targets against knowledge/ + memory/.
# Skips links containing ":" (URLs) or starting with "/" (absolute paths).
# ---------------------------------------------------------------------------
audit_wikilinks() {
    # Build newline-separated list of known note stems from knowledge/ and memory/
    local _known
    _known="$(collect_vault_files | while IFS= read -r _vf; do
        basename "$_vf" .md
    done | sort)"

    local _f
    while IFS= read -r _f; do
        is_log_file "$_f" && continue
        local _rel="${_f#"$HUB_ROOT/"}"

        local _raw_link
        while IFS= read -r _raw_link; do
            [[ -z "$_raw_link" ]] && continue
            local _target="${_raw_link%%|*}"
            # Skip external/absolute links
            case "$_target" in
                *:*|/*|'') continue ;;
            esac

            local _stem
            _stem="$(basename "$_target")"

            if ! printf '%s\n' "$_known" | grep -qxF "$_stem"; then
                printf 'warning\tbroken-wikilink\t%s\t`[[%s]]` target not found in vault\n' \
                    "$_rel" "$_raw_link"
            fi
        done < <(grep -oE '\[\[[^][]+\]\]' "$_f" 2>/dev/null \
                 | sed 's/^\[\[//; s/\]\]$//')
    done < <(collect_scan_files)
}

# ---------------------------------------------------------------------------
# Audit 4 — stale active notes (status: active, updated > 30 days ago)
# Uses awk JDN formula — no external date utilities required beyond awk.
# ---------------------------------------------------------------------------
_days_diff() {
    # $1 = YYYY-MM-DD (past date), $2 = today YYYY-MM-DD
    # Prints number of days difference (positive = $1 is in the past).
    # Uses Julian Day Number formula — works in awk with integer-only arithmetic.
    awk -v d1="$1" -v d2="$2" '
    function jdn(y, m, d,    a, b) {
        if (m <= 2) { y--; m += 12 }
        a = int(y / 100)
        b = 2 - a + int(a / 4)
        return int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d + b - 1524
    }
    BEGIN {
        n = split(d1, a, "-"); m2 = split(d2, b, "-")
        if (n != 3 || m2 != 3) { print -1; exit }
        diff = jdn(b[1]+0, b[2]+0, b[3]+0) - jdn(a[1]+0, a[2]+0, a[3]+0)
        print (diff < 0 ? -1 : diff)
    }'
}

audit_stale_active() {
    local _f
    while IFS= read -r _f; do
        is_log_file "$_f" && continue

        grep -q '^status: active$' "$_f" 2>/dev/null || continue

        local _rel="${_f#"$HUB_ROOT/"}"

        local _upd_line
        _upd_line="$(grep -m1 '^updated: ' "$_f" 2>/dev/null)" || true
        [[ -z "$_upd_line" ]] && continue

        local _upd="${_upd_line#updated: }"
        # Validate YYYY-MM-DD format
        [[ "$_upd" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue

        local _diff
        _diff="$(_days_diff "$_upd" "$TODAY")"
        [[ "$_diff" -gt 30 ]] || continue

        printf 'warning\tstale-active\t%s\t`status: active` but `updated:` is %sd ago (%s)\n' \
            "$_rel" "$_diff" "$_upd"
    done < <(collect_vault_files)
}

# ---------------------------------------------------------------------------
# Audit 5 — orphan notes (no inbound WikiLinks from anywhere in the repo)
# Entrypoints: README.md, MEMORY.md, activity-log.md, heartbeat-latest.md,
#              current-state.md, *-README.md, or `entrypoint: true` frontmatter.
# ---------------------------------------------------------------------------
_is_entrypoint_name() {
    case "$(basename "$1")" in
        README.md|MEMORY.md|activity-log.md|heartbeat-latest.md|current-state.md)
            return 0 ;;
        *-README.md)
            return 0 ;;
    esac
    return 1
}

audit_orphans() {
    # Collect all wikilink targets referenced anywhere in the repo (basename only)
    local _linked
    _linked="$(find "$HUB_ROOT" -name "*.md" -print0 2>/dev/null | \
        while IFS= read -r -d $'\0' _lf; do
            grep -oE '\[\[[^][]+\]\]' "$_lf" 2>/dev/null \
                | sed 's/^\[\[//; s/\]\]$//'
        done | \
        while IFS= read -r _raw; do
            _tgt="${_raw%%|*}"
            case "$_tgt" in *:*|/*|'') continue ;; esac
            basename "$_tgt"
        done | sort -u)"

    local _f
    while IFS= read -r _f; do
        is_log_file "$_f" && continue
        _is_entrypoint_name "$_f" && continue
        grep -q '^entrypoint: true$' "$_f" 2>/dev/null && continue

        local _rel="${_f#"$HUB_ROOT/"}"
        local _stem
        _stem="$(basename "$_f" .md)"

        if ! printf '%s\n' "$_linked" | grep -qxF "$_stem"; then
            printf 'nit\torphan\t%s\tNo inbound WikiLinks\n' "$_rel"
        fi
    done < <(collect_vault_files)
}

# ---------------------------------------------------------------------------
# Render report — outputs markdown with defects table + prioritized action list
# Input: "$@" = TSV lines "severity\ttype\tfile\tdetail"
# Ordering: critical → warning → nit, stable sort by type then file
# ---------------------------------------------------------------------------
render_report() {
    local -a _defects=("$@")

    printf '# /lint — vault audit report\n\n'
    printf 'Scanned: %s files in knowledge/,memory/,docs/\n' "$_SCANNED_COUNT"
    printf 'Date: %s\n\n' "$TODAY"
    printf '## Defects\n\n'

    if [[ ${#_defects[@]} -eq 0 ]]; then
        printf 'No defects found.\n\n'
        printf '## Prioritized action list\n\n'
        printf '_No actions needed._\n\n'
        printf '_Report end. `/lint` is read-only; no files were modified._\n'
        return
    fi

    printf '| Severity | Type | File | Detail |\n'
    printf '|----------|------|------|--------|\n'

    # Prepend numeric sort key: critical=1, warning=2, nit=3
    local _sorted
    _sorted="$(printf '%s\n' "${_defects[@]}" | awk -F'\t' '
        {
            if ($1 == "critical") o = 1
            else if ($1 == "warning") o = 2
            else o = 3
            printf "%d\t%s\n", o, $0
        }
    ' | sort -t$'\t' -k1,1n -k3,3 -k4,4 | cut -f2-)"

    local _sev _type _file _detail
    while IFS=$'\t' read -r _sev _type _file _detail; do
        [[ -z "$_sev" ]] && continue
        printf '| %s | %s | %s | %s |\n' "$_sev" "$_type" "$_file" "$_detail"
    done <<< "$_sorted"

    printf '\n## Prioritized action list\n\n'

    local _idx=1
    while IFS=$'\t' read -r _sev _type _file _detail; do
        [[ -z "$_sev" ]] && continue
        printf '%d. **%s** — %s in `%s`\n' "$_idx" "$_sev" "$_detail" "$_file"
        _idx=$((_idx + 1))
    done <<< "$_sorted"

    printf '\n_Report end. `/lint` is read-only; no files were modified._\n'
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
main() {
    local _f
    while IFS= read -r _f; do
        _SCANNED_COUNT=$((_SCANNED_COUNT + 1))
    done < <(collect_scan_files)

    local -a _defects=()
    local _line

    while IFS= read -r _line; do
        [[ -n "$_line" ]] && _defects+=("$_line")
    done < <(audit_adr_frontmatter)

    while IFS= read -r _line; do
        [[ -n "$_line" ]] && _defects+=("$_line")
    done < <(audit_learnings_frontmatter)

    while IFS= read -r _line; do
        [[ -n "$_line" ]] && _defects+=("$_line")
    done < <(audit_wikilinks)

    while IFS= read -r _line; do
        [[ -n "$_line" ]] && _defects+=("$_line")
    done < <(audit_stale_active)

    while IFS= read -r _line; do
        [[ -n "$_line" ]] && _defects+=("$_line")
    done < <(audit_orphans)

    render_report "${_defects[@]+"${_defects[@]}"}"
}

main
exit 0
