#!/usr/bin/env bash
# _bootstrap/scripts/_lib/token-economy.sh
# F15: estimate tokens saved by second-brain MCP calls and skill
# loads, per the heuristic in docs/adr/0009-token-economy-estimation.md.
# Pure bash + jq. Fail-soft: never aborts the caller.
#
# Functions exposed:
#   count_secondbrain_calls <file|-> → TSV: tool_name, calls, returned_bytes, billed_tokens
#   estimate_savings         <file|-> → TSV: source, calls, saved_tokens

count_secondbrain_calls() {
    local file="$1"
    local stdin_tmp=""

    if [ -z "$file" ]; then
        return 0
    fi

    if [ "$file" = "-" ]; then
        stdin_tmp=$(mktemp 2>/dev/null) || return 0
        cat > "$stdin_tmp"
        file="$stdin_tmp"
    elif [ ! -f "$file" ]; then
        return 0
    fi

    local tu_tmp tr_tmp
    tu_tmp=$(mktemp 2>/dev/null) || { [ -n "$stdin_tmp" ] && rm -f "$stdin_tmp"; return 0; }
    tr_tmp=$(mktemp 2>/dev/null) || { rm -f "$tu_tmp"; [ -n "$stdin_tmp" ] && rm -f "$stdin_tmp"; return 0; }

    # Extract tool_use entries from assistant messages.
    # For each mcp__second-brain__* tool_use: id, name, billed_tokens.
    # billed = input + output + cache_creation (NOT cache_read — it is a discount per ADR-0009).
    jq -r 'select(.type == "assistant") |
        (.message.usage.input_tokens // 0) as $in |
        (.message.usage.output_tokens // 0) as $out |
        (.message.usage.cache_creation_input_tokens // 0) as $cache |
        ($in + $out + $cache) as $billed |
        .message.content[]? |
        select(.type == "tool_use") |
        select(.name | startswith("mcp__second-brain__")) |
        [.id, .name, ($billed | tostring)] | @tsv' "$file" 2>/dev/null > "$tu_tmp"

    # Extract tool_result entries from user messages.
    # Privacy guard: only read the byte-length of the content, never its text.
    # (.content // "" | tostring | length) gives bytes(returned_content) per ADR-0009.
    jq -r 'select(.type == "user") |
        .message.content[]? |
        select(.type == "tool_result") |
        [.tool_use_id, (.content // "" | tostring | length | tostring)] | @tsv' \
        "$file" 2>/dev/null > "$tr_tmp"

    # Join on tool_use_id and aggregate by tool_name.
    # First file = tool_uses (id → name, billed); second = tool_results (id → bytes).
    awk -F'\t' '
        NR == FNR {
            billed[$1] = $3
            tname[$1]  = $2
            next
        }
        {
            id = $1; bytes = $2 + 0
            if (id in tname) {
                n = tname[id]
                cnt[n]++
                tot_bytes[n]  += bytes
                tot_billed[n] += billed[id] + 0
            }
        }
        END {
            for (n in cnt) {
                print n "\t" cnt[n] "\t" tot_bytes[n] "\t" tot_billed[n]
            }
        }
    ' "$tu_tmp" "$tr_tmp"

    rm -f "$tu_tmp" "$tr_tmp"
    [ -n "$stdin_tmp" ] && rm -f "$stdin_tmp"
    return 0
}

estimate_savings() {
    # Args:
    #   $1 = path to TSV produced by count_secondbrain_calls, or "-" for stdin.
    #   $2 = (optional) path to _bootstrap/skills/ — skills estimate v1: not
    #        implemented; see ADR-0009 §Limitations.
    # Output: TSV  source \t calls \t saved_tokens
    local input="$1"
    local data

    if [ "$input" = "-" ]; then
        data=$(cat)
    elif [ -n "$input" ] && [ -f "$input" ]; then
        data=$(cat "$input")
    else
        return 0
    fi

    [ -z "$data" ] && return 0

    echo "$data" | awk -F'\t' '
        NF >= 4 {
            tool   = $1
            calls  = $2
            bytes  = $3 + 0
            billed = $4 + 0
            # ceil(bytes / 4): integer ceiling division (1 token ≈ 4 UTF-8 bytes)
            avoided = int((bytes + 3) / 4)
            saved   = avoided - billed
            if (saved < 0) saved = 0
            print tool "\t" calls "\t" saved
        }
    '
    # Skills estimate v1: not implemented — see ADR-0009 §Limitations.
    return 0
}
