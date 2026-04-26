#!/usr/bin/env bash
# patterns/hooks/_lib/feature-context.sh
# Sourced by patterns/hooks/*/hook.sh. Provides feature/task/phase
# detection helpers. Zero-dependency, fail-soft. Every function
# returns 0 and echoes empty string on any error.

_fc_hub_root() {
  echo "${SECOND_BRAIN_HUB:-$HOME/second-brain}"
  return 0
}

detect_active_feature() {
  # Env var takes priority (set by orchestrator)
  if [ -n "${DIDIO_FEATURE:-}" ]; then
    echo "$DIDIO_FEATURE"
    return 0
  fi

  local hub
  hub="$(_fc_hub_root)"
  local features_dir="$hub/tasks/features"
  [ -d "$features_dir" ] || { echo ""; return 0; }

  # Pick the most recently modified FXX-* directory
  local dir
  dir="$(ls -dt "$features_dir"/F[0-9]*-*/ 2>/dev/null | head -n1)"
  [ -n "$dir" ] || { echo ""; return 0; }

  local basename out
  basename="$(basename "$dir")"
  out="$(echo "$basename" | sed -E 's/^(F[0-9]+)-.*/\1/')"

  # Validate it looks like FXX
  [[ "$out" =~ ^F[0-9]+$ ]] || { echo ""; return 0; }
  echo "$out"
  return 0
}

detect_active_task() {
  local feature="${1:-}"
  if [ -z "$feature" ]; then
    feature="$(detect_active_feature)"
  fi
  [ -n "$feature" ] || { echo ""; return 0; }

  local hub
  hub="$(_fc_hub_root)"
  local features_dir="$hub/tasks/features"
  [ -d "$features_dir" ] || { echo ""; return 0; }

  # Find the feature directory
  local feature_dir
  feature_dir="$(ls -dt "$features_dir"/"$feature"-*/ 2>/dev/null | head -n1)"
  [ -d "${feature_dir:-}" ] || { echo ""; return 0; }

  # Pick the most recently modified task file matching *-T*.md
  local task_file
  task_file="$(ls -t "$feature_dir"*-T*.md 2>/dev/null | head -n1)"
  [ -n "$task_file" ] || { echo ""; return 0; }

  local task_id
  task_id="$(basename "$task_file" .md)"
  echo "$task_id"
  return 0
}

detect_task_wave() {
  local task_file="${1:-}"
  [ -r "$task_file" ] || { echo ""; return 0; }

  local val
  val="$(grep -m1 -E '^\*\*Wave:\*\*' "$task_file" 2>/dev/null \
    | sed -E 's/^\*\*Wave:\*\*[[:space:]]*//;s/[[:space:]].*$//')"
  [[ "$val" =~ ^[0-9]+$ ]] || { echo ""; return 0; }
  echo "$val"
  return 0
}

detect_task_status() {
  local task_file="${1:-}"
  [ -r "$task_file" ] || { echo ""; return 0; }

  local val
  val="$(grep -m1 -E '^\*\*Status:\*\*' "$task_file" 2>/dev/null \
    | sed -E 's/^\*\*Status:\*\*[[:space:]]*//;s/[[:space:]].*$//')"
  [ -n "$val" ] || { echo ""; return 0; }
  echo "$val"
  return 0
}

phase_for_role() {
  local role="${1:-}"
  case "$role" in
    "")               echo "" ;;
    architect)        echo "🧭 Planning" ;;
    developer)        echo "🔨 Building" ;;
    techlead)         echo "🔍 Review" ;;
    qa)               echo "✅ Validation" ;;
    Explore)          echo "🔎 Research" ;;
    general-purpose)  echo "🔎 Research" ;;
    unknown)          echo "" ;;
    *)                echo "🔎 Research" ;;
  esac
  return 0
}

# F17: privacy-safe summary of last wave activity for Discord embed.
# Echoes ≤200-char string or empty on any error/missing data.
summarize_last_wave_activity() {
  local feature="${1:-}"
  [ -n "$feature" ] || { echo ""; return 0; }

  local hub
  hub="$(_fc_hub_root)"
  [ -d "$hub" ] || { echo ""; return 0; }

  # 1. Completed tasks: last 3 [x] in <FXX>-README.md (unique).
  local feature_dir readme tasks_done=""
  feature_dir="$(ls -dt "$hub/tasks/features/$feature"-*/ 2>/dev/null | head -n1)"
  [ -d "${feature_dir:-}" ] || { echo ""; return 0; }
  readme="${feature_dir}${feature}-README.md"
  if [ -r "$readme" ]; then
    tasks_done="$(grep -oE '\[x\][[:space:]]*'"$feature"'-T[0-9]+' "$readme" 2>/dev/null \
      | grep -oE 'T[0-9]+' \
      | awk '!seen[$0]++' \
      | tail -n3 \
      | paste -sd, -)"
  fi

  # 2. Files touched: scan latest 3 *.jsonl agent logs for this feature.
  # Privacy: only file_path keys from tool_use blocks. No content fields.
  local files=""
  local logs_dir="$hub/logs/agents"
  if [ -d "$logs_dir" ]; then
    files="$(ls -t "$logs_dir/$feature"-*.jsonl 2>/dev/null \
      | head -n3 \
      | xargs -I{} grep -hoE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' {} 2>/dev/null \
      | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' \
      | awk -F/ '{print $NF}' \
      | awk '!seen[$0]++' \
      | head -n5 \
      | paste -sd, -)"
  fi

  # 3. Compose, fail-soft if both empty.
  local out=""
  if [ -n "$tasks_done" ]; then
    out="${tasks_done} done"
  fi
  if [ -n "$files" ]; then
    if [ -n "$out" ]; then
      out="${out} · edited (${files})"
    else
      out="edited (${files})"
    fi
  fi

  # 4. Truncate to 200 chars at last comma, append …
  if [ "${#out}" -gt 200 ]; then
    out="${out:0:200}"
    out="${out%,*}…"
  fi

  echo "$out"
  return 0
}
