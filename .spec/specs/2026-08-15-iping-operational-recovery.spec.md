---
summary: "배포 뒤에도 남는 아이핑 보호 회로를 인증된 운영 작업으로 원자적으로 복구한다."
read_when:
  - 아이핑 인증 정보를 교체하거나 보호 회로에서 운영 복구할 때
title: "iPing operational recovery"
status: "in-progress"
date: "2026-08-15"
base_commit: "1ddb25e5e0904f11b15d61152f55085e44ea27d5"
target: "."
project: "cross-project"
context_hint: "pingpong-busu"
tier: "L"
test_approach: "tdd"
---

# iPing operational recovery

## Overview

아이핑의 결정적 인증 실패는 의도대로 작업을 실패시키고 출처 보호 회로를 6시간 연다. 그러나 올바른 자격증명으로 서버를 다시 배포해도 DB 회로와 실패 작업은 그대로이므로 예약 worker가 성공으로 끝나면서도 아무 작업을 수행하지 않는다. 강한 worker token으로만 호출 가능한 명시적 복구 모드를 추가해, 최근 결정적 실패 작업 하나를 원자적으로 재예약하고 즉시 기존 worker 경로로 검증한다. 잘못된 자격증명이면 기존 kill switch가 다시 열려 반복 호출을 제한한다.

## Scope

### Must Have

- service-role 전용, advisory-lock 기반 복구 RPC
- 최근 24시간 결정적 실패 작업 하나만 재예약하는 제한
- 기존 worker token을 재사용하는 정확한 `recover-iping` 모드
- schedule은 기존 drain만 유지하고 수동 dispatch에서만 복구 모드 선택
- 실제 재시도 결과를 GitHub workflow 성공/실패로 확인
- SQL/runtime/workflow 계약 테스트와 운영 문서

### Must NOT Have

- 브라우저 또는 publishable key로 보호 회로 해제
- 정상 schedule 또는 일반 배포 때 자동 보호 회로 해제
- 자격증명, cookie, raw HTML, 검색어를 응답이나 workflow 로그에 노출
- 24시간보다 오래된 작업 또는 transient 실패의 임의 재실행
- 동시에 둘 이상의 active iPing 작업 생성

## TODOs

- [x] T1/BSM-1/BSM-2/BSM-3: migration contract와 PostgreSQL 시나리오에 원자적·멱등 복구 기대를 먼저 추가하고 실패를 확인한다.
- [x] T2/BSM-1/BSM-2/BSM-3: `recover_iping_refresh_job()` service-role RPC를 새 migration에 구현한다.
- [x] T3/BSM-1/BSM-4: Edge runtime contract에 worker-only `recover-iping` mode와 복구 후 단일 drain 기대를 먼저 추가하고 실패를 확인한다.
- [x] T4/BSM-1/BSM-4: `refresh-player`에 제한된 복구 분기와 안전한 counter 응답을 구현한다.
- [x] T5/BSM-1/BSM-4: workflow 테스트와 `workflow_dispatch` mode 입력을 추가하되 schedule 기본은 `drain-iping`으로 유지한다.
- [x] T6: `docs/operations.md`, `docs/architecture.md`, `docs/crawling-policy.md`에 자격증명 교체 후 복구 절차와 재실패 동작을 기록한다.
- [x] T7: 제품 버전을 올리고 Edge shared 입력에 변경이 없음을 확인한 뒤 전체 게이트, SQL 통합 시나리오, 보안·품질 검토를 완료한다.

## Acceptance Criteria

- [x] 기존 회로가 열리고 최근 deterministic failed job이 있으면 복구 RPC는 그 한 건만 pending으로 바꾼다.
- [x] 복구는 attempt/lease/completion/error를 초기화하고 회로·결정적 실패 카운터를 함께 초기화한다.
- [x] running job이면 무변경 `busy`, pending job이면 회로만 초기화한 `already_pending`, 최근 대상 실패가 없으면 회로만 초기화한 `reset_only`를 반환한다.
- [x] publishable browser 요청은 `recover-iping`을 실행할 수 없다.
- [x] manual workflow의 recover 호출은 복구 후 한 작업만 claim하고, schedule 호출은 기존 drain만 수행한다.
- [x] 재시도가 다시 인증 실패하면 작업은 failed가 되고 보호 회로가 다시 6시간 열린다.
- [x] 응답과 Actions 로그에 검색어·자격증명·cookie·raw 오류가 포함되지 않는다.

## Verification

### Pre-check

- [x] focused Vitest baseline: 3 files, 26 tests passed.
- [x] workspace package TypeScript checks passed on Node 24.

### Post-check

- [x] ESLint passes with zero warnings.
- [x] all four workspace package TypeScript checks pass on Node 24.
- [x] Vitest passes with constrained workers: 76 files, 425 tests.
- [x] package type checks and Vite production build pass.
- [x] docs scan passes: 21 Markdown files.
- [x] release check passes: `2026.33.69`.
- [x] Supabase PostgreSQL 17.6 full migration + `tests/sql/iping-refresh-queue.sql` passes.
- [x] Supabase PostgreSQL 17.6 two-session `claim_iping_refresh_job`/recovery contention test passes with `dblink`.

## Behavior Sequence Matrix

| ID    | Path                  | Sequence (events in order)                                                                | Expected final state                                      | Required Evidence | Evidence Ref |
| ----- | --------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------- | ------------ |
| BSM-1 | credential recovery   | auth failure → circuit open → credential deploy → recover RPC → requeue → claim → success | job succeeded, circuit closed, fresh records persisted    | integration       | T1-T5        |
| BSM-2 | repeated auth failure | circuit open → recover → claim → auth failure → terminal resolve                          | job failed, circuit reopened for six hours                | integration       | T1-T2        |
| BSM-3 | re-entry/idempotency  | two recover calls or active work → advisory lock → one eligible active job                | running은 무변경, pending은 재사용, 중복 source call 없음 | integration       | T1-T2        |
| BSM-4 | authorization         | browser mode/recover attempt → reject; worker recover → RPC → single drain                | only worker token can change recovery state               | caller-level      | T3-T5        |

## Execution Strategy

| Group               | Tasks | Parallel |
| ------------------- | ----- | -------- |
| database recovery   | T1-T2 | no       |
| Edge/workflow       | T3-T5 | after DB |
| docs/release/verify | T6-T7 | no       |

## Edge Cases & Failure Modes

- 실패 작업이 24시간을 넘었으면 재큐하지 않고 회로만 초기화해 새 사용자 검색을 기다린다.
- 기존 running 작업은 회로까지 그대로 유지하고, pending 작업은 회로만 초기화해 새 작업 없이 기존 작업을 사용한다.
- 복구 직후 worker가 다시 인증 실패하면 기존 deterministic kill switch가 회로를 재개방한다.
- DB 복구에는 성공했지만 drain 호출이 실패하면 workflow를 실패시켜 운영자가 성공으로 오인하지 않게 한다.
- 동시에 두 복구 요청이 와도 advisory lock과 active job 검사로 한 건만 재예약한다.

## Verification Evidence

- 배포 run `31883728696`은 성공했지만 production UI는 계속 `보호 대기`였다.
- 이전 실제 worker run `31881820122`는 HTTP 500이었고, 이후 예약 run은 회로로 인해 작업 없이 성공했다.
- `resolve_iping_refresh_job`은 결정적 오류에서 `circuit_open_until = now() + 6 hours`와 terminal job을 기록하며, 현재 deploy/schedule에는 이를 복구하는 경로가 없다.
- TDD RED: 새 migration 부재와 `recover-iping` 계약 부재로 focused suites가 예상 실패했다.
- TDD GREEN: queue/recovery/runtime/workflow 4 files, 33 tests passed.
- 전체 Vitest의 고병렬 실행은 로컬 자원 경합으로 UI timeout이 발생했으며, 잔여 프로세스를 정리하고 worker를 2개로 제한한 전체 재실행은 76 files, 425 tests passed.
- 격리된 `public.ecr.aws/supabase/postgres:17.6.1.158` 컨테이너에 전체 migration을 적용하고 queue recovery SQL을 실행해 `BEGIN → DO → ROLLBACK` 성공을 확인했다.
- 같은 실제 DB에서 두 `dblink` 세션으로 claim transaction을 열린 채 recovery를 경쟁시켰고, recovery가 lock을 기다린 뒤 committed running job을 `busy`로 보존하며 active job을 하나만 유지함을 확인했다. 임시 컨테이너는 검증 직후 자동 삭제했다.

## Docs Impact

- `docs/operations.md`: 계정 Secret 교체 뒤 명시적 recovery workflow 실행과 재실패 대응 절차를 추가했다.
- `docs/architecture.md`: worker-only 복구 RPC와 정상 schedule/배포의 회로 비개입 계약을 추가했다.
- `docs/crawling-policy.md`: 최근 실패 한 건만 재검증하고 실패 시 보호 회로를 재개방하는 정책을 추가했다.

## History

| Phase     | Date       | Agent | Result                                                                                 |
| --------- | ---------- | ----- | -------------------------------------------------------------------------------------- |
| Plan+Spec | 2026-08-15 | codex | tier L: DB/Edge/workflow 상태 전이와 운영 복구 권한 경계; 원인은 DB 회로 지속으로 확정 |
| Run+Test  | 2026-08-15 | codex | T1-T7 완료; RED/GREEN 33 focused tests, 425 full tests, lint/type/build/docs/release 및 PostgreSQL 17.6 상태 전이·동시성 통과 |
| Review | 2026-08-15 | codex + architect/security/quality reviewers | claim/recovery lock 경쟁, 검증되지 않은 2xx, non-main secret provisioning을 수정하고 최종 T1-T7 PASS |
