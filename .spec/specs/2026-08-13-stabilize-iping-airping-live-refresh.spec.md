---
summary: 'Stabilize iPing and Airping live refresh throttling, retries, and diagnostics'
read_when:
  - You are implementing or reviewing issue #11
title: 'Stabilize iPing and Airping live source refresh'
status: 'complete'
date: '2026-08-13'
base_commit: '458939c98ef2f2546d41b21b822b8f90bc5d78d6'
target: 'cross-project'
project: 'supabase, apps/web, .github/workflows'
context_hint: 'pingpong-busu'
tier: 'L'
test_approach: 'tdd'
work_issue: 'iamdenny/pingpong-busu#11'
---

# Stabilize iPing and Airping live source refresh

## Overview

iPing currently applies a source-wide 60-second throttle that hides the real result of most refresh attempts. Airping performs two sequential 16-second Edge requests even though direct origin requests and the current parser succeed. Replace these behaviors with query-scoped claims, bounded transient retries, and persisted safe error diagnostics while retaining cached-result-first UI behavior.

## Scope

### Must Have

- Query-scoped iPing throttling with a short configurable floor.
- One bounded Airping Edge attempt with deterministic retry metadata.
- Web retries for explicit Airping `source_timeout` only, capped and delayed by at least five seconds.
- Safe source error state persisted on failure and cleared on success.
- Safe manual crawl inputs and redacted player queries without production Secret access.
- Focused tests and updated operational/product docs.

### Must NOT Have

- No unbounded retries or timeout increases beyond the interactive request budget.
- No browser, log, or database exposure of credentials, cookies, raw HTML, or sensitive player data.
- No new crawler service, queue service, or microservice.

## TODOs

- [x] [RED] Add migration contract tests for BSM-1/BSM-4 query-scoped source claims and safe failure persistence.
- [x] [GREEN] Add a migration that removes the iPing global lock and exposes safe source failure/success state transitions.
- [x] [RED] Add refresh retry policy tests for BSM-2/BSM-3 timeout cooldown, exhaustion, and deterministic failures.
- [x] [GREEN] Extend the web retry policy to retry explicit Airping `source_timeout` at most twice with a five-second minimum delay.
- [x] [RED] Add Edge source policy tests or static contract assertions for the Airping single-attempt timeout and retry metadata.
- [x] [GREEN] Update `refresh-player` to perform one bounded Airping attempt, emit retry metadata, and persist sanitized failure state.
- [x] Keep `.github/workflows/crawl-manual.yml` outside the unprotected `production` environment, quote dispatch inputs, and redact player queries.
- [x] Update README and source-refresh architecture/product documentation.
- [x] Run the full repository verification gates and record evidence for BSM-1 through BSM-4.

## Acceptance Criteria

- [x] Different normalized iPing names are not serialized behind one source-wide 60-second lock.
- [x] Repeating the same normalized iPing name inside cooldown returns bounded `retryAfterMs`.
- [x] Airping timeout returns `source_timeout` and retry metadata after one bounded source attempt.
- [x] The web retries explicit Airping `source_timeout` no more than twice and waits at least five seconds.
- [x] Authentication, schema, blocked, and other deterministic failures do not auto-retry.
- [x] Only safe error fields persist; credentials, cookies, raw HTML, and PII do not.
- [x] Successful refresh clears persisted source failure state.
- [x] The manual crawl cannot access unprotected production environment secrets, interpolate dispatch strings into shell, or log player queries.
- [x] Repository lint, typecheck, tests, docs scan, and build pass.

## Verification

### Pre-check

- [x] `pnpm test` passes (35 files, 128 tests at base commit)

### Post-check

- [x] `pnpm lint` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (36 files, 148 tests)
- [x] `pnpm docs-check:scan --pretty` passes (19 Markdown files)
- [x] `pnpm build` passes

| Scenario | Expected | How to verify |
| -------- | -------- | ------------- |
| Different iPing names | No source-wide serialization | `tests/live-source-runtime-contract.test.ts` migration contract |
| Repeated same iPing name | Bounded query cooldown and minute cap | migration contract plus `tests/source-retry-migration.test.ts` |
| Airping timeout | One 5-second Edge attempt, safe retry metadata | Edge static contract and web retry unit tests |
| Deterministic source failure | No automatic retry | `sourceRefreshRetry.test.ts` table test |
| Timeout exhaustion | Preserved Korean timeout state and manual cooldown | `SearchResultsPage.test.tsx` failure view contract |

## Scope Boundary

- Direct source policies remain within the existing Supabase Edge function and repository stack.
- Database RPCs are authoritative for throttling and diagnostics; browser timers are UX only.

## Plan Validation

- team_validation_mode: native
- validation_perspectives: product, architecture, security, QA, skeptic
- validation_result: clean

## Unknowns

| ID | Unknown | Why it matters | How to resolve | Owner |
| -- | ------- | -------------- | -------------- | ----- |
| U-1 | Exact production Airping latency distribution | Determines whether a single attempt should be 8s or 10s | Use observed 2.38s direct response and keep retry at request boundary | agent |

## Stop Conditions

| ID | Stop condition | Required action |
| -- | -------------- | --------------- |
| S-1 | A required fix would expose credentials or raw source responses | Stop and redesign around sanitized error codes |
| S-2 | A new external service becomes necessary | Stop and request explicit scope expansion |

## Behavior Sequence Matrix

| ID | Path | Sequence (events in order) | Expected final state | Required Evidence | Evidence Ref / Downgrade |
| -- | ---- | -------------------------- | -------------------- | ----------------- | ------------------------ |
| BSM-1 | happy | claim query -> source succeeds -> records persist | error state cleared and UI data invalidated | integration | migration and source contract tests |
| BSM-2 | failure | claim Airping query -> source timeout | safe error persisted and retry delay returned | integration | Edge contract test |
| BSM-3 | recovery/reset | Airping timeout -> countdown/progress -> retry succeeds | retry budget resets through success and stale error clears | caller-level | `sourceRefreshRetry.test.ts` caller policy sequence |
| BSM-4 | re-entry/idempotency | same query repeats during cooldown -> no source call -> retry after cooldown | bounded remaining delay then accepted claim | integration | migration contract test |

## Execution Strategy

| Group | Tasks | Model | Parallel |
| ----- | ----- | ----- | -------- |
| runtime | TODO 1-6 | sonnet | no |
| operations | TODO 7 | sonnet | yes after runtime contract |
| docs | TODO 8 | sonnet | yes after runtime contract |
| verification | TODO 9 | opus | no |

Rationale: runtime contract changes must land before workflow/docs descriptions; final behavior requires sequence verification across database, Edge, and web retry layers.

## Edge Cases & Failure Modes

- Duplicate UI requests for the same query must not bypass the database claim.
- Deterministic iPing authentication and schema failures must remain non-retryable.
- A timeout must never persist exception text that can contain response or environment details.
- A successful refresh must clear a previous failure even when no new records are found.

## Change Preview

Before: iPing globally blocks all names for 60 seconds; Airping can occupy one Edge request for more than 32 seconds; failures are not reflected in source status.

After: query-scoped claims and bounded transient retries return fast, explicit states, while sanitized source diagnostics record failure and recovery.

Changes: align throttling, retries, diagnostics, and workflow secret scope with observed production behavior.

## History

| Phase | Date | Agent | Result |
| ----- | ---- | ----- | ------ |
| Plan+Spec | 2026-08-13 | Codex | tier L: sequence-dependent database/Edge/UI contract across 3 directories; pre-validation clean; no overlapping PR |
| Run | 2026-08-13 | Codex + coder agents | TDD implementation across migration, Edge runtime, web retry caller, and manual workflow |
| Docs | 2026-08-13 | doc-writer | README, architecture, policy, operations, product spec, source notes, and adapter docs synchronized |
