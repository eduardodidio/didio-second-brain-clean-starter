---
name: lint
description: Audit the second-brain vault for structural defects (missing frontmatter, broken WikiLinks, stale active notes, orphans). Read-only — never auto-fixes.
---

# /lint — vault audit

Run the deterministic auditor and surface defects to the user. This skill
is read-only and never modifies files.

## How to run

Execute the audit script from the hub root:

```bash
bash _bootstrap/scripts/lint-vault.sh
```

The script prints a Markdown report with a defects table and a
prioritized action list (critical → warning → nit).

## What to do with the output

Forward the script's stdout verbatim to the user. Do **not** reformat,
summarize, or invent defects not listed by the script. If the script
exits non-zero or produces no output, tell the user the audit failed and
show the exit code — do not guess at what defects might exist.

## Out of scope

- Auto-fix: this skill only reports. If the user asks to fix, open the
  file(s) named in the report and edit with explicit user approval.
- Performance tuning: the auditor is bash and linear; acceptable for
  a vault with hundreds of files.

## Reference

- Script: `_bootstrap/scripts/lint-vault.sh`
- ADR: `docs/adr/0008-vault-health-heartbeat.md`
- Feature: F09.
