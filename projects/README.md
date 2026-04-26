# Projects Registry

`registry.yaml` is the single source of truth for all Claude projects in the
didio ecosystem. It is consumed by:

- **MCP server** (F02) — resolves cross-project references (`projects.*` tools)
- **Rollout scripts** (F05) — iterates over entries to install MCP in each project

## Schema

```yaml
version: 1          # Schema version — increment on breaking changes (add ADR)
projects:
  - name: <slug>                    # Repo/directory name (no spaces)
    path: <absolute-path>           # Absolute path on the developer's machine
    tech_stack: [<tech>, ...]       # Array, ≥1 item
    purpose: <one-line description> # What the project does
    claude_framework: <bool>        # true when project has CLAUDE.md + .claude/
    mcp_integrated: <bool>          # true after F05 rollout installs the MCP
```

### Example entry

```yaml
- name: my-new-project
  path: /Users/eduardodidio/my-new-project
  tech_stack:
    - TypeScript
    - Bun
  purpose: Does something useful
  claude_framework: false
  mcp_integrated: false
```

## Update rules

1. **New project** — add entry with `mcp_integrated: false` and
   `claude_framework: false`. Flip `claude_framework` to `true` once the
   project has both `CLAUDE.md` and `.claude/`.
2. **MCP rollout** — flip `mcp_integrated: true` per project after F05
   confirms the MCP server is wired and responding.
3. **Breaking schema change** — bump `version`, open an ADR under
   `docs/adr/`, update this README.
4. **Removed project** — delete the entry; do not leave stubs.
