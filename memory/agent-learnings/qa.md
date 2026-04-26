# QA Agent Learnings

## F02 — 2026-04-15

**What worked:** Tech Lead review flagged a missing test scenario and a canonical registry violation before QA ran — reading the review file first saved redundant discovery work.

**What to avoid:** Do not skip diffing the implemented test file against the task's "Test scenarios" section. Each listed scenario is a required test; if it's missing, create it — do not just report it. Also check canonical registry modules (e.g., `statusStyles.ts`) for functions that hardcode literal strings that should delegate to the registry map.

**Pattern to repeat:** Spy-based memo stability test: `vi.mock('@/lib/selectors', async (importOriginal) => { const actual = await importOriginal(); spy.mockImplementation(actual.fn); return { ...actual, fn: spy }; })` — then assert `spy.mock.calls.length` is stable after `rerender()` with same data reference. Clean, low-overhead useMemo correctness proof with no React Profiler boilerplate.

## F03 — 2026-04-14

**What worked:** Reading the Tech Lead review before running tests surfaced actionable follow-up items (stderr logging, diagram label fixes) that QA could fix directly rather than just report. This is the right division of labour: QA fixes what is clearly wrong; reports what is genuinely debatable.

**What to avoid:** Trusting that cross-stack acceptance criteria (e.g., `npm run test` inside a Python/bash feature) were run by the developer. Explicitly run and record every global criterion — especially ones that require tools outside the feature's primary stack.

**Pattern to repeat:** When a Tech Lead review returns APPROVED_WITH_FOLLOWUP, triage the follow-up items: fix code/diagram correctness issues directly during QA pass, record documentation-hygiene items in the QA report but don't block the verdict on them. Always re-run the full test suite after applying QA fixes to confirm nothing regressed. Check diagram labels against the actual implementation (not just the spec) — subtle vocabulary mismatches ("hash" vs "string compare") erode trust in documentation over time.

## F01 — 2026-04-17

**What worked:** For scaffold/documentation-only features, treating the global acceptance criteria table as the test suite and verifying each criterion programmatically (Python YAML parse, grep-based status checks, filesystem existence checks) produced a complete, reproducible QA pass with no ambiguity.

**What to avoid:** Do not rely solely on the Tech Lead review's checklist — run independent programmatic verification even for structural features. A "PASS" in a review file could be aspirational; a `python3 -c "import yaml; ..."` is not.

**Pattern to repeat:** For features with no executable code, the QA script is: (1) parse any YAML/JSON files programmatically, (2) grep-check expected strings in key files, (3) verify filesystem structure with `ls`, (4) confirm no secret files via `git diff --name-only`. This is the minimal reproducible QA harness for skeleton features.

## F02 MCP server MVP — 2026-04-17

**What worked:** Running all commands with the absolute bun path (e.g. `$(which bun)` or `~/.bun/bin/bun`) when `bun` is not in the agent's PATH. Verifying each global acceptance criterion programmatically (typecheck, build, bun test) rather than relying on the tech lead review's summary.

**What to avoid:** Accepting smoke acceptance criteria at face value without verifying the test-data query matches actual file content. The criterion `memory.search({ query: "waves" })` expected ≥ 1 hit, but all parallel waves in memory files used "Wave" not "waves" — a case-insensitive search for "waves" (plural) returned 0 hits. Before declaring a smoke criterion met, run `grep -ril <query> memory/` and confirm ≥ 1 match.

**Pattern to repeat:** When a tech lead review returns APPROVED_WITH_FOLLOWUP with IMPORTANT items, triage and fix them during QA: (1) add missing explicit deps to `package.json` and re-run `bun install` + `bun test`, (2) check off global acceptance criteria in the feature README, (3) update smoke report with PARTIAL label when interactive steps remain. Re-run the full test suite after each fix to confirm no regressions.

## F03 Discord Notifications — 2026-04-18

**What worked:** When TechLead returns APPROVED_WITH_FOLLOWUP, reading the review's "Issues Found" section before running programmatic checks surfaces specific things to verify (grep scope, vocabulary mismatches). QA fixed the vocabulary error in `mcp-server/README.md` directly (`"alert"` → `"warn"`, added `"error"`) rather than just reporting it — the correct division of labour.

**What to avoid:** Trusting that README enum lists match the implementation without programmatic verification. Check: for each enum field documented in a README, `grep` the canonical `types.ts` for the actual values and diff. The mismatch between `"alert"` in the README and `"warn"` in the types was not caught by TechLead review or developer — only caught by QA reading both sources.

**Pattern to repeat:** For MCP tool features, the QA enum-check pattern is: (1) read the types file for valid enum values, (2) grep every README and example that mentions those values, (3) assert exact match. This is a 2-step programmatic check that prevents the "docs say alert, code says warn" class of subtle errors. Also: always run `grep -n "console.error" src/discord/*.ts src/tools/discord-notify.ts` and visually confirm no URL variable appears in the arguments — the static test in discord-notify.test.ts provides coverage but a human grep confirms the pattern holds at the layer boundary too.

## F05 — 2026-04-18

**What worked:** Running `bash sync/tests/run-all.sh` as the primary test command (41 hermetic bash tests) is the right pattern for shell-script features. Each test case covers a distinct scenario in an isolated `mktemp -d` sandbox — readable as a spec, executable as a regression suite.

**What to avoid:** Trusting grep output where exit code 1 means "no matches" vs "error" without checking context. For `grep -nRE "pattern"` used as a security check, exit 1 = no matches = PASS. Verify this interpretation before reporting results.

**Pattern to repeat:** For bash-script features, QA verification flow: (1) run `bash sync/tests/run-all.sh`, assert exit 0, (2) verify file existence for all key artifacts with `ls`, (3) `jq .` on all mutated JSON files, (4) grep-check required strings in doc files, (5) confirm pilot state (registry field, settings keys) with targeted `jq`/`grep` queries. This is the complete, reproducible QA harness for infrastructure/sync features.

## F05b — 2026-04-19

**What worked:** Following the F05 QA pattern verbatim: (1) `bash sync/tests/run-all.sh`, assert exit 0; (2) jq-verify all 5 mutated settings.json files; (3) grep-check required strings in docs; (4) confirm registry state. 50 tests, 0 failures — complete validation in a single pass with no test gaps found. Reading the TechLead review first surfaced all IMPORTANT items already fixed inline, saving redundant discovery work.

**What to avoid:** None new — prior learnings applied correctly. The "trust but verify TechLead's inline fixes" pattern held: independently re-ran programmatic checks rather than accepting the review summary at face value.

**Pattern to repeat:** For bash-script features with a hermetic test suite, the QA pass is: (1) run full suite, (2) programmatic artifact existence checks (test -f, bash -n, jq .), (3) grep-check doc strings, (4) cross-project state verification (jq per project, grep -c on registry). If all pass and no test gaps found, verdict is PASSED with no new tests needed. This is the complete, reproducible QA harness for infrastructure/sync features.

## F04 — MCP Knowledge & Patterns — 2026-04-19

**What worked:** For MCP features with content population, the QA harness was: (1) `bun test` — 318 pass; (2) `bun run typecheck` — 0 errors; (3) `jq .` on settings.json; (4) filesystem existence checks (`ls` per knowledge domain and patterns dir); (5) `grep -nR "status: stub"` + `grep -nE "updated:"` to verify content metadata; (6) frontmatter field checks on agent/hook pattern files. Reading the TechLead APPROVED review first surfaced both minor observations before running programmatic checks.

**What to avoid:** Checking hook frontmatter in `hook.json` — that file is Claude Code operational config (JSON, no YAML). The ADR-0007 frontmatter carrier for hook patterns is `README.md` in the hook directory. Always `head` the README.md, not hook.json, when verifying hook pattern frontmatter.

**Pattern to repeat:** For knowledge content waves, grep-check both `status: stub` presence AND `updated:` field presence across all `knowledge/**/*.md`. Two separate greps: one confirms stubs are marked, one confirms no file is missing the date field. Run both even when the tech lead review already confirmed it — independent programmatic verification is the QA contract.

## F06 — 2026-04-20

**What worked:** Reading the TechLead review before running checks surfaced inline fixes (Status, checkboxes, smoke-YYYYMMDD placeholder) and confirmed all IMPORTANT items resolved — no redundant discovery work. Programmatic verification of all 5 downstream settings.json files with a single jq loop matched the smoke report without ambiguity.

**What to avoid:** Treating PARTIAL Discord smokes as separate IMPORTANT items per hook (hub smoke PARTIAL + downstream smoke PARTIAL = 2 items). Both smokes are PARTIAL for the same reason (visual channel confirmation not mechanically checkable). Group them as a single OPERATIONAL item. This pattern recurred in F03, F05, F05b, F06 — it should not inflate the issue count or the review severity.

**Pattern to repeat:** (1) When hub and downstream smokes are both PARTIAL for the same reason, group in the QA report as a single "OPERATIONAL — Discord visual confirmation pending" row. (2) Fix MINOR placeholder issues (wrong date in a path, stale reference) directly rather than reporting them — QA fixes cosmetic correctness, reports code gaps. (3) For hooks-propagation features, the independent verification loop is: `jq -e '.hooks.<event>[0].hooks[0].command | endswith("<hook>.sh")'` and `jq -r '.hooks.PostToolUse[0].matcher'` per project. This is the QA reference for any future downstream rollout.

## F08 — 2026-04-21

**What worked:** For single-file bash hook features, the QA harness was: (1) `bash -n hook.sh` (syntax); (2) `bash test-hook.sh` twice (5 cases, idempotency); (3) programmatic grep-checks on all AC items (fixtures, diagrams, README, developer.md); (4) path audit on diagram-referenced paths. Complete validation in one pass, no test gaps found.

**What to avoid:** Running hub hook tests without `DIDIO_HOOKS_DISABLE_FILTER=1`. The hub repo (`didio-second-brain-claude`) is not listed in `projects/registry.yaml` — `registry-match.sh` exits early and no Discord payload is sent. Tests may appear to pass trivially (no assertion error) while actually exercising the wrong path. Always export `DIDIO_HOOKS_DISABLE_FILTER=1` when running `patterns/hooks/*/test-*.sh` in this repo.

**Pattern to repeat:** For bash hook features, run the test suite twice and diff the output — idempotency is free to verify and catches any sandbox cleanup bug. Also verify `chmod +x` on both `hook.sh` and `test-hook.sh` programmatically (`ls -la`) — not just by running the script (a missing +x can be masked by calling via `bash` explicitly).

## F15 — 2026-04-26

**What worked:** For bash-pipeline features, the QA harness was: (1) run all three hermetic test scripts (`test-token-collector.sh` 8/8, `test-token-economy.sh` 6/6, `test-token-report.sh` 9/9); (2) independent programmatic privacy check (`grep "content"` exit 1 = PASS); (3) zero-dependency check (`grep "node|python|bun|deno"` exit 1 = PASS); (4) dry-run section verification against each required heading; (5) plist Hour/Minute check. The TechLead's I1 fix (cross-file aggregation) was already applied before QA ran — reading the review first surfaced this so QA didn't re-discover it.

**What to avoid:** E2e fixtures with only one file per tool name when the feature accumulates output across files. The `test-token-report.sh` fixture only had one JSONL file with MCP calls — the cross-file duplicate-row bug (I1) would have been caught earlier if the fixture had ≥2 files with calls to the same tool. For any orchestrator that `+= chunk` per file, the e2e fixture MUST have overlapping keys across ≥2 files.

**Pattern to repeat:** Cross-file accumulation gate: whenever an orchestrator loops over N files and accumulates TSV output, verify the e2e fixture exercises ≥2 files with at least one shared key (same tool name, same model, etc.). This is a one-line fixture addition that catches the entire class of "duplicate rows per file" bugs before code review. The check is: run the script with the multi-file fixture and grep for duplicate key values in the rendered output.

## F17 — 2026-04-26

**What worked:** Identifying that the privacy test (Case B in `test-feature-context.sh`) trivially passed without exercising the log-reading code path — the fixture was missing the `tasks/features/F91-*/` dir so the function exited early. Fix: (1) added feature dir to fixture, (2) added a benign `file_path` tool_use entry to the log, (3) changed assertion to two-part: output CONTAINS benign filename (log was read) AND does NOT contain sensitive data (no leak). 60 total cases, 0 failures after fix.

**What to avoid:** Accepting a privacy test that asserts only "output does not contain sensitive needle" — on empty output this is always true. The test must also prove the code under test was actually reached (positive assertion on expected output).

**Pattern to repeat:** Privacy test structure for log-reading functions: (1) fixture satisfies ALL pre-condition guards (feature dir exists, log exists), (2) log has `file_path` tool_use block alongside sensitive content, (3) assert BOTH benign filename present AND secret absent. The two-part assertion is the complete privacy proof for this class of function. OPERATIONAL smoke grouping: when hub and downstream smokes are both PARTIAL for the same reason (live Discord channel confirmation not mechanically checkable), group as a single "OPERATIONAL — Discord visual confirmation pending" row in the QA report — do not inflate the issue count.
