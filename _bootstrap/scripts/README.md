# _bootstrap/scripts

Utility scripts for the didio-second-brain-claude hub.

| Script | Purpose |
|--------|---------|
| `daily-heartbeat.sh` | Vault health check + Discord ping (F09) |
| `lint-vault.sh` | Structural audit of the vault (F09) |
| `token-report.sh` | Daily token usage report across all projects (F15) |
| `digest-pending.sh` | Learning-loop digest from pending notes (F16) |

## Token usage report (F15)

Daily aggregator that reads `~/.claude/projects/*/*.jsonl`
transcripts from the last 24h and writes
`memory/token-reports/$(date +%F).md` with token totals per project,
per model, and an estimated savings figure attributable to the
second-brain hub. See [`docs/adr/0009-token-economy-estimation.md`](../../docs/adr/0009-token-economy-estimation.md)
for the heuristic.

### Run manually

```bash
bash _bootstrap/scripts/token-report.sh           # writes report + Discord ping
bash _bootstrap/scripts/token-report.sh --dry-run # prints to stderr, no file, no curl
```

### Schedule on macOS (launchd)

```bash
TARGET="$HOME/Library/LaunchAgents/com.didio.token-report.plist"
sed "s|__HUB_ROOT__|$(pwd)|g" \
  _bootstrap/scripts/launchd/com.didio.token-report.plist > "$TARGET"
launchctl bootstrap "gui/$(id -u)" "$TARGET"
launchctl print "gui/$(id -u)/com.didio.token-report" | grep -i state
```

Uninstall:

```bash
launchctl bootout "gui/$(id -u)/com.didio.token-report"
rm "$HOME/Library/LaunchAgents/com.didio.token-report.plist"
```

### Schedule on Linux (cron, alternative)

```cron
30 2 * * * cd /absolute/path/to/didio-second-brain-claude && /bin/bash _bootstrap/scripts/token-report.sh
```

Notes:

- The plist runs in your user-scope `gui/` domain. Output and errors
  are appended to `logs/token-report.{out,err}.log` (gitignored).
- `StartCalendarInterval` uses the system timezone. If your machine is
  set to `America/Sao_Paulo`, `Hour=2 Minute=30` means 02:30 BRT.
- The script is fire-and-forget: any failure (no webhook, no
  transcripts, jq glitch) results in a degraded report or no
  notification, never an aborted execution.
- `RunAtLoad=false` — the plist does not run immediately on install.
  To test manually, call the script directly instead of relying on
  launchd.
- Privacy: only `usage.*`, `model`, `cwd`, `sessionId`, and
  `tool_use.name` are read. No prompt or message content is
  accessed (verifiable: `grep -E '"content"' _bootstrap/scripts/token-*`).
