## F09 — 2026-04-26

(digested from blind-warrior:F09 at 2026-04-26T08:18:38.821Z)

- Pure-bash cron scripts with `set -u` (not `set -e`) are the right pattern for fire-and-forget hooks: each subcommand failure is local and never silences subsequent steps. This applies universally to any bash hook or cron wrapper in the claude framework.

