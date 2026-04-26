# Developer Learnings

## F88

**What worked:** Hermetic sandbox tests via `mktemp -d` + HOME override kept all
tests isolated from real project files.

**What to avoid:** Hardcoded paths in test fixtures — use relative paths from
SCRIPT_DIR so tests pass regardless of where the repo is checked out.
