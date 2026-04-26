#!/usr/bin/env bash
# _bootstrap/scripts/_lib/token-collector.sh
# F15: aggregate Claude Code JSONL transcripts into per-project /
# per-model token totals. Pure bash + jq. Fail-soft: never aborts
# the caller; empty input → empty output, exit 0.
#
# Total billable = input + output + cache_creation.
# cache_read is billed at ~0.3x; stored as a separate column but NOT
# added to "total" here. See ADR-0009 for the token-economy decision.
#
# Sourced (not executed) by orchestrator and tests. No set -e, no set -u.

# collect_usage_files <root> <since_seconds_ago>
# For each .jsonl under <root> whose mtime is within <since_seconds_ago>,
# prints one line: <absolute-path>\t<project-slug>\t<mtime-epoch>
collect_usage_files() {
  local root="${1:-}"
  local since="${2:-86400}"

  [ -n "$root" ] || return 0
  [ -d "$root" ] || return 0

  local now cutoff
  now=$(date +%s 2>/dev/null) || return 0
  cutoff=$(( now - since ))

  local _file mtime slug
  while IFS= read -r _file; do
    # BSD (macOS) stat uses -f %m; GNU/Linux uses -c %Y
    mtime=$(stat -f %m "$_file" 2>/dev/null || stat -c %Y "$_file" 2>/dev/null || echo 0)
    if [ "$(( ${mtime:-0} + 0 ))" -ge "$cutoff" ] 2>/dev/null; then
      slug=$(basename "$(dirname "$_file")")
      printf '%s\t%s\t%s\n' "$_file" "$slug" "$mtime"
    fi
  done < <(find "$root" -type f -name '*.jsonl' 2>/dev/null)
}

# aggregate_by_project
# Reads stdin: lines of shape <path>\t<project-slug>\t<mtime>
# Outputs TSV: <project-slug>\t<sessions>\t<input>\t<output>\t<cache_read>\t<cache_create>\t<total>
aggregate_by_project() {
  local _tmp
  _tmp=$(mktemp) || return 0

  local _path _slug _mtime _line
  while IFS=$'\t' read -r _path _slug _mtime; do
    [ -n "$_path" ] || continue
    [ -f "$_path" ] || continue
    while IFS= read -r _line; do
      printf '%s\n' "$_line" | jq -rc --arg s "$_slug" \
        'select(.message.usage != null) |
         [ $s,
           (.sessionId // ""),
           (.message.usage.input_tokens // 0 | tostring),
           (.message.usage.output_tokens // 0 | tostring),
           (.message.usage.cache_read_input_tokens // 0 | tostring),
           (.message.usage.cache_creation_input_tokens // 0 | tostring)
         ] | join("\t")' 2>/dev/null >> "$_tmp" || true
    done < "$_path"
  done

  awk -F'\t' '
    {
      slug=$1; sid=$2; inp=$3+0; out=$4+0; cr=$5+0; cc=$6+0
      tin[slug]+=inp; tout[slug]+=out; tcr[slug]+=cr; tcc[slug]+=cc
      if (sid != "" && !seen[slug SUBSEP sid]++) scnt[slug]++
    }
    END {
      for (slug in tin) {
        total = tin[slug] + tout[slug] + tcc[slug]
        print slug "\t" (scnt[slug]+0) "\t" tin[slug] "\t" tout[slug] "\t" tcr[slug] "\t" tcc[slug] "\t" total
      }
    }
  ' "$_tmp"

  rm -f "$_tmp"
}

# aggregate_by_model
# Reads stdin: lines of shape <path>\t<project-slug>\t<mtime>
# Outputs TSV: <model>\t<calls>\t<input>\t<output>\t<cache_read>\t<cache_create>\t<total>
aggregate_by_model() {
  local _tmp
  _tmp=$(mktemp) || return 0

  local _path _slug _mtime _line
  while IFS=$'\t' read -r _path _slug _mtime; do
    [ -n "$_path" ] || continue
    [ -f "$_path" ] || continue
    while IFS= read -r _line; do
      printf '%s\n' "$_line" | jq -rc \
        'select(.message.model != null) |
         [ (.message.model),
           ((.message.usage // {}).input_tokens // 0 | tostring),
           ((.message.usage // {}).output_tokens // 0 | tostring),
           ((.message.usage // {}).cache_read_input_tokens // 0 | tostring),
           ((.message.usage // {}).cache_creation_input_tokens // 0 | tostring)
         ] | join("\t")' 2>/dev/null >> "$_tmp" || true
    done < "$_path"
  done

  awk -F'\t' '
    {
      model=$1; inp=$2+0; out=$3+0; cr=$4+0; cc=$5+0
      calls[model]++; tin[model]+=inp; tout[model]+=out; tcr[model]+=cr; tcc[model]+=cc
    }
    END {
      for (model in tin) {
        total = tin[model] + tout[model] + tcc[model]
        print model "\t" calls[model] "\t" tin[model] "\t" tout[model] "\t" tcr[model] "\t" tcc[model] "\t" total
      }
    }
  ' "$_tmp"

  rm -f "$_tmp"
}
