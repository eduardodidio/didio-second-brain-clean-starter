---
feature: F90
project: blind-warrior
created: 2026-04-25T18:30:00Z
source_commits:
  - abc1234
qa_report: tasks/features/F90-foo/qa-report-20260425T1830.md
---
## Learnings
- Bash hooks that source `_lib/load-env.sh` before any `curl` call are portable across all didio projects.

## Skills
- Using `claude` CLI with `--print` flag for non-interactive evaluation in CI pipelines.

## Patterns
- `hook.json` pattern: `{ "event": "SubagentStop", "match": "qa", "script": "./hook.sh" }` is the canonical shape for feature-end hooks.

## Anomalies
- None observed in this cycle.
