---
feature: F91
project: blind-warrior
created: 2026-04-25T19:00:00Z
source_commits:
  - def5678
qa_report: tasks/features/F91-bar/qa-report-20260425T1900.md
---
## Learnings
- The `blind-warrior` enemy AI state machine resets correctly on scene reload when `EnemyController.OnSceneLoad()` is called explicitly.

## Skills
- None applicable outside blind-warrior.

## Patterns
- None applicable outside blind-warrior.

## Anomalies
- `blind-warrior` physics layer collision matrix was misconfigured — enemy triggers were colliding with themselves on layer 8.
