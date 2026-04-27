## F09 — 2026-04-26

(digested from projeto-a:F09 at 2026-04-26T08:20:54.259Z)

- Learned that macOS and GNU date diverge on the `-v` / `-d` flags for relative date arithmetic — always test both branches in bash scripts. The `stat -f %m` (macOS) vs `stat -c %Y` (Linux/GNU) divergence follows the same pattern. Scripts destined for cross-platform claude projects must cover both branches or fail silently in CI.

