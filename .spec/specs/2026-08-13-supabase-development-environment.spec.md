---
summary: "Free 플랜의 두 번째 Supabase 프로젝트로 production과 개발 데이터를 격리한다."
read_when:
  - Supabase 개발 환경을 배포하거나 초기화할 때
  - production과 development 데이터 경계를 변경할 때
title: "Supabase 개발 환경 분리"
status: "active"
date: "2026-08-13"
base_commit: "0ce6614c2b743e19a249e121df68641acc77bf1c"
target: "."
project: ".github/workflows, supabase, docs, tests"
context_hint: "mono"
tier: "L"
test_approach: "standard"
work_issue: "none"
---

# Supabase 개발 환경 분리

## Overview

Supabase Free 플랜의 두 번째 활성 프로젝트를 `pingpong-busu-dev`로 사용해 production 데이터와 개발 데이터를 물리적으로 분리한다. 유료 Branching이나 table prefix는 사용하지 않는다. 개발 프로젝트는 저장소 migration과 개인정보 없는 합성 seed만 적용하고, 모든 실출처 crawler를 항상 비활성화한다.

## Scope

### Must Have

- production과 다른 project ref의 `pingpong-busu-dev` 프로젝트를 같은 Singapore 리전에 둔다.
- development 배포는 main 브랜치의 수동 GitHub Actions에서만 실행한다.
- 배포 전에 development/production project ref가 서로 다른지 검증한다.
- development DB에는 전체 migration과 반복 실행 가능한 합성 seed를 적용한다.
- development Edge 런타임의 live crawler 및 모든 실출처 플래그를 `false`로 고정한다.
- GitHub `development` environment에 공개 project 설정을 분리하고 PAT와 publishable key를 environment secret으로 받는다.
- 운영·명령·아키텍처·테스트 문서에 환경 경계와 Free 자동 pause 대응을 기록한다.

### Must NOT Have

- production 데이터, Kakao key, iPing 계정 또는 service role key를 development로 복제하지 않는다.
- production 배포 workflow의 trigger, environment 또는 seed 동작을 변경하지 않는다.
- 유료 Supabase Branching에 의존하지 않는다.
- table 이름에 `dev_` prefix를 추가하거나 한 DB에서 환경을 혼합하지 않는다.
- development project ref와 공개 key를 production Pages 설정에 사용하지 않는다.

## TODOs

- [x] Free 조직에 `pingpong-busu-dev` 프로젝트를 생성하고 자동 RLS를 활성화한다.
- [x] 반복 실행 가능한 `supabase/seed.sql`로 합성 데이터와 source 비활성 상태를 고정한다. (BSM-2)
- [x] main 수동 실행 전용 development 배포 workflow와 대상 검증을 추가한다. (BSM-1, BSM-3)
- [x] workflow와 seed 안전 계약 테스트를 추가한다.
- [x] README와 관련 운영·명령·아키텍처·테스트 문서를 갱신한다.
- [x] GitHub `development` environment에 project 변수와 publishable key를 설정한다.
- [x] 필수 게이트와 독립 architecture/security/quality 리뷰를 통과한다.

## Acceptance Criteria

- [x] `pingpong-busu-dev` project ref가 production ref와 다르다.
- [x] 개발 프로젝트는 Singapore 리전이며 새 table 자동 공개가 꺼지고 자동 RLS가 켜져 있다.
- [x] development workflow는 `workflow_dispatch`와 main ref에서만 배포한다.
- [x] project 이름/ref 검증 실패 또는 production ref 일치 시 배포 전에 중단한다.
- [x] production workflow는 `--include-seed`를 사용하지 않고 기존 동작이 유지된다.
- [ ] development seed를 두 번 적용해도 합성 club/player 수가 증가하지 않는다. (첫 원격 실행에서 검증)
- [ ] development DB에서 `mock` 외 모든 source가 비활성이다. (첫 원격 실행에서 검증)
- [ ] development Edge secrets에서 live와 모든 source 플래그가 `false`다. (첫 원격 실행에서 검증)
- [x] Kakao/iPing credential이 development workflow에 존재하지 않는다.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm docs-check:scan`, `pnpm release:check`가 통과한다.

## Plan Validation

- team_validation_mode: subagent
- validation_perspectives: architecture, data integrity, security, QA
- validation_result: approved with idempotent-seed and target-validation requirements

## Unknowns

| ID  | Unknown                                                    | Why it matters                                                                               | How to resolve                                                     | Owner |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----- |
| U-1 | GitHub `development` environment의 `SUPABASE_ACCESS_TOKEN` | 원격 migration과 Edge 배포에 PAT가 필요하지만 기존 production secret은 읽거나 복사할 수 없음 | 사용자가 environment secret에 직접 입력한 뒤 첫 수동 workflow 실행 | user  |

## Stop Conditions

| ID  | Stop condition                              | Required action                                                |
| --- | ------------------------------------------- | -------------------------------------------------------------- |
| S-1 | development ref가 production ref와 일치함   | 모든 원격 변경을 중단하고 환경 변수를 교정한다.                |
| S-2 | fresh development DB에서 migration이 실패함 | migration history를 자동 repair하지 않고 실패 원인을 수정한다. |
| S-3 | Free 플랜이 결제나 production 중지를 요구함 | 결제·삭제 없이 중단하고 사용자에게 보고한다.                   |

## Behavior Sequence Matrix

| ID    | Path               | Sequence (events in order)                                                       | Expected final state                         | Required Evidence | Evidence Ref / Downgrade          |
| ----- | ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------- | ----------------- | --------------------------------- |
| BSM-1 | guarded deployment | main manual dispatch -> confirm phrase -> ref/name validation -> dry-run -> push | only `pingpong-busu-dev` receives migrations | unit + remote     | workflow contract + first run     |
| BSM-2 | seed re-entry      | first seed -> second seed -> source query                                        | synthetic counts stable; only mock enabled   | unit + remote     | seed contract + REST check        |
| BSM-3 | runtime safety     | migration -> set fixed false secrets -> deploy functions -> status check         | no live source can run in development        | unit + remote     | workflow contract + function list |

## Scope Boundary

- Free 프로젝트 자동 pause는 허용하고 필요할 때 Dashboard에서 resume한다.
- 개발 프런트 호스팅은 이번 범위가 아니며 로컬 `.env.development.local`로 development API를 선택한다.
- production release는 이 PR이 merge된 뒤 기존 main workflow가 담당한다.

## Change Preview

Before: 로컬 개발과 production Supabase가 같은 hosted backend 설정을 공유할 위험이 있다.
After: 독립 Free 프로젝트와 수동 배포 경로가 개발 데이터를 격리하고 실출처 요청을 차단한다.
Changes: development workflow, idempotent synthetic seed, contract tests, environment 운영 문서를 추가한다.

## Verification

- `pnpm lint`: pass
- `pnpm typecheck`: pass
- `pnpm test`: 42 files, 171 tests pass with one worker; the first parallel run had three unrelated timing failures and all passed on isolated rerun
- `pnpm build`: pass
- `pnpm docs-check:scan`: pass (19 Markdown files)
- `pnpm release:check`: pass (`2026.33.40`)
- development contract: 8 tests pass
- remote migration/Edge verification: pending user-provided `development` environment `SUPABASE_ACCESS_TOKEN`

## History

| Phase     | Date       | Agent                                   | Result                                                                                                           |
| --------- | ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Plan+Spec | 2026-08-13 | codex + architecture subagent           | separate Free project, manual deployment, ref/name guard, idempotent seed and crawler-off contract approved      |
| Run       | 2026-08-14 | codex                                   | project and GitHub environment created; workflow, seed, tests and docs implemented; mandatory local gates passed |
| Review    | 2026-08-14 | architecture/security/quality subagents | resolved consumed release version, pinned Actions/CLI, and merged-player seed re-entry findings                  |
