# Developer Agent Learnings

## F02 — 2026-04-15

**What worked:** Wave dependency order (Wave 0 deps → Wave 1 parallel modules → Wave 2 integration) prevented file conflicts. `featureMap` (Map pre-computed in `useMemo`) is better than inline `features.find()` inside render loops.

**What to avoid:** When a module is introduced as a canonical style registry (e.g., `STATUS_STYLE`), all functions in that module must read from it — not re-declare the same literal strings. Grep for hardcoded Tailwind color strings in new registry modules before submitting. Also: task files list test scenarios as a checklist, not as illustrative examples — implement every scenario.

**Pattern to repeat:** Pre-compute a `Map<key, value>` in `useMemo` to replace O(n) `array.find()` calls inside JSX maps. When using `asChild` with Framer Motion inside a Radix primitive, animate `width` instead of `transform` to avoid conflicts with Radix's internal transform injection — add a brief comment explaining why.

## F03 — 2026-04-14

**What worked:** Choosing Option A (persistent Python process) for the no-op guard compounds with the README cache — both optimisations survive across ticks in the same process. Module-level cache dict + `_clear_cache()` helper is the right Python pattern for process-lifetime caching that is also test-friendly.

**What to avoid:** Bare `except Exception: pass` in any persistent/daemon-style loop — a watcher that silently fails is indistinguishable from a healthy idle watcher; always log to stderr. Leaving `[ ]` checkboxes unchecked in task files (recurred from F02). Diagram labels that describe the spec design rather than the actual implementation — when you choose a simpler approach (string compare instead of MD5 hash), update the diagrams.

**Pattern to repeat:** Persistent-process refactor (bash thin-launcher `exec python3 …`): separates stateless bash setup from stateful Python loop cleanly, and eliminates the need for external `.prev_hash` temp files. ADR "reject" documents with explicit, enumerated reasoning are as valuable as "accept" ADRs. Always include cross-stack acceptance criteria (`npm run test`) explicitly in the integration test script or benchmark results — do not assume they pass by inference.

## F01 — 2026-04-17

**What worked:** Placeholder READMEs that explicitly state `**Status:** placeholder — conteúdo entra em FXX` and reference the responsible future feature ID make scope boundaries unambiguous and prevent premature content from accumulating in skeleton directories.

**What to avoid:** Do not leave frontmatter schemas open-ended in READMEs. When introducing a field with a bounded set of valid values, enumerate it as a closed enum immediately. Anchoring project-name enums to `projects/registry.yaml` as the single source of truth is the right pattern — do not duplicate the list inline.

**Pattern to repeat:** When delivering a scaffold/structural feature, write every new directory's README with: (1) one-line purpose, (2) explicit list of planned content, (3) the feature ID that will fill it. This is cheap now and saves F02+ developers from having to guess what belongs where.

## F02 MCP server MVP — 2026-04-17

**What worked:** Hermetic test isolation via `SECOND_BRAIN_ROOT` env var + `tmpdir` in `beforeEach/afterEach` — each tool test suite owned a clean temp directory, so tests never interfere with production memory files. Parallel waves for tools (Wave 2) were conflict-free because each task owned exactly one hermetic source file.

**What to avoid:** Importing a direct dependency (`zod`) without declaring it explicitly in `package.json`. Even if it resolves transitively today, the SDK can change its own deps and silently break your code. Always check: for every `import` in `src/`, there must be an explicit entry in `dependencies`. Fix is one line; miss costs a prod incident.

**Pattern to repeat:** When interactive smoke steps (MCP invocation via Claude Code client) cannot be automated, mark the smoke file clearly as PARTIAL, list the manual steps with owner (user), and verify static data readiness (does the search target string exist in the files?). Never leave ambiguity between "not yet run" and "passed" in a smoke report.

## F03 Discord Notifications — 2026-04-18

**What worked:** Static security test pattern — reading the tool's own source file via `node:fs/promises` and asserting that `console.error` never references the URL variable. This test cannot be bypassed by mocks and survives refactors that would silently re-introduce the leak. Apply to every future tool that handles credentials, tokens, or webhook URLs.

**What to avoid:** Listing only a subset of valid enum values in a README. `mcp-server/README.md` listed `"alert"` (wrong name) and omitted `"error"` — two of four valid levels were wrong. When documenting enum fields in README, copy the values verbatim from the types file. QA caught this; it should be caught at authoring time.

**Pattern to repeat:** For fire-and-forget tools with timeout: (1) wrap the call in `AbortController` with `clearTimeout` in `finally` to avoid handle leaks, (2) catch `AbortError` by name (`e.name === "AbortError"`) not by message, (3) always resolve — never propagate exceptions to the caller. Test with a `makeSlowFetch(delayMs)` helper that respects `signal.addEventListener("abort")` for accurate timeout simulation.

## F05 — 2026-04-18

**What worked:** Hermetic bash tests via `mktemp -d` + `export HOME=` override are the right pattern for scripts that write to `~/.claude/settings.json`. 41 tests ran isolated with no real system mutation.

**What to avoid:** (1) Writing file paths in documentation before running `ls` to verify them — `server.ts` vs `index.ts` caused a Round 1 REJECTED verdict. (2) Leaving global acceptance criteria `[ ]` unchecked after all tasks complete — this is now 4 consecutive features (F02, F03, F02-r2, F05). Fix: as the final step of the last Wave, update every `[ ]` in the feature README to `[x]`, then set `Status: done` on the feature README itself.

**Pattern to repeat:** Final-wave checklist: (1) check all global acceptance criteria boxes to `[x]`, (2) set feature README `Status: planned` → `done`, (3) verify referenced file paths with `ls`. This is a 3-step closing ritual that prevents every REJECTED round in this project's history.

## F05b — 2026-04-19

**What worked:** Escape hatch (`DIDIO_HOOKS_DISABLE_FILTER=1`) checked as the very first statement inside the filter function — no file I/O before override. Clean, robust pattern. Path resolution via `$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)` in hook files is portable and correct for sourcing sibling directories.

**What to avoid:** Drawing Wave 0 diagrams before implementation and not revisiting them after code is written. F05b-T07 diagrams showed the escape hatch as reachable only on the no-match branch; actual `registry_match()` checks `DIDIO_HOOKS_DISABLE_FILTER` on line 10, before any registry read. The behavior is equivalent, but the flow order is wrong in the diagram. Pattern: after implementing, diff the Wave 0 diagrams against the actual code's decision-node order and update if they diverged.

**Pattern to repeat:** Final-wave closing ritual: (1) `grep -r "path/named/in/docs" <dir>` to confirm all doc-referenced paths exist, (2) update feature README `Status: planned → done`, (3) mark all `[ ]` → `[x]` in global acceptance criteria. Three steps, one pass, prevents every REJECTED/IMPORTANT flag in this project's history.

## F04 — 2026-04-19

**What worked:** `status: stub` + `updated: YYYY-MM-DD` as the frontmatter pattern for initial content waves is clean and MCP-transparent — no special-casing needed in tools. Hook directory layout (README.md for frontmatter, hook.json for config) was consistent across all 3 hooks.

**What to avoid:** None specific — F02/F03 learnings (no new deps without confirmation, hermetic tool modules) applied correctly.

**Pattern to repeat:** For first-pass content population waves, use `status: stub` with `updated:` field explicitly set. Downstream consumers detect stub status via frontmatter; tools return stubs transparently. This is preferable to omitting files or writing placeholder text that appears authoritative.

## F06 — 2026-04-20

**What worked:** Non-destructive propagation pattern (backup + `jq del(.hooks)` diff check before and after) is clean and auditable. Python heredoc inside the sync script for `merge_hooks` — same pattern as the existing `permissions.allow` merge — produced idempotent, non-destructive merge with minimal blast radius.

**What to avoid:** (1) Not documenting spec deviations in task notes — T02 used `/**` wildcards instead of the spec's specific file paths without a note. Even benign deviations should be logged: "Used X instead of spec's Y — rationale: Z" (T13-note pattern from F02-r2 retro, still not consistently applied). (2) `Status: planned` not updated on task completion — **6th consecutive feature**. Hardcode the closing ritual in every final-wave task: before DIDIO_DONE, (1) Status → `done`, (2) check all AC boxes, (3) document deviations.

**Pattern to repeat:** Final-wave closing ritual (non-negotiable): (1) set task `Status: planned` → `done`, (2) mark all `[ ]` → `[x]` in the feature README global acceptance criteria, (3) add a one-line deviation note for any spec deviation made during implementation. Three steps, zero exceptions — catches every IMPORTANT item found in reviews across 6 features.

## F08 Subagent Stop Role Extraction — 2026-04-21

**What worked:** Consultar primeiro o payload real do evento
`SubagentStop` (`session_id`, `transcript_path`, `cwd`,
`hook_event_name`, `stop_hook_active`) antes de escrever parsing —
evitou um segundo round de "por que o grep não casa". O
`transcript_path` entregue é a fonte canônica; o último
`"subagent_type":"…"` no `.jsonl` identifica o subagent que acabou
de parar.

**What to avoid:** Assumir que env vars "óbvias" existem sem
confirmar. `CLAUDE_SUBAGENT_ROLE` parece natural, mas o Claude Code
não seta essa var em nenhum momento — o hook original ficou ano
pendurado em fallback `unknown` por causa dessa suposição. Regra:
antes de ler uma env var em código crítico, rodar
`env | grep CLAUDE_` numa sessão real do Claude Code para confirmar
que existe. O payload do `SubagentStop` **não** tem `role`; a única
fonte confiável é `transcript_path`.

**Pattern to repeat:** Hooks `Stop`/`SubagentStop` permanecem
fire-and-forget (`set -u` sim, `set -e` não, `exit 0` sempre,
`curl ... || true`). Parsing zero-dep com
`grep -oE '"subagent_type":"[^"]+"' | tail -n1 | sed -E '…'` é
suficiente e evita adicionar `jq` como dependência do hub. Teste
end-to-end de hook com `mktemp -d` + fake `curl` no PATH dá
cobertura hermética sem tocar Discord real.

## F09 — Vault heartbeat + lint (2026-04-24)

**What worked:** Cron-grade pure-bash + webhook reuse pattern: `set -u` (não `-e`), `exit 0` incondicional, `curl … || true`, sem MCP, sem LLM. `--hub <path>` flag para testar em sandbox hermético (análogo ao `SECOND_BRAIN_ROOT` de T02). macOS/GNU portability em `stat -f %m` vs `stat -c %Y` e `date -j -f` vs `date -d` — cobrir ambos os ramos evita flakiness em CI Linux. JDN awk date-diff para cálculo de dias sem dependência externa.

**What to avoid:** Nomear T07 como "dono" de diagramas no README sem criar o arquivo de tarefa — os diagramas ficaram como stub atravessando toda a Wave 1 e Wave 2 até o TechLead preencher no review. Regra: todo item em `## Diagrams` deve apontar para uma task que existe no manifesto de Waves.

**Pattern to repeat:** Fake curl via `PATH="$SANDBOX/bin:$PATH"` + script que faz `echo "$@" >> "$SANDBOX_CURL_LOG"` é o padrão hermético para testar fire-and-forget webhooks sem tocar rede. `SANDBOX_CURL_LOG` passado como env var (não hardcoded) permite múltiplos sandboxes em paralelo sem colisão.

## F14 — 2026-04-25

**What worked:** Encapsular detecção de contexto (feature/task/phase) em helper `_lib/feature-context.sh` separado dos hooks manteve cada hook curto (apenas 30–50 linhas adicionais). Reuso cross-hook sem duplicação real de lógica de detecção.

**What to avoid:** Construir JSON com fields condicionais via `printf` direto leva a vírgulas trailing quando algum field é omitido. A solução é juntar fields em um array bash e `IFS=','; "${arr[*]}"; unset IFS` — zero-dep e correto.

**Pattern to repeat:** Para qualquer helper sourceado por hook fire-and-forget, TODA função retorna 0 explícito + ecoa string vazia em erro. Hooks chamam com `|| true` extra como belt-and-suspenders. Essa dupla-defesa é o que mantém o invariante "helper bug nunca derruba notificação".

**Pattern to repeat:** Detecção de feature ativa via env var `$DIDIO_FEATURE` com fallback para mtime de `tasks/features/` é robusto — env vence quando o orchestrator setou explicitamente, mtime cobre o caso ad-hoc/manual. `ls -dt | head -n1` é portable e suficiente; `find -mtime -7` traz portabilidade problemática (BSD vs GNU) sem ganho real.

## F15 — 2026-04-26

**What worked:** Parse seguro de JSONL com `jq -c` linha-a-linha sob `set -u` (não `set -e`) é a combinação certa para pipelines fire-and-forget: cada linha é processada independentemente, linhas malformadas produzem erro local capturado por `|| true`, e o pipeline não derruba. Padrão base: `while IFS= read -r line; do echo "$line" | jq -c '...' || true; done`.

**Why:** `set -e` em scripts fire-and-forget causa saídas silenciosas quando qualquer subcomando falha. Com `jq -c` por linha, uma entrada malformada em transcript não cancela o processamento dos demais arquivos.

**How to apply:** Em scripts que iteram transcripts JSONL: (a) `set -u` sem `set -e`, (b) filtre linha-a-linha com `jq -c ... || true`, (c) acumule resultados com `+=`. Nunca use `cat *.jsonl | jq -c '...'` direto — um arquivo corrompido derruba tudo.

---

**What to avoid:** Hardcodear `~/.claude/projects/` sem expor override. Sem flag `--transcripts-root`, testes herméticos são impossíveis — testes acabam lendo dados reais ou falhando em CI.

**Why:** O caminho padrão é específico da máquina e contém dados reais. Testes precisam de fixtures sintéticas em `mktemp -d`. Sem override, o script é não-hermético por design.

**How to apply:** Todo script que lê de `~/.claude/` deve expor flag de override (padrão neste hub: `--hub <path>` e `--transcripts-root <path>`). O override deve ser verificado antes do `$HOME` expansion.

---

**What to avoid:** Documentar heurísticas (fórmulas de economia, thresholds) sem ADR correspondente. Heurísticas em código evoluem sem que a expectativa documentada acompanhe, criando drift.

**Why:** A heurística de economia do F15 ficou em draft no ADR-0009 e no código simultaneamente. Quando ajustada, o ADR precisou de revisão manual.

**How to apply:** Toda heurística nova ganha ADR antes da implementação com fórmula, premissas e limitações documentadas. O código ou output do relatório referencia o ADR. TechLead verifica alinhamento ADR↔código no review.

## F17 — 2026-04-26

**What worked:** Privacy-safe extraction from JSONL transcripts via
allowlist of safe keys (`file_path`, `notebook_path`) instead of
trying to redact prompt content. The pattern `grep -hoE
'"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' file | sed -E 's/…/\1/'`
is regex-only, zero-dependency, and immune to false-positives from
user message content because it never touches `text` / `content` /
`message` keys.

**What to avoid:** Heuristic ETAs that depend solely on `now + 5h`
without trying the upstream header first. The header
`anthropic-ratelimit-reset` is the source of truth when present; the
heuristic is a fallback for the rare case the transcript was rotated
before the header line was written. Always parse-then-fallback,
never fallback-only.

**Pattern to repeat:** Lockfile-based daily idempotência for
fire-and-forget hooks: a single-line `YYYY-MM-DD` file at a
predictable per-project path. Read with
`head -n1 | tr -d '[:space:]'` (whitespace-tolerant), compare against
`TZ='America/Sao_Paulo' date '+%Y-%m-%d'`, write only after the side
effect (curl) was attempted. Fail-safe direction: when in doubt
(unreadable lockfile, missing arg), default to "don't alert" — better
to miss an alert than to spam.

**What to avoid (privacy fixture):** Writing a privacy test case where the fixture is missing a pre-condition (e.g., no `tasks/features/<FXX>/` dir). The function exits early at the FS guard and the test passes trivially on empty output — no sensitive data leaks, but the log-reading code path is never exercised. Always ensure the test fixture satisfies ALL guards the function checks before reaching the privacy-critical code.

**`build_field` centralisation:** When the same helper function will be added to multiple parallel-wave tasks, define it once in `_lib/` and source it. If tasks must each embed it, copy the exact implementation verbatim (not "implement similarly") so TechLead can grep-diff. Parallel-wave divergence is predictable — design it away at spec time.

## F16 — 2026-04-26

**(a) Drop frontmatter shape:** Drop files use snake_case YAML keys (`feature`, `project`, `created`, `source_commits`, `qa_report`, `digested`). The TypeScript tool converts them to camelCase via the `yaml` library's parse — `source_commits` arrives as `sourceCommits`, `qa_report` as `qaReport`. When writing test fixtures or creating demo drops, use the snake_case YAML form on disk.

**(b) Heurística determinística (regex + Jaccard 0.7) é suficiente em v1:** The classification pipeline (keyword regex per category → section heading fallback → "learning" default) plus Jaccard shingle dedupe at 0.7 handles the real drop corpus well. LLM classification is deferred to v2. The threshold of 0.7 prevents near-duplicate entries while allowing genuinely distinct learnings about the same topic to both be absorbed.

**(c) Idempotência via `fs.rename` para `_processed/` é mais barata que lock:** After absorption, the drop is renamed into `_processed/` — a single atomic FS operation that acts as the commit marker. A 2nd run finds the file gone from `_pending-digest/` and skips it cleanly. Dry-run mode writes the `digested:` timestamp to frontmatter but does NOT rename, so the drop remains available for a real run. This is cheaper and more correct than any lock-file approach.
## F09 — 2026-04-26

(digested from blind-warrior:F09 at 2026-04-26T08:20:54.260Z)

- Retrospective insight: deterministic vault scoring (0–10 integer) with a fixed Discord threshold (`score < 7 → alert`) is more reliable than qualitative judgement in automated cron jobs. The integer is directly comparable, log-friendly, and requires no LLM. Applied to any agent project that runs daily vault/health checks via bash cron.


## F16 — 2026-04-26

**What worked:** Pure-function `digest.ts` (no I/O, accepts strings, returns results) made the classification/filter/dedupe logic independently testable with 10 describe blocks and zero filesystem mocking. Idempotence via FS rename (`_pending-digest/ → _processed/`) is simple, crash-safe, and verifiable in a single `readdir` assertion.

**What to avoid:** Implementing a bash token-pattern list by looking only at the task spec, not at the ADR that enumerates the authoritative list. T05 had 3 patterns; ADR §8 had 9. Cross-check the bash array against the ADR canonical list before submitting.

**Pattern to repeat:** (a) Drop frontmatter shape: `feature`, `project`, `created` (ISO UTC), `source_commits` (array), `qa_report` (relative path), `digested` (null → ISO ts). (b) Hub privacy double-check: declare `PRIVACY_PATTERNS: RegExp[]` at module level; test each drop body before `splitDropIntoEntries`; on match push `PRIVACY_REJECTED <file>` to errors and `continue` without moving. (c) Idempotence via FS move: set `digested: <ISO>` in frontmatter AND rename to `_processed/` in the same operation. (d) `@`-delimiter for sed with URL patterns: `s@discord.com/api/...@[REDACTED]@g` avoids `/` collision.
