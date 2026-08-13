---
summary: '출처 관측 소속과 예선 순위를 canonical 소속·입상 집계에서 분리한다.'
read_when:
  - 출처 관측값과 검토된 canonical metadata의 경계를 변경할 때
title: '출처 소속 오염과 예선 입상 오분류 방지'
status: 'done'
date: '2026-08-13'
base_commit: '9f9fbd5eb32fe9f9cd5c8fd9d238fa2c7720a4e6'
target: '.'
project: 'packages/domain, packages/source-adapters, supabase, docs, tests'
context_hint: 'mono'
tier: 'L'
test_approach: 'tdd'
work_issue: 'iamdenny/pingpong-busu#14'
---

# 출처 소속 오염과 예선 입상 오분류 방지

## Overview

Airping 공개 원문에 적힌 `82개판5분전`은 parser 오류가 아니라 출처의 소속 관측값이다. 현재 수집 RPC가 이 관측값을 검토된 `clubs`와 `players.primary_club_id`로 자동 승격해 검색 카드에 공식 소속처럼 노출하고, 공통 입상 판정기는 `예선 12조 3위`의 `3위`를 문맥 없이 입상으로 집계한다. 원문 증거는 그대로 보존하면서 canonical metadata 경계를 복구하고 예선·조별 순위를 참가 이력으로 분류한다.

## Scope

### Must Have

- 출처의 `clubText`는 `source_player_identities.source_club_text`와 `results.club_text`에 원문 그대로 저장한다.
- 수집 RPC는 출처 소속으로 `clubs`를 생성하거나 `players.primary_club_id`를 설정하지 않는다.
- 기존 `82개판5분전` canonical 연결만 안전하게 해제하고 원문 결과·identity는 보존한다.
- TypeScript와 PostgreSQL 입상 판정은 예선·조별 순위를 제외하며 서로 같은 규칙을 사용한다.
- 재수집과 migration 재적용 관점의 idempotency를 회귀 테스트로 고정한다.

### Must NOT Have

- 출처 원문 소속을 금칙어·비속어 목록으로 삭제하거나 변형하지 않는다.
- 이름 또는 출처 소속만으로 선수를 자동 병합하지 않는다.
- 관리자 검토 UI나 범용 canonical 소속 승인 workflow를 새로 만들지 않는다.
- 다른 출처 parser의 소속 추출 계약을 변경하지 않는다.

## TODOs

- [x] `packages/domain/src/domain.test.ts`에 예선·조별 순위와 최종 순위의 TDD 회귀 사례를 추가한다. (BSM-1)
- [x] `packages/domain/src/observations.ts`에서 예선·조별 순위를 입상에서 제외한다.
- [x] `packages/source-adapters/src/airping/parser.test.ts`와 privacy-safe synthetic fixture로 이상해 보이는 소속 원문이 손실 없이 보존됨을 검증한다.
- [x] `tests/source-observation-boundary-migration.test.ts`에 canonical 소속 미승격, 원문 보존, 정밀 cleanup, SQL 입상 판정의 계약 테스트를 먼저 추가한다. (BSM-2, BSM-3, BSM-4)
- [x] `supabase/migrations/202608130006_source_observation_boundary.sql`에서 수집 RPC와 DB 입상 판정기를 교체하고 알려진 canonical 오염을 정리한다.
- [x] `docs/data-model.md`에 관측 소속과 검토된 대표 소속의 저장 경계를 명시한다.
- [x] `docs/product-spec.md`에 예선·조별 순위 제외와 출처 소속 미승격 수용 규칙을 반영한다.
- [x] 필수 게이트를 실행하고 회귀 증거를 기록한다.

## Acceptance Criteria

- [x] `clubText='82개판5분전'` 레코드를 신규 수집해도 `clubs` 행과 `players.primary_club_id`가 생성되지 않는다.
- [x] 정상적으로 보이는 다른 출처 소속도 자동으로 canonical 소속에 승격되지 않는다.
- [x] 출처 소속 원문은 source identity와 result evidence에 그대로 남는다.
- [x] 동일 레코드 재수집은 canonical 소속을 변경하지 않고 unchanged 경로로 처리된다.
- [x] TypeScript와 PostgreSQL 모두 `예선 12조 3위`와 `조별 1위`는 false, `본선 4강`, `준우승`, `공동 3위`는 true를 반환한다.
- [x] 알려진 `82개판5분전` canonical 연결은 해제되지만 관련 source identity, result, revision은 삭제되지 않는다.
- [x] 해당 후보는 예선 순위만으로 입상 탭과 입상 횟수에 포함되지 않는다.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm docs-check:scan`이 통과한다.

## Verification

### Pre-check

- [x] `pnpm vitest run packages/domain/src/domain.test.ts packages/source-adapters/src/airping/parser.test.ts tests/division-observation-migration.test.ts` passes (25 tests).

### Post-check

- [x] `pnpm lint` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (36 files, 136 tests)
- [x] `pnpm build` passes
- [x] `pnpm docs-check:scan` passes (19 Markdown files)

## History

| Phase | Date | Agent | Result |
| ----- | ---- | ----- | ------ |
| Plan+Spec | 2026-08-13 | codex | tier L: DB trust boundary, shared domain classifier, parser evidence, migration cleanup, and docs span five areas; pre-validation clean (AGENTS unchanged, dependency diff empty, conflicting PRs 0) |
| Run | 2026-08-13 | codex | TDD regression and migration contract implemented; all mandatory gates passed; local SQL transaction unavailable because no Supabase container was running |

## Scope Boundary

- Canonical 소속을 검토·승인하는 새 관리 기능은 후속 범위다.
- 이번 변경은 알려진 오염값의 canonical 연결만 정리하며 raw evidence는 삭제하지 않는다.
- Supabase 원격 환경 적용은 main 배포 workflow의 책임이며 이 PR에서는 migration과 정적·로컬 테스트를 검증한다.

## Plan Validation

- team_validation_mode: subagent
- validation_perspectives: architecture, data integrity, security, QA
- validation_result: clean

## Unknowns

| ID | Unknown | Why it matters | How to resolve | Owner |
| -- | ------- | -------------- | -------------- | ----- |
| U-1 | 없음 | 현재 schema와 호출 경로에서 요구사항을 구현할 수 있음 | 구현 중 scope expansion이 발견되면 Stop Condition 적용 | agent |

## Stop Conditions

| ID | Stop condition | Required action |
| -- | -------------- | --------------- |
| S-1 | raw source identity/result를 삭제해야만 정리가 가능한 경우 | 삭제하지 않고 migration 설계를 재검토한다. |
| S-2 | 기존 검토된 정상 canonical 소속을 일괄 해제해야 하는 경우 | 범위를 확대하지 말고 사용자 확인을 요청한다. |
| S-3 | TypeScript와 SQL 판정 규칙의 동등성을 테스트로 고정할 수 없는 경우 | PR을 만들기 전에 공통 계약 테스트를 보강한다. |

## Behavior Sequence Matrix

| ID | Path | Sequence (events in order) | Expected final state | Required Evidence | Evidence Ref / Downgrade |
| -- | ---- | -------------------------- | -------------------- | ----------------- | ------------------------ |
| BSM-1 | rank classification | raw rank observed -> normalize -> classify | preliminary/group-stage rank is participation; final placement remains award | unit | domain test |
| BSM-2 | new ingestion | parse clubText -> upsert identity/player/result -> query search | raw club evidence persists; canonical club remains null | unit | migration contract test |
| BSM-3 | cleanup recovery | existing contaminated link -> migration cleanup -> source result query | only canonical link/orphan club removed; evidence rows remain | unit | migration contract test |
| BSM-4 | re-entry/idempotency | first upsert -> unchanged/progress update -> same record upsert | no club insertion or canonical mutation on either pass | unit | migration contract test |

## Execution Strategy

| Group | Tasks | Model | Parallel |
| ----- | ----- | ----- | -------- |
| Domain/parser evidence | domain classifier tests+implementation, Airping synthetic fixture | sonnet | yes |
| Database boundary | migration contract tests, RPC replacement, precise cleanup | opus | yes |
| Integration/docs | cross-diff review, docs, full gates | opus | no |

Rationale: domain/parser files and DB migration/tests are file-disjoint and can proceed in parallel; docs and final verification depend on the settled contracts.

## Edge Cases & Failure Modes

- `준우승`에는 `우승` 문자열이 포함되므로 계속 입상으로 분류한다.
- `공동 3위`와 공백 변형은 정규화 후 입상으로 분류한다.
- `예선 12조 3위`, `조별 1위`처럼 숫자 순위가 있어도 예선 문맥이면 참가다.
- `본선 4강`과 `4강전 진출`은 기존 제품 규칙대로 입상이다.
- 출처 소속이 비어 있거나 정상적인 문자열이어도 canonical 자동 승격은 일어나지 않는다.
- cleanup은 정규화된 알려진 값에만 제한하고 참조가 남은 club은 삭제하지 않는다.

## Change Preview

Before: 출처의 소속 문자열이 즉시 canonical club이 되고, 예선 조 순위가 입상 횟수에 포함된다.
After: 출처 소속은 증거로만 보존되고 검토된 대표 소속과 분리되며, 예선·조별 순위는 참가 이력으로 집계된다.
Changes: 수집 신뢰 경계와 입상 문맥 판정을 DB·도메인 양쪽에서 일치시킨다.
