# Architect Learnings

(QA appends to this file at the end of every feature retrospective.
Each entry is a lesson that generalizes beyond a single bug.)

## F01 — 2026-04-17

**What worked:** Requiring every placeholder directory to include a README with `**Status:** placeholder — conteúdo entra em FXX` and the responsible feature ID eliminated ambiguity about what was scaffolded vs. implemented. The explicit per-wave task structure (Wave 0 setup, Wave 1 content, Wave 2 docs) delivered all 11 tasks cleanly with no rework.

**What to avoid:** Do not design skeleton features with open-ended schemas. If a frontmatter field has a bounded set of valid values (e.g., `domain:`, `type:`), enumerate them as a closed enum in the README at skeleton time — retroactively closing an open enum in F02+ requires touching every already-created file.

**Pattern to repeat:** For scaffold/documentation features, the global acceptance criteria table IS the test suite. For implementation features, design parallel waves so each task has a hermetic scope — one tool = one file in `src/tools/`, one test file in `test/`. Hermetic wave boundaries eliminate inter-task file conflicts. Make it exhaustive and table-form — it is the only quality gate when there is no executable code. Require every placeholder directory to document: (1) current status, (2) planned content, (3) responsible feature ID.

## F02 — 2026-04-17

**What worked:** Parallel waves for the three MCP tools (Wave 2: T06/T07/T08) were truly independent — no file conflicts because each tool owned one hermetic file in `src/tools/`. The explicit wave ordering (Wave 0 scaffolding → Wave 1 shared libs → Wave 2 tools → Wave 3 wiring) delivered all 13 tasks without rework.

**What to avoid:** Writing smoke acceptance criteria that reference test-data strings by exact form ("waves") when the actual memory files use a different form ("Wave", "per-wave"). Before committing a smoke criterion with a specific query, run `grep -rl <query> memory/` and confirm it returns ≥ 1 hit. If not, either fix the query or add the term to the learnings data naturally.

**Pattern to repeat:** During Wave 0, enumerate all planned direct imports and verify each is a declared (non-transitive) `package.json` dependency. `grep -r "^import" src/ | sed 's/.*from "//;s/".*//' | sort -u` takes seconds and closes the transitive-dep trap before Wave 1 starts.

## F03 Discord Notifications — 2026-04-18

**What worked:** Scoping each discord module to a single responsibility (types, config, webhook, templates) with no cross-module coupling except types made parallel Wave 2 tasks truly independent. Zero file conflicts across T05/T06/T07 even though all three are in the same `src/discord/` directory.

**What to avoid:** Writing acceptance criteria greps that cover `mcp-server/` (including `test/`) when test fixtures legitimately use fake-but-matching URL patterns. The criterion "grep returns zero hits in `mcp-server/`" false-positives on test fixtures. Scope the grep to `src/` only.

**Pattern to repeat:** For acceptance criteria that check "no forbidden strings in production code", the pattern is: `grep -nRE "pattern" src/ patterns/ docs/ integrations/` — explicitly exclude `test/` dirs. Add a comment in the criterion: "test fixtures are exempted". This prevents QA false-positive noise and documents intent.

## F05 — 2026-04-18

**What worked:** ADR-0005 written before Wave 2 scripts enforced the user-scope vs per-project decision correctly. No drift between the ADR decision and the implemented behaviour.

**What to avoid:** Naming specific file paths (entry points, binaries, config keys) in acceptance criteria specs before the implementation confirms they exist. `sync/README.md` acceptance criterion referenced `server.ts`; the actual entry point was `index.ts`. Rule: when a criterion names a file path, grep for it in the repo first.

**Pattern to repeat:** For shell-script features, the architect should specify test sandbox strategy (hermetic `mktemp -d` + `export HOME=`) in the task spec — not leave it to the developer to invent. Writing `export HOME="$SANDBOX"` in the test harness spec is one line and prevents all real-system mutation risk.

## F05b — 2026-04-19

**What worked:** Wave dependency structure (helper in Wave 1, hooks in Wave 2, rollout in Wave 3) prevented file conflicts and gave each wave a stable foundation. ADR-0006 written in Wave 0 enforced design decisions correctly before implementation.

**What to avoid:** Writing ADR Decision sections that name specific file paths (hook directories, binaries, entry points) before verifying them with `ls` or `grep`. ADR-0006 named `pre-tool-use/hook.sh`, `stop/hook.sh` etc. — paths that never existed. Rule: before finalizing any ADR, run `grep -r "<path-named-in-adr>" <relevant-dir>` to confirm the path exists. This is the second consecutive feature where doc-to-filesystem drift was caught in review (F05: `server.ts`→`index.ts`; F05b: hook directory names).

**Pattern to repeat:** The orchestrator final-wave prompt MUST include an explicit two-item checklist: "(1) Update F05b-README.md Status: planned → done; (2) Mark every `[ ]` in the global acceptance criteria → `[x]`." This has been caught in review for five consecutive features (F02, F03, F02-r2, F05, F05b). Recording the lesson is not enough — it must be baked into the orchestrator template.

## F04 — 2026-04-19

**What worked:** Front-loading permissions (Wave 0) prevented mid-feature blockers. Parallel Wave 3 for content population (6 independent tasks, distinct directories) had zero file conflicts.

**What to avoid:** Acceptance criteria for hook patterns must name `README.md` as the frontmatter carrier, not `hook.json`. The `hook.json` is a Claude Code operational config (JSON, no YAML frontmatter); `README.md` is the ADR-0007 frontmatter descriptor. Always name the actual file.

**Pattern to repeat:** For hook pattern directories, the canonical layout is: `README.md` (ADR-0007 frontmatter + human docs) + `hook.json` (Claude Code operational config). Mermaid architecture diagrams that mix import-graph edges and data-flow edges should use `%% Import deps` and `%% Data flows` comment separators to avoid conflation.

## F06 — 2026-04-20

**What worked:** Non-destructive propagation pattern (backup + `jq del(.hooks)` diff verification) scaled cleanly to 5 downstream projects. Front-loading permissions in Wave 0 and the Wave 2 guard task (T09 blocking T10-T12) prevented concurrent mutation conflicts.

**What to avoid:** (1) Discord delivery acceptance criteria written as "receive notification in channel" — this is not mechanically verifiable and has produced PARTIAL smokes in 4 consecutive features (F03, F05, F05b, F06). Rewrite as: `curl exits 0 AND DISCORD_WEBHOOK_* is non-empty` (both checkable in CI); visual channel confirmation stays as SHOULD not MUST. (2) Orchestrator template without a hardcoded closing checklist — `Status: planned` left unchanged is now the **6th consecutive feature**. The fix is in the orchestrator prompt, not in retro notes.

**Pattern to repeat:** For bulk-propagation tasks (1 file per downstream project), design each task as a self-contained 7-step matrix: (1) backup, (2-4) command suffix checks, (5-6) matcher checks, (7) preservation diff. This is reusable as-is for any future hooks or config rollout across the 5 downstream projects.

## F08 — 2026-04-21

**What worked:** Single-file, single-wave fix (only `hook.sh` changed) kept scope minimal and eliminated all inter-task file conflicts. Fixtures co-located in `patterns/hooks/subagent-stop-progress/fixtures/` made the test self-contained and removable.

**What to avoid:** `Status: planned` not updated + AC checkboxes unchecked — **7th consecutive feature** (F02, F03, F02-r2, F05, F05b, F06, F08). Retro notes have not fixed this. The only fix is baking the closing ritual into the final-wave Developer task template as a mandatory pre-DIDIO_DONE checklist: (1) task `Status: planned` → `done`, (2) feature README `Status: planned` → `done`, (3) all `[ ]` → `[x]` in feature README global AC. If the orchestrator template cannot be changed, add this as a self-check step in the developer role prompt itself.

**Pattern to repeat:** For hub hook tests (`patterns/hooks/*/test-*.sh`), always export `DIDIO_HOOKS_DISABLE_FILTER=1` with an inline comment: `# hub repo is not in projects/registry.yaml — bypass registry-match`. Without this, `registry-match.sh` exits early and tests silently pass with wrong behavior (no payload sent). Document in every hub test scaffold.

## F14 — 2026-04-25

**What worked:** Wave structure (helper Wave 1 → tests+hooks Wave 2 → rollout Wave 3) gave developer a stable foundation at each stage with zero file conflicts. Specifying zero-dependency constraints (`bash/sed/grep/awk` only) in the feature brief was enforced correctly throughout.

**What to avoid:** AC items that enumerate sub-topics as "(a), (b), (c)" without explicitly allowing deduplication create ambiguous acceptance. F14 developer.md AC specified "(a) transcript_path shape, (b) mtime detection, (c) fail-soft" — developer reasonably omitted (a) because F08 already covered it, but the AC was verifiable either way. Fix: write "if not already covered by a prior feature entry in this file, add…" when deduplication is acceptable, or enumerate only genuinely new lessons.

**Pattern to repeat:** When a utility function (e.g., `build_field`) will be added to multiple files in the same parallel wave, either: (a) define it once in `_lib/` and source it (eliminates divergence entirely), or (b) specify the exact implementation verbatim in each task's AC so all parallel tasks share the same reference. Parallel-wave divergence for identically-named helpers is a predictable source of minor review issues — design it away at spec time.

## F17 — 2026-04-26

**What worked:** Fixture subdir layout (`fixtures/feature-context/`, `fixtures/last-wave-activity/`, `fixtures/rate-limit/`) kept test sandboxes readable and easy to update during QA without cross-helper contamination.

**What to avoid:** (1) `build_field` re-implemented in three hooks in the same feature with minor name-field escaping differences (F14 anti-pattern recurrence). The spec had `build_field` in the hook body of each parallel task — this is the root cause. Fix: move `build_field` to `_lib/` (one source) before the next feature adds more hooks. (2) Local task AC checkboxes left `[ ]` for the **9th** consecutive feature (T13). The closing ritual must be enforced mechanically: add `grep -nE '^\s*- \[ \]' <current-task-file>` as a hardcoded step in the final-wave Developer task template and block DIDIO_DONE if non-empty.

**Pattern to repeat:** For privacy/security acceptance criteria, the spec must explicitly require that the test fixture satisfies ALL pre-conditions needed to reach the code under test. Write: "fixture must include <condition X> so the function reaches the log-reading code path." Underspecified fixtures produce tests that trivially pass without exercising the critical branch.

## F16 — 2026-04-26

**What worked:** ADR-0010 written before Wave 1 gave all developers a shared vocabulary (schema, categories, filter terms, Jaccard threshold) — no inter-task semantic disagreements in 11 tasks across 5 waves.

**What to avoid:** ADR security sections that say "the hub does X" without a corresponding task AC item. ADR §8 promised a hub-side privacy double-check but T08 had no explicit AC for it — developer did not implement it; caught by TechLead as BLOCKING. Also: ADR tool names (`digest.absorb`) chosen before final registration (`memory.digest_pending`) drift and require inline fixes. Fix both in the same commit as registration.

**Pattern to repeat:** Every security property described in an ADR Decision section must appear verbatim as an AC item in the task responsible for implementing it. ADR internal references to MCP tool names must use the final registered name — never a draft name.
