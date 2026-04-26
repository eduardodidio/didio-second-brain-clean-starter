# Tech Lead Agent Learnings

## F02 Progress UI Polish — 2026-04-15

**What worked:**
- Extracting `statusStyles.ts` as a single-source-of-truth module is a clean pattern; the module boundary was well-defined and the tests were thorough (23 cases covering all statuses, fallbacks, and priority rules).
- Using `forwardRef` + `asChild` + Framer Motion for the `Progress` component is a good shadcn-compatible pattern; `initial={false}` prevents flash-of-animation on mount.
- Three-layer `useMemo` (groups → features → featureMap) in `Features.tsx` is correct and avoids a Map creation on every render.

**What to avoid:**
- Aggregate/derived functions that bypass the canonical registry. When a module introduces `STATUS_STYLE` as the source of truth, every function in that module must read from it — not redeclare color strings. Look for hardcoded Tailwind color strings in the new module as a quick smell check during review.
- Treating task test-scenario lists as illustrative examples rather than checklists. The `useMemo` stability test was listed in F02-T05 scenarios but not implemented. Reviewers should diff the implemented test file against the task's "Test scenarios" section.

**Pattern to repeat:**
- When `asChild` is used with an animated primitive, a one-line comment explaining the implementation choice (e.g., width animation vs. transform animation) prevents well-meaning future maintainers from "fixing" it to match the shadcn default and accidentally breaking behavior.
- `featureMap = new Map(features.map(...))` inside a `useMemo` dependent on `features` is preferable to `features.find(...)` inside a render loop, even for small arrays — it signals intent and is robust to growth.

## F03 Progress Perf & Hardening — 2026-04-14

**What worked:**
- Choosing Option A (persistent Python process) for the no-op guard was the right call: it also keeps the README cache alive across ticks, so both optimisations compound. When a task offers a "recommended" option with compounding benefits, developers correctly followed it.
- The integration test script (`tests/F03-integration-test.sh`) correctly distinguished between "touch a file" (same payload) and "write new content" (different payload) to test the no-op guard — an important subtle correctness concern, handled well.
- ADR documents a "reject" decision with five concrete reasons. This pattern (document why NOT to implement) is as valuable as documenting an accepted design.

**What to avoid:**
- Bare `except Exception: pass` in any persistent/daemon-style loop. A watcher that silently fails is indistinguishable from a healthy idle watcher. Always log to stderr at minimum.
- Leaving acceptance criteria checkboxes `[ ]` unchecked in task files. This was flagged in F02 retro (test scenario checklists) and recurred in F03. The developer must update criteria to `[x]` with a brief note when work is completed — reviewers should not have to infer status from the code.
- Diagram labels that describe the spec design rather than the actual implementation. Wave 0 diagrams said "JSON hash"; the developer chose the simpler string comparison. The diagrams were never updated. Update labels when you deviate from the spec.

**Pattern to repeat:**
- Integration test scripts that cover the "error" case (watcher on non-existent directory) survive and don't crash — using the `except Exception` guard correctly for the *test* case, even if bare silence is wrong for production.
- Benchmark results document the acceptance criterion threshold explicitly (ratios < 0.50) and print PASS/FAIL — making the criterion machine-checkable, not just human-readable.
- Global acceptance criteria that span multiple toolchains (e.g., `npm run test` inside a Python/bash feature) must be run and documented explicitly in T06/benchmark results. Do not assume they pass by inference.

## F02 MCP server MVP — 2026-04-17

**What worked:**
- Hermetic test isolation via `SECOND_BRAIN_ROOT` env var + `tmpdir` in `beforeEach/afterEach` is the right pattern for tools that read/write the filesystem. All three tool test suites used it correctly.
- Separating `types.ts` (interfaces + const enum) from lib and tool layers keeps the type contract readable and prevents circular imports.
- Error handling in the server layer (`isError: true` + `console.error` to stderr) is the correct MCP stdio pattern — stdout must stay clean for protocol framing.
- 99 tests across 7 files with all four mandatory scenarios (happy, edge, error, boundary) covered before the wiring task landed — this is the correct ordering and scope.

**What to avoid:**
- Using a transitive dependency as a direct import without declaring it in `package.json`. `zod` was imported directly in `server.ts` but only existed transitively via `@modelcontextprotocol/sdk`. Caught in review; the fix (add to `dependencies`) is trivial but the miss creates silent breakage risk when the upstream SDK changes.
- Internal SDK fields (`_registeredTools`) used in tests because no public testing surface was available. This creates fragile tests. When the architect spec lacks a testable surface, the developer should prefer an integration startup test over introspecting internals.
- Leaving global acceptance criteria checkboxes unchecked despite tasks being `done`. This is the third feature in a row where this pattern recurred. Reviewers must treat unchecked boxes as IMPORTANT and block approvals accordingly.

**Pattern to repeat:**
- During Wave 0 scaffolding, enumerate all planned direct imports and verify each is in `package.json`. A quick `grep -r "^import" src/ | sed 's/.*from "//;s/".*//' | sort -u` against `dependencies` closes the transitive-dep trap before Wave 1 starts.
- Pilot/smoke task (the final Wave) is a hard gate, not optional documentation. Feature verdict must be REJECTED if smoke is not run and documented — even when all prior tasks are exemplary.

## F02 MCP server MVP Round 2 — 2026-04-17

**What worked:**
- User-scope MCP registration (`claude mcp add --scope user`) is architecturally superior to project-scope for ecosystem-wide tools. When a developer makes this call at runtime, accept the deviation if (a) the rationale is documented in the task note and smoke report, and (b) the decision has downstream benefits (F05 rollout simplification).
- Static verification as a proxy for interactive smoke: when interactive MCP invocation is not automatable, verify data readiness (files containing the search keyword exist) and accept the partial smoke as sufficient for approval — with follow-up task created.

**What to avoid:**
- Carrying IMPORTANT items from a REJECTED review into the re-run without fixing them. `zod` dep and unchecked boxes recurred unfixed in Round 2. The orchestrator re-run prompt should include an explicit "fix all IMPORTANT items from prior review" step before handing back to techlead.
- Deferring interactive smoke steps without marking the smoke file clearly as "partial" — the distinction between "step not yet run" and "step passed" must be explicit in the report.

**Pattern to repeat:**
- When a review round is REJECTED, the follow-up review should diff the IMPORTANT list from the prior review explicitly, not just verify the BLOCKING fix. A checklist of `I1, I2, I3` status at the top of Round 2 saves re-scanning the implementation.
- Scope deviations from acceptance criteria (project-scope → user-scope) need: (a) what the criterion said, (b) what was done, (c) the rationale. T13 note does this correctly — use as the template.

## F03 Discord Notifications — 2026-04-18

**What worked:**
- Hermetic dependency injection across all 4 discord/* modules (`config`, `webhook`, `templates`, `discord-notify`) enables fully isolated unit tests with zero network calls. This is the correct pattern for any tool with external I/O side effects.
- Static security test in `discord-notify.test.ts` reads its own source file and asserts `console.error` never references the URL variable. This is a high-value pattern for tools touching credentials — replicable in any future secret-handling tool.
- Bash hooks with `set -u` (not `-e`) + unconditional `exit 0` correctly prevents curl failures from breaking the Claude Code session. Many teams miss this — call it out explicitly in architect specs for hook tasks.
- T13 smoke report correctly used PARTIAL status with explicit step-by-step table (PASS/BLOCKED/DEFERRED) and named the responsible party for each blocked step. This is the reference template for operational blockers.

**What to avoid:**
- Acceptance criteria greps that cover `mcp-server/` (including `test/`) will false-positive on test fixture URLs. The criterion `"grep ... returns zero hits"` must scope to `src/` only. Test directories legitimately use fake-but-matching values for fixtures.
- Approving PARTIAL smoke as DONE. T13 correctly stayed PARTIAL — the smoke file documents what's blocked and why. Never promote a smoke to DONE without real evidence (message IDs or screenshots from each channel).

**Pattern to repeat:**
- When writing acceptance criteria greps for "no forbidden strings in production code", explicitly exclude `test/` directories in the grep pattern or add a comment that test fixtures are exempted.
- Static grep tests that read the source file under test (not a mock) are the most reliable way to enforce "this variable must never appear in a log statement." Add these for every tool that handles URLs, tokens, or credentials.

## F03 Discord Notifications — QA retrospective addendum — 2026-04-18

**What worked:** APPROVED_WITH_FOLLOWUP verdict was appropriate for T13 PARTIAL — the code is complete and correct; the blocker is operational (user must create Discord server). The smoke report clearly identified which steps were blocked and named the responsible party. QA correctly used this as PASS with noted caveat rather than FAIL.

**What to avoid:** Documenting valid enum values in README without cross-referencing the source type. `mcp-server/README.md` listed `"alert"` instead of `"warn"` and omitted `"error"`. TechLead review should verify README enum lists against the canonical `types.ts` definition — a one-line diff check.

**Pattern to repeat:** Acceptance criteria grep scope: always explicitly scope "no forbidden strings" greps to `src/` not the full module directory. Example: `grep -nRE "pattern" mcp-server/src/ patterns/ docs/` — never `mcp-server/` which includes test fixtures. Document the scope exclusion in the criterion comment.

## F01 Skeleton & second-brain migration — 2026-04-17

**What worked:**
- Closed-enum frontmatter schemas in READMEs (domain values, type values) that reference `projects/registry.yaml` as the authoritative source of valid project names created a lightweight pre-implementation contract. When F02 builds the linter, the schema is already defined and agreed upon — no negotiation needed.
- Placeholder READMEs with explicit `**Status:** placeholder — conteúdo entra em FXX` lines and responsible-feature references prevented scope drift and made the skeleton/implementation boundary immediately visible during review.
- Table-form global acceptance criteria are the test suite for structural/documentation features. Every criterion being checkable in under 60 seconds (file exists, YAML valid, field present) made review fast and unambiguous.

**What to avoid:**
- For structural features, do not assume acceptance criteria are satisfied just because directories exist. Validate field completeness (all required YAML keys), count (6 registry entries, not 5), and that empty placeholder dirs have `.gitkeep` rather than being omitted from git entirely. Each is a distinct failure mode.

**Pattern to repeat:**
- Structural/scaffold features that define data conventions (frontmatter schemas, enum values, registry schema) should document those conventions as **closed** — explicitly state that new values require README update and possibly an ADR. This is cheap to write at skeleton time and prevents silent drift as subsequent features add content.
- During review of skeleton features, check that each placeholder directory README (a) states current status, (b) describes planned content, and (c) names the feature responsible for filling it. This three-part structure is minimal and sufficient.

## F05 Sync MCP + Discord hooks (slim) — 2026-04-18

**What worked:**
- Bash test suites with hermetic `mktemp -d` sandboxes and `export HOME=` override are the correct pattern for scripts that write to `~/.claude/settings.json`. All 41 test cases ran isolated with no real system mutation.
- Fail-fast hook source validation (exit 4 before any mutation) in `install-discord-hooks.sh` is the correct guard ordering: validate all inputs → backup → write. No partial writes possible.
- PARTIAL smoke label (step 6 Discord delivery) is the right call when hooks exit 0 but channel receipt requires manual UI confirmation. Do not promote to PASS without evidence; do not block on it.

**What to avoid:**
- Spec documents written before verifying file paths cause documentation drift. `sync/README.md` named `mcp-server/src/server.ts` when the actual entry point is `index.ts` (per `package.json`). Always `ls` or `grep` a referenced path before writing it into docs.
- Global acceptance criteria left unchecked at review time — now the **4th consecutive feature** (F02, F03, F02-r2, F05). This pattern is systemic. The orchestrator must add an explicit "check all boxes" step to the developer prompt, not rely on the developer to remember.

**Pattern to repeat:**
- When a task's acceptance criteria reference a specific file path (binary name, entry point, config key), the developer should verify the path with `ls`/`grep` before finalizing the docs. If the file differs from the spec, update both the criterion and the documentation in the same commit.
- Test file order in `run-all.sh` is alphabetical: `test-install-hooks.sh` → `test-install-mcp.sh` → `test-lib.sh`. When reading truncated CI output (`tail -N`), the last summary line is from `run-all.sh` (counts of test *files* passed), not test cases.

## F05b Cross-project rollout + CLAUDE_PROJECT_DIR filter — 2026-04-19

**What worked:**
- Hermetic 9-test suite for `registry-match.sh` (match, no-match, absent registry, empty var, escape hatch, syntax, empty registry, trailing slash, no stdout) is thorough and well-isolated. This is the reference pattern for helper-library tests in this project.
- Fail-quiet design (missing registry → exit 1 silently, no crash) is correctly implemented and tested. The design rationale (silence preferred over crash for hook libs) is a pattern worth repeating for future hook helpers.
- Smoke report step-by-step format (command + exit code + Discord channel observation) is clear and actionable. All 9 sub-tests (3 hooks × 3 modes) documented.

**What to avoid:**
- ADR Decision section naming hook directories that exist in early spec drafts, not the shipped code. F05b's ADR-0006 named `pre-tool-use/hook.sh`, `stop/hook.sh`, etc. — none exist. Fixed in review, but the lesson from F05 (`server.ts` → `index.ts`) was not applied. For every path in an ADR Decision section: `ls` or `grep` it before finalizing.
- Smoke reports that skip named sub-criteria from the feature spec. F05b spec required an explicit idempotency step ("2º run sai no changes") but smoke-20260419.md did not document it. Idempotency was covered by the test suite, but the spec criterion was still unmet in the smoke file. Future T09 smoke prompts must enumerate every sub-criterion from the global acceptance criteria, not just the ones that seem interesting to the developer.
- `Status: planned` / unchecked acceptance criteria — now **5 consecutive features** (F02, F03, F02-r2, F05, F05b). This pattern will not self-correct. The orchestrator final-wave prompt needs a hardcoded checklist item.

**Pattern to repeat:**
- When a prior retro lesson has recurred 3+ times without being fixed, escalate from "lesson" to "orchestrator template change." The `Status: planned` / unchecked boxes pattern was recorded in F02, F03, F02-r2, F05, and F05b retros. The fix belongs in the Architect/Developer Wave 4 prompt template, not in repeated retro notes.
- TechLead fixing minor IMPORTANT issues inline (ADR hook names, Status, checkboxes) at review time is efficient and avoids a rejected → re-run cycle for trivial edits. Document the inline fix in the review summary table so the change is auditable.

## F05 Sync MCP + Discord hooks (slim) — Round 2 re-review — 2026-04-18

**What worked:**
- Fixing only the two required issues (B1 + I1) from the REJECTED review was sufficient for APPROVED on round 2. Scoping fixes narrowly and cleanly avoids regressions.
- The round 2 review pattern: start by checking each prior-review issue explicitly before doing a full sweep. Saved time; reduced re-scan risk.

**What to avoid:**
- Feature-level `Status: planned` left unchanged after all tasks complete. The orchestrator has no explicit step to update F05-README.md itself. The techlead caught this in review — but it should be a developer responsibility, not a review catch.

**Pattern to repeat:**
- When the orchestrator re-submits a rejected feature, include an explicit "fixes applied" table in the re-submission. Techlead can verify in O(1) per prior issue before doing a full sweep. This pattern scales well even for features with 5+ prior issues.
- Add to developer final-wave prompt: "After all tasks are `done`, update `F05-README.md` (or equivalent feature README) `Status: planned` → `done`." Single-line edit that reviewers should not be finding.

## F08 subagent-stop role extraction fix — 2026-04-21

**What worked:** Implementation was clean, minimal, and correct on first review pass. Core fix (replace dead `CLAUDE_SUBAGENT_ROLE` + `"role":` grep with `transcript_path` → `grep -oE '"subagent_type"…' | tail -n1`) is idiomatic zero-dep bash. Test suite (5 hermetic cases, fake curl sandbox) passed 5/5 on first run and idempotency check. Diagram path audit: all file paths named in `.mmd` files verified to exist — no recurrence of the F05/F05b ADR path-naming error. Developer's `## Notes from Developer` section in T03 documented runtime deviations (`DIDIO_HOOKS_DISABLE_FILTER=1`, `DISCORD_WEBHOOK_PROGRESS` pre-export) with rationale — this is the T13-note pattern applied correctly.

**What to avoid:** `Status: planned` + unchecked global AC boxes — **7th consecutive feature** (F02, F03, F02-r2, F05, F05b, F06, F08). Inline TechLead fix remains the stopgap, but recording this in retros alone has not stopped the pattern. The fix belongs in the orchestrator Developer Wave-N prompt as a hardcoded final-step checklist, not in TechLead memory.

**Pattern to repeat:** Hub hook tests (`patterns/hooks/*/test-*.sh`) must export `DIDIO_HOOKS_DISABLE_FILTER=1` because `didio-second-brain-claude` itself is not in `projects/registry.yaml` (registry lists downstream consumers only). Document this in a comment near the env-setup block of each hub test — it is not a bug, but it surprises every first-time reader. Template the `## Notes from Developer` section in Architect task files; it produced better reviews in F08 than tasks without it.

## F05b — 2026-04-19

**What worked:** Fixing IMPORTANT items inline during review (ADR hook paths, feature README Status, unchecked checkboxes) rather than returning REJECTED — QA arrived to a clean state with no rework cycle. Retrospective Seeds section in the review file gave QA clear signal on what to propagate.

**What to avoid:** Approving ADR Decision sections without verifying that every named path/file exists in the repo. F05b ADR-0006 listed `pre-tool-use/hook.sh`, `stop/hook.sh`, `notification/hook.sh` — none of which exist. Rule: for every file path named in an ADR's Decision or Context section, run `ls <parent-dir>` or `grep -r <name>` before approving. This is now documented in two consecutive retros (F05, F05b) — a class of error, not a one-off.

**Pattern to repeat:** When the same IMPORTANT item (feature Status unchecked, README Status not updated) appears for the fifth consecutive feature, escalate from "record in retro" to "flag in review that the orchestrator template must change." The retro loop alone has not been sufficient — the fix must enter the orchestrator prompt.

## F04 MCP Knowledge & Patterns — 2026-04-19

**What worked:**
- The `status: stub` + `updated:` pattern for knowledge files is clean and honest. Five stubs out of 10 articles is correct for a first-pass content wave. MCP tools handle stubs gracefully with no special-casing.
- Hermetic test isolation (`SECOND_BRAIN_ROOT` + `tmpdir`) applied consistently to all 6 new tools — 318 tests, 0 fail. The F02 pattern is fully propagated.
- `as const` immutable arrays for all new enum types (`KNOWLEDGE_DOMAINS`, `PATTERN_TYPES`, `ADR_STATUSES`) — consistent with `MEMORY_CATEGORIES` from F02. No drift.
- `zod` and `yaml` transitive-dep lesson from F02 applied: both in `dependencies` from the start.
- `F04-README.md Status: done` and all acceptance criteria `[x]` — the F05b escalation to orchestrator template worked for this feature.

**What to avoid:**
- Acceptance criteria that say "hook.json com frontmatter" are misleading when the frontmatter is actually in `README.md` (JSON files cannot have YAML frontmatter). The correct statement is: "the `README.md` in the hook directory must have ADR-0007 frontmatter." Future architect specs should name the frontmatter carrier explicitly.
- Mermaid architecture diagrams that mix import-graph edges and data-flow edges without labeling them. `ML --> filesystem-glob` describes a read operation, not a module dependency. Future diagrams should use `%% Import deps` / `%% Data flows` comment groups to separate the two.

**Pattern to repeat:**
- For hook patterns: the `README.md` inside each hook directory is the ADR-0007 frontmatter carrier; `hook.json` holds only operational Claude Code hook config. `patterns-search` correctly reads `README.md` as the pattern descriptor and uses the directory name as the pattern name. This two-file design is validated — use it as the reference for future hook patterns.
- Stub content (`status: stub`) with explicit `updated:` is preferable to omitting files or writing placeholder prose that looks authoritative. Validated in F04 as the default pattern for initial content waves.

## F04 — 2026-04-19

**What worked:** Hermetic tool module architecture (one file per tool, shared lib in `lib/`) was easy to review — each tool had a clear scope and a 1:1 test file. No cross-tool coupling to reason about.

**What to avoid:** When reviewing hook pattern dirs, check `README.md` for ADR-0007 frontmatter — not `hook.json` (which holds Claude Code operational config and cannot carry YAML frontmatter). Flag Mermaid diagrams that mix import-graph edges and runtime data-flow edges without comment separators.

**Pattern to repeat:** For architecture diagrams covering both module dependencies and data flows, require `%% Import deps` and `%% Data flows` comment labels before each group of edges. This makes diagram intent unambiguous for future reviewers.

## F09 — Vault health + heartbeat — 2026-04-24 (final: 2026-04-25)

**What worked:**
- Both test suites (8/8 heartbeat, 5/5 lint-vault) passed on first run with zero flakiness. Hermetic `mktemp -d` + `--hub $SANDBOX` pattern is fully established and well-executed.
- Fake `curl` via `PATH` override with `SANDBOX_CURL_LOG` env var (not hardcoded path) is the correct pattern for multi-sandbox fire-and-forget webhook tests — allows parallel sandboxes without collision. Reference implementation in T05.
- JDN awk date-diff in `lint-vault.sh` — no external `date` utility required. Good portability choice for a cron-grade tool.
- ADR-0008 Decision section uses algorithm pseudocode rather than file paths — no recurrence of the F05/F05b path-naming error. Lesson propagated correctly.
- T01 developer correctly documented the `.claude/skills/` permission blocker with the manual fix command (T13-note pattern). No silent skip — the blocker was explicit and findable.
- APPROVED_WITH_FOLLOWUP → APPROVED resolved in one step: explicit verbatim command in the review file (`mkdir -p ... && cp ...`) made the user action unambiguous. Providing an exact command rather than a description is always faster.

**What to avoid:**
- `## Diagrams` section naming a task (F09-T07) that was never created in the Waves manifest. Stubs sat empty through all of Wave 1 and Wave 2. Rule: every item in `## Diagrams` must reference a task that exists — if it's the closing task, name the closing task.
- `Status: planned` + unchecked checkboxes — **9th consecutive feature** (F02 → F09). The F09-README itself contained an explicit AC item about this and it still recurred. The fix belongs in the orchestrator Developer Wave-N prompt, not in retros.

**Pattern to repeat:**
- When a scaffolding task hits a write-permission wall on `.claude/`, document the manual fix command inline in the task Notes section and mark `Status: blocked` (not `done`). TechLead review catches unresolved blockers and creates the artifact inline. Never silently skip.
- Inline TechLead fixes (diagrams, README, CLAUDE.md, developer.md, checkboxes, status) applied in a single review pass continue to be the most efficient way to handle closing-ritual gaps — avoids reject→rerun cycle.
- For APPROVED_WITH_FOLLOWUP verdicts that require user action, always provide a single verbatim command block (not prose) — reduces friction to one copy-paste.

## F06 — Rollout hooks Discord cross-project — 2026-04-20

**What worked:**
- Non-destructive hook propagation pattern (backup + `jq del(.hooks)` diff verification) is clean and auditable. All 5 downstream projects verified live at review time — the smoke report format is clear enough to re-run checks in under 2 minutes.
- Sync script `merge_hooks` algorithm (dedupe by `command` string, Python heredoc alongside existing permissions merge) is correctly idempotent and non-destructive. 4-scenario smoke (new, idempotent, dedupe, custom-preservation) is the reference test matrix for future merge routines.
- ADR Decision section uses algorithm pseudocode rather than naming specific hook file paths — avoids the F05/F05b pitfall of naming non-existent paths.
- Diagram uses `%% Import deps` / `%% Data flows` comment separators from F04 retro — the lesson propagated correctly.

**What to avoid:**
- `Status: planned` not updated after task completion — this is the **6th consecutive feature** (F02, F03, F02-r2, F05, F05b, F06). Inline techlead fixes remain the stopgap. The fix must enter the Developer Wave-N prompt as a hardcoded checkpoint: "Before DIDIO_DONE, update task Status → `done` and check AC boxes." Recording it here for the 6th time without changing the template is itself the anti-pattern.
- PARTIAL Discord smokes accepted as the permanent baseline — 4 features in a row (F03, F05, F05b, F06). The acceptance criterion "receive notification in channel" is not mechanically checkable. Architect should rewrite it as "curl exits 0 AND WEBHOOK non-empty" — both verifiable in CI.
- Spec deviations (e.g., using `/**` wildcards instead of specific file paths) without a task-level note. Even benign deviations should be documented with one line: "Used X instead of spec's Y — rationale: Z." Use the T13-note pattern.

**Pattern to repeat:**
- When both smokes (hub smoke + downstream smoke) are PARTIAL for identical reasons (Discord visual confirmation), group them in the issue table as OPERATIONAL rather than IMPORTANT. They don't block the merge; they require a human UI step. Label the smoke file entries `PARTIAL` not `PENDING` to signal the distinction clearly.
- Fixing IMPORTANT items inline at review time (Status updates, checkbox updates) with a documented table at the top of the review file is efficient and avoids reject→rerun cycles. Standard practice confirmed across F05b and F06.

## F14 — 2026-04-25

**What worked:** Zero blocking issues; both minor issues (M1 escaping, M2 diagram comments) were simple enough to fix inline in the review pass itself. Inline fixes table in the review file made QA verification straightforward — one grep each to confirm. Reviewing `build_field` implementations across all three hooks in parallel caught the escaping inconsistency that a per-hook review would have missed.

**What to avoid:** When a utility function (e.g., `build_field`) is implemented independently in multiple hooks as part of a parallel wave, diff the implementations across all modified files during review. Identically-named helpers that drift in behavior (one missing backslash escaping) are easy to miss if reviewing hooks in isolation. Standard TechLead checklist item for bash-script features with parallel waves: "grep all files for the same function name; diff implementations."

**Pattern to repeat:** Diagram comments that make claims about files **not shown in the diagram** (e.g., "PostToolUse follows the same pattern without Phase") should be treated as high-risk in review — they are harder to keep accurate than the diagram nodes themselves. If the claim is important, add the component to the diagram; if the diagram would get too busy, omit the comment rather than risk an inaccurate one. Verify any "X follows the same pattern" comment by reading the actual file before approving.

## F15 — Token usage reporting + economy — 2026-04-26

**What worked:** All 3 hermetic test suites (8+6+9 = 23 tests) passed on first run. Privacy and zero-dependency checks cleared mechanically. Close ritual complete: Status=done, all AC [x], developer.md entry, README + discord/README updated, sample report committed. ADR-0009 formula exactly matches the `token-economy.sh` awk implementation — no drift. Developer correctly separated `count_secondbrain_calls` (per-file aggregation) from `estimate_savings` (per-tool mapping). The privacy check (`grep "content"`) as a mechanical criterion is the right pattern — self-documenting and runnable by any agent.

**What to avoid:** Orchestrators that loop over N files, accumulate per-file helper output into a TSV, and then render directly without re-aggregating by key. `count_secondbrain_calls` correctly aggregates within one file, but without a cross-file aggregation step the final table duplicated tool rows (one per file). The e2e test fixture had only 1 file with MCP calls so the test could not catch this; the bug was only visible in the real sample report. Rule: orchestrator e2e fixtures must include >1 file with calls to the same tool, otherwise cross-file aggregation gaps are invisible.

**Pattern to repeat:** (1) For every orchestrator that pipelines N-file collection → per-key aggregation → render: add an explicit "aggregate by key" awk pass between collection and render as a named variable (`ECON_TSV_AGG`), not an inline chain. (2) Sourced-helper diagram convention: show the orchestrator as mediator between data source and helper. Label edges with the actual variable or mechanism (e.g., `"per-path loop via FILES_LIST"`) so the diagram distinguishes data-flow edges from module-dependency edges. This prevents the JSONL→helper direct-edge class of diagram error.

## F17 — Discord rich messages v2 — 2026-04-26

**What worked:** All helpers are correctly fail-soft with FS guards at every path access; the zero-dependency constraint was cleanly upheld (grep+sed+awk+date only). The close ritual (Status=done, all AC [x]) was executed correctly — first time with no inline fix needed on the feature README or global AC. The `test-install-hooks.sh` was updated to expect 3 Stop hooks (instead of 1), catching the new wiring in the integration test. Privacy-safe log extraction (allowlist pattern: only `file_path` keys) is the right design — immune to false positives from prompt content.

**What to avoid:** Privacy test fixtures that satisfy the "sensitive data present" pre-condition but NOT the other pre-condition required to reach the sensitive code path (here: missing feature dir causes early return before log-reading code). A test that short-circuits at an unrelated guard is not evidence of the property being tested. During review, for every privacy/security test case, verify the fixture satisfies ALL guards that the function checks before reaching the code under test. Verify by reading the function top-to-bottom and confirming each guard condition against the fixture.

**Pattern to repeat:** When reviewing a feature where the same helper (`build_field`, escaping, etc.) appears across multiple parallel-wave hooks, always grep all hook files for the function name and diff implementations side-by-side. F14 and F17 both had `build_field` drift — it is a recurring pattern for bash hook features with parallel waves. Add this as a standard checklist item: "for every function defined in >1 hook, diff implementations."

## F16 — Learning loop digest — 2026-04-26

**What worked:** Architecture is clean and well-layered (bash hook → drop file → TS pure lib → TS I/O tool → MCP). `digest.ts` is correctly pure-function; I/O isolated in the tool layer. Close ritual was executed correctly — Status=done, all AC [x], package.json bumped to 0.2.0, e2e demo committed. ADR-0010 is thorough and well-structured with 10 sections covering schema, classification, filtering, dedupe, routing, idempotence, and privacy. Both diagrams are accurate.

**What to avoid:** When an ADR security/privacy section states that both a downstream artifact (hook) AND the hub implement a property ("O hub faz double-check defensivo…"), verify BOTH artifacts. F16's privacy check was only implemented in the bash hook (3/9 patterns), not in the hub tool — a silent gap that would have allowed Anthropic tokens, PEM keys, and AWS keys to be absorbed into `memory/agent-learnings/`. The gap was invisible from the global AC checkboxes (which only described the hook's behavior). Rule: for every security/privacy claim in an ADR, create a discrete AC item in the task responsible for that artifact — do not let cross-layer security properties be inferred from related AC items.

**What to avoid (continued):** ADR enumerated lists that are "the same list used by artifact X" must be verified by diffing the ADR list against the actual artifact. F16 had 3 bash patterns vs 9 in ADR §8. TechLead checklist item for security features: grep both the ADR and each artifact for the claimed list; diff them line by line.

**Pattern to repeat:** Inline ADR tool-name fixes (draft name → registered name) are cheap and should always be applied at review time. F16 had `digest.absorb` in the ADR vs `memory.digest_pending` in the server — three occurrences fixed in one pass. The F05/F05b/F08/F09 lesson (verify every path/name in ADR Decision section against the actual FS/code) now extends explicitly to MCP tool names.


## F16 — 2026-04-26

**What worked:** Catching BLOCKING B1 (hub privacy check absent) and B2 (3/9 token patterns) via cross-referencing the ADR's stated promise against the actual implementation. The I2 inline fix (routing table path drift) was caught by comparing ADR §6 against the actual `patterns/snippets/` directory.

**What to avoid:** Accepting a pattern list in any artifact as correct without diffing it against the ADR's canonical list. When ADR says "mesma lista usada pelo artifact X", always: (1) read the ADR list, (2) read artifact X, (3) diff. Any gap in a privacy/security list is BLOCKING.

**Pattern to repeat:** For any feature with an ADR security section: (1) read the section, (2) find the task responsible for the hub-side implementation, (3) verify a matching AC item exists in that task — if not, it is a BLOCKING gap even before running any code. Security properties promised in ADRs must have 1:1 AC items in the implementing task.
