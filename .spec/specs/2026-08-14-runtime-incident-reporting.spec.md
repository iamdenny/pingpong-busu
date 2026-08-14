---
title: Privacy-safe runtime and source incident reporting
tier: L
status: complete
target: cross-project
project:
  - apps/web
  - supabase
context_hint: pingpong-busu
test_approach: tdd
base_commit: 2917d260c373ded460b62d43e022b9ce4c1ef592
work_issue: iamdenny/pingpong-busu#46
---

## Objective

Collect sanitized browser and source incidents, aggregate them by stable fingerprint, and idempotently publish only high-signal incidents to GitHub without blocking user flows.

## Scope

### Must Have

- Best-effort source incident recording that preserves the original refresh response.
- Private aggregate/outbox schema with service-role-only RPCs and fingerprint deduplication.
- Server-only GitHub publisher with exact marker reconciliation.
- Browser Error Boundary plus allow-listed runtime ingestion.
- Tests and Korean operations/product documentation.

### Must NOT Have

- Raw query terms, player names, URL query/hash, HTML/body content, cookies, credentials, or raw stack traces.
- Session replay, device fingerprinting, or third-party analytics.
- Automatic publication of timeout, rate-limit, offline, cancellation, or generic request failures.
- Automatic incident closure.

## Current Architecture

- `refresh-player` maps adapter failures to safe codes and updates only `sources.last_error_code`.
- `submit-feedback` demonstrates server-only GitHub token use and ambiguous-delivery reconciliation, but its user-submission identity model is not suitable for operational incidents.
- The React root has neither an Error Boundary nor global runtime event handlers.

## TODOs

- [x] T1 Write migration contract tests for private aggregate/outbox tables, allow-listed RPC inputs, atomic fingerprint upsert, publication threshold, and service-role grants.
- [x] T2 Implement `supabase/migrations/202608140009_operational_incidents.sql` with aggregate, delivery lease/reconciliation state, retention helper, and service-role-only RPCs.
- [x] T3 Write incident handler tests covering validation, sensitive/unknown-field rejection, eligible/ineligible source codes, dedupe, delivery, reconciliation, and non-blocking delivery failure (BSM-1..4).
- [x] T4 Implement shared `supabase/functions/_shared/operational-incidents.ts` publisher and `report-runtime-incident` Edge function handler/index.
- [x] T5 Write refresh contract tests proving failure-record RPC rejection cannot replace the original safe source response.
- [x] T6 Integrate high-signal source incidents into `refresh-player` as best-effort reporting and preserve existing public status behavior.
- [x] T7 Write web tests for sanitized payload construction, global listener cleanup/idempotency, and Error Boundary fallback/report failure behavior (BSM-3..4).
- [x] T8 Implement the web incident repository, runtime listeners, Korean Error Boundary, styles, and root/router integration.
- [x] T9 Update Supabase config/deployment plus README, architecture, data model, operations, commands, testing, codemap, product spec, and roadmap as affected.
- [x] T10 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm docs-check:scan`; capture browser runtime evidence for the fallback UI.

## Acceptance Criteria

- [x] Source failure-state/reporting RPC failure does not change the original per-source failure response.
- [x] Identical sanitized fingerprints atomically aggregate into one incident.
- [x] Only `source_schema_changed`, `source_auth_failed`, and allow-listed browser runtime categories can reserve publication.
- [x] Exact fingerprint markers reconcile ambiguous GitHub delivery without duplicate issues.
- [x] Browser ingestion rejects unknown fields, cross-origin requests, oversized values, sensitive patterns, raw URLs, and raw stacks.
- [x] GitHub issue content contains only allow-listed operational metadata.
- [x] React render failure presents a usable Korean fallback regardless of telemetry success.
- [x] Transient/cancelled/offline/rate-limit errors are not automatically published.
- [x] Required repository gates pass.

## Design Source Inventory

- Authoritative source: `apps/web/DESIGN.md` (read and applied).
- Assertions: the fallback remains a single centered action surface, uses the existing Korean typography/color tokens, exposes `role="alert"`, and keeps the recovery button keyboard-accessible.
- Browser evidence: an injected route render failure displayed the Korean recovery heading and button; after removing the injection, the normal home screen and version `2026.33.49` rendered again.

## Scope Boundary

- The existing anonymous user feedback workflow remains behaviorally separate.
- GitHub publishing continues to use the existing server-only fine-grained token.

## Plan Validation

- team_validation_mode: subagent
- validation_perspectives: product, architecture, security, QA, skeptic
- validation_result: clean

## Unknowns

| ID  | Unknown                          | Why it matters              | How to resolve                               | Owner |
| --- | -------------------------------- | --------------------------- | -------------------------------------------- | ----- |
| U-1 | Production source failure volume | Determines useful threshold | Start deterministic at 3 and document tuning | agent |

## Stop Conditions

| ID  | Stop condition                                        | Required action                                            |
| --- | ----------------------------------------------------- | ---------------------------------------------------------- |
| S-1 | Existing production GitHub token cannot create issues | Keep code/config ready; do not expose or replace the token |

## Behavior Sequence Matrix

| ID    | Path     | Sequence (events in order)                                              | Expected final state                                    | Required Evidence | Evidence Ref / Downgrade |
| ----- | -------- | ----------------------------------------------------------------------- | ------------------------------------------------------- | ----------------- | ------------------------ |
| BSM-1 | happy    | validate -> aggregate -> threshold -> claim -> create -> finalize       | one published incident with issue number                | integration       | T3                       |
| BSM-2 | failure  | validate -> aggregate -> GitHub reject -> mark retryable                | original caller succeeds and delivery remains retryable | integration       | T3, T5                   |
| BSM-3 | recovery | ambiguous delivery -> re-enter -> search exact marker -> finalize       | existing issue reused                                   | integration       | T3                       |
| BSM-4 | re-entry | repeated browser/source event -> aggregate -> observe existing delivery | count increases without duplicate issue                 | caller-level      | T3, T7                   |

## Edge Cases & Failure Modes

- GitHub response lost after issue creation.
- Concurrent events cross the threshold simultaneously.
- Incident RPC/network failure during source refresh.
- Browser handler invoked twice by StrictMode or module reuse.
- Error payload contains contact details, secret-like tokens, or URL search parameters.

## Execution Strategy

| Group      | Tasks  | Model     | Parallel                   |
| ---------- | ------ | --------- | -------------------------- |
| backend    | T1-T6  | inherited | no                         |
| web        | T7-T8  | inherited | yes after handler contract |
| docs-gates | T9-T10 | inherited | no                         |

Rationale: establish the storage and handler contract first, then integrate independent backend and web callers before final documentation and gates.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm docs-check:scan`

## History

- 2026-08-14: Plan created at L tier because the work crosses React, Edge Functions, PostgreSQL migrations, GitHub delivery, privacy boundaries, and ordered delivery/reconciliation behavior. Pre-validation found no open duplicate issue; isolated worktree created from `origin/main`.
- 2026-08-14: Security and architecture review added exact route templates, bounded body parsing, atomic ingestion/publication budgets, daily retention, hardened `search_path`, background source delivery, idempotent browser listeners, and strict finalization handling.
- 2026-08-14: Browser verification exposed React Router's internal error boundary; added a route-level recovery element using the same sanitized reporter and confirmed recovery/normal rendering in the in-app browser.
- 2026-08-14: Lint, typecheck, build, documentation scan, release check, and 303 tests passed (tests use a single worker locally to avoid unrelated UI timeout contention).
