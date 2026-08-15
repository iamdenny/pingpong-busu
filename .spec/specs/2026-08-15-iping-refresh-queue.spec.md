---
summary: "아이핑 인증 수집을 사용자 검색과 분리해 내구성 있는 예약 큐에서 처리한다."
read_when:
  - 아이핑 수집 큐, 예약 worker 또는 인증 세션 계약을 변경할 때
title: "iPing durable refresh queue"
status: "complete"
date: "2026-08-15"
base_commit: "03f2336d671cc7134d1c774bd1917dabecf2028f"
target: "."
project: "cross-project"
context_hint: "pingpong-busu"
tier: "L"
test_approach: "tdd"
work_issue: "iamdenny/pingpong-busu#74"
related_issues:
  - "iamdenny/pingpong-busu#51"
  - "iamdenny/pingpong-busu#52"
---

# iPing durable refresh queue

## Overview

아이핑 로그인 화면은 HTTP `Set-Cookie` 세션과 숨은 `PHPSESSID` form token에 서로 다른 값을 사용한다. 기존 workspace adapter와 `refresh-player`는 둘을 한 값으로 합쳐 운영에서 인증 성공이 한 번도 없었다. 확인된 프로토콜 오류를 고치는 동시에, 아이핑 로그인과 세 화면 수집을 사용자 검색 응답에서 분리한다. 기존 `refresh_jobs`를 service-role 전용 내구성 큐로 활성화하고, 강한 shared token으로 인증된 `refresh-player` worker mode가 예약 실행에서 한 job씩 처리한다. 브라우저 검색은 저장 데이터를 먼저 보여주고 아이핑은 큐 등록 결과만 표시한다.

## Scope

### Must Have

- HTTP cookie와 숨은 form token을 별도 값으로 보존하는 iPing 로그인 계약
- 6시간 freshness/dedupe, 원자적 claim, stale lease 회수, attempt 상한, backoff, terminal failure를 갖는 private queue RPC
- publishable browser mode와 shared-secret worker mode를 명확히 분리한 `refresh-player`
- main 전용 GitHub Actions schedule과 secret/URL 운영 설정
- 저장 결과 우선 UI와 한국어 `수집 예약됨` 상태
- fixture/unit/SQL contract/runtime contract 테스트와 운영 문서

### Must NOT Have

- CAPTCHA, MFA, 사람 확인 또는 접근제어 우회
- 자격증명, 쿠키, raw HTML 또는 unrestricted query log 저장
- 이름 기반 자동 선수 병합
- 아이핑 외 모든 출처의 큐 전환
- worker secret의 `VITE_*`, 응답 또는 Actions 로그 노출

## TODOs

- [x] T1/BSM-1: `packages/source-adapters/src/iping/adapter.test.ts`에 서로 다른 header cookie/form token 회귀 테스트를 먼저 추가하고 실패를 확인한다.
- [x] T2/BSM-1: `packages/source-adapters/src/iping/adapter.ts`가 두 값을 분리해 로그인하도록 구현하고 adapter 테스트를 통과시킨다.
- [x] T3/BSM-2/BSM-3/BSM-4: 새 migration contract test에 dedupe, `FOR UPDATE SKIP LOCKED`, stale lease, bounded backoff, terminal error, service-role revoke/grant를 먼저 선언한다.
- [x] T4/BSM-2/BSM-3/BSM-4: `supabase/migrations/202608150009_iping_refresh_queue.sql`에 enqueue/claim/complete/fail/purge RPC와 인덱스·제약을 구현한다.
- [x] T5/BSM-2: worker token 검증과 browser/worker mode 분리 테스트를 먼저 추가한다.
- [x] T6/BSM-1/BSM-2/BSM-3: `supabase/functions/refresh-player/index.ts`에 `mode: "drain-iping"` worker branch를 추가하고 일반 iPing 요청은 외부 fetch 없이 enqueue하도록 전환한다.
- [x] T7/BSM-4: `.github/workflows/crawl-scheduled.yml`과 배포 workflow에 main schedule, concurrency, secret sync, curl 실패 처리를 추가하고 runtime contract test로 고정한다.
- [x] T8/BSM-1/BSM-4: `apps/web` 응답 schema와 `SourceRefreshProgress` 테스트에 queued 상태를 먼저 추가한다.
- [x] T9/BSM-1/BSM-4: 웹에서 저장 결과를 유지하고 아이핑 queued 상태를 `수집 예약됨`으로 표시하며 수동 재시도를 숨긴다.
- [x] T10: `README.md`, `docs/architecture.md`, `docs/crawling-policy.md`, `docs/operations.md`, `docs/data-model.md`를 캐시/큐/secret rotation/kill switch/복구 계약과 일치시킨다.
- [x] T11: `pnpm release:bump`로 배포 버전을 올리고 generated Edge bundle을 동기화한다.
- [x] T12: Node 24에서 lint/typecheck/test/build/docs gate, changed-file diff, secret scan과 runtime smoke evidence를 완료한다.

## Acceptance Criteria

- [x] 다른 header cookie/form token fixture에서 각 전송 위치가 정확하고 adapter test가 통과한다.
- [x] 브라우저 iPing refresh는 외부 iPing fetch 없이 deduplicated job과 queued 응답을 만든다.
- [x] 누락·오류 worker token은 거부되고 job 상태를 바꾸지 않는다.
- [x] 동시 worker는 같은 job을 중복 claim하지 않고 stale running lease만 제한적으로 회수한다.
- [x] 성공 worker는 기존 upsert RPC로 정규화 기록을 저장하고 job을 succeeded로 끝낸다.
- [x] challenge/auth/schema 오류는 terminal이며 transient timeout/5xx만 attempt 상한까지 backoff한다.
- [x] iPing 외 동기 출처 동작과 저장된 기존 결과가 유지된다.
- [x] UI에 `수집 예약됨`이 표시되고 해당 상태에는 수동 retry control이 없다.
- [x] 예약 workflow는 main의 repo secret만 사용하고 token/query를 로그에 출력하지 않는다.
- [x] 필수 repository gate가 Node 24에서 통과한다.

## Verification

### Pre-check

- [x] Node 24 `pnpm lint` passes.
- [x] Node 24 `pnpm typecheck` passes.
- [x] Node 24 `pnpm test` passes (63 files, 349 tests).
- [x] Node 24 `pnpm build` passes.
- [x] `pnpm docs-check:scan` passes.

### Post-check

- [x] `pnpm lint` passes.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes (75 files, 417 tests).
- [x] `pnpm build` passes.
- [x] `pnpm docs-check:scan` passes.
- [x] `pnpm release:check` passes (`2026.33.65`).
- [x] `pnpm test:e2e` passes (8 tests, desktop/mobile).
- [x] Supabase PostgreSQL 17.6 full migration + queue SQL scenario passes.

## Scope Boundary

- 예약 worker는 기존 `refresh-player`의 강하게 인증된 mode로 구현해 새 Edge function과 iPing fetch 중복을 만들지 않는다.
- queue payload는 worker가 필요한 이름만 저장하고 terminal job 메타데이터는 7일 안에 정리한다.
- 공식 API 또는 데이터 제공 협약은 장기 최선책이지만 이번 저장소 변경 범위 밖이다.

## Plan Validation

- team_validation_mode: subagent
- validation_perspectives: product, architecture, security, QA, skeptic
- validation_result: clean (기존 Edge function worker mode 재사용으로 설계 수렴)

## Unknowns

| ID  | Unknown                                                  | Why it matters                              | How to resolve                                                                       | Owner |
| --- | -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | ----- |
| U-1 | repository-level worker URL/token이 아직 설정되어 있는가 | schedule과 Edge가 같은 secret을 가져야 한다 | `SUPABASE_PROJECT_ID` variable과 64자리 `REFRESH_WORKER_TOKEN` secret provision 완료 | agent |

## Stop Conditions

| ID  | Stop condition                                                                | Required action                                           |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| S-1 | worker token을 브라우저 번들이나 공개 로그 없이 양쪽 runtime에 전달할 수 없음 | 배포를 중단하고 secret boundary를 다시 설계               |
| S-2 | queue claim이 동시 실행에서 단일 소비를 보장하지 못함                         | PR 전에 SQL 계약과 integration evidence 보강              |
| S-3 | 사람 확인 화면을 우회해야만 수집이 가능함                                     | 아이핑 worker를 비활성화하고 공식 데이터 협약 경로로 전환 |

## Behavior Sequence Matrix

| ID    | Path                  | Sequence (events in order)                                                           | Expected final state                       | Required Evidence | Evidence Ref / Downgrade |
| ----- | --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------- | ------------------------ |
| BSM-1 | happy                 | cache read → enqueue → worker claim → cookie/token login → fetch → upsert → complete | 저장 결과 갱신, job succeeded              | caller-level      | T1, T2, T6, T8, T9       |
| BSM-2 | deterministic failure | enqueue → claim → challenge/auth/schema failure → fail terminal                      | 기존 캐시 유지, job failed, 자동 반복 없음 | integration       | T3, T4, T5, T6           |
| BSM-3 | transient recovery    | timeout/5xx → pending backoff → later claim → success → complete                     | attempt/error 정리, job succeeded          | integration       | T3, T4, T6               |
| BSM-4 | re-entry/idempotency  | repeated search → same bucket conflict → one pending job → overlapping workers       | 중복 login/claim 없음                      | caller-level      | T3, T4, T7, T8, T9       |

## Execution Strategy

| Group                     | Tasks   | Model  | Parallel                    |
| ------------------------- | ------- | ------ | --------------------------- |
| adapter protocol          | T1-T2   | sonnet | yes                         |
| queue database            | T3-T4   | sonnet | yes                         |
| Edge integration          | T5-T7   | sonnet | no                          |
| web UX                    | T8-T9   | sonnet | yes after response contract |
| docs/release/verification | T10-T12 | sonnet | no                          |

Rationale: adapter와 migration은 파일이 분리돼 병렬 TDD가 가능하다. Edge response contract가 정해진 뒤 web 작업을 진행하고, 문서·릴리즈·전체 게이트는 통합 후보에서 수행한다.

## Edge Cases & Failure Modes

- worker crash 뒤 `running` job은 고정 lease 이후에만 reclaim한다.
- terminal job은 같은 freshness bucket에서 자동 재개하지 않으며 다음 bucket 또는 운영자 조치까지 기존 캐시를 유지한다.
- DB/env kill switch 중 하나라도 꺼져 있으면 enqueue와 drain 모두 안전하게 skip한다.
- worker token이 설정되지 않은 환경은 fail closed한다.
- schedule 중복 실행은 GitHub concurrency와 DB atomic claim 양쪽에서 막는다.
- worker가 upsert 성공 후 complete 기록에 실패해 재진입해도 natural/content hash upsert는 멱등이어야 한다.

## Change Preview

Before: 사용자 검색 → 아이핑 로그인/조회 완료 대기 → 성공 또는 오류

After: 사용자 검색 → 저장 캐시 즉시 표시 + job 예약 → schedule worker가 독립 수집 → 다음 조회에 갱신 결과

Changes: 로그인 프로토콜을 바로잡고, 외부 인증 장애의 지연·실패를 사용자 요청 경로에서 격리한다.

## History

| Phase      | Date       | Agent             | Result                                                                                                                                                        |
| ---------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan+Spec  | 2026-08-15 | codex + architect | tier L: shared DB/Edge/UI/workflow interface and sequence risk; pre-validation clean; issue #74 created; FSD evidence producer unavailable in this repository |
| Run+Verify | 2026-08-15 | codex + reviewers | adapter/queue/worker/UI/docs 구현; architecture·security·quality findings 보완; 417 unit/integration tests, 8 E2E, full PostgreSQL migration scenario 통과    |
