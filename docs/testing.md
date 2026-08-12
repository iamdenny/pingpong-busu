---
summary: 'BUSU 테스트 계층, fixture 규칙, 필수 완료 게이트와 수동 확인 항목을 정의한다.'
read_when:
  - 기능이나 parser 테스트를 추가할 때
  - 변경 완료 여부를 검증할 때
title: '테스트 전략'
---

# 테스트 전략

## 테스트 계층

| 계층 | 위치 | 검증 대상 |
| --- | --- | --- |
| Domain unit | `packages/domain/src/*.test.ts` | 이름·지역·부수·입상·정렬·hash 규칙 |
| Crawler unit | `packages/crawler-core/src/*.test.ts` | insert/update/unchanged와 revision |
| Parser fixture | `packages/source-adapters/src/*/*.test.ts` | 외부 응답 schema와 정규화 결과 |
| Web component | `apps/web/src/**/*.test.tsx` | 검색·출처 진행·요약 표·상세 UI |
| Edge auth | `tests/edge-auth.test.ts` | publishable key 경계 |
| Browser smoke | `tests/e2e` | home → 검색 → 상세 흐름 |
| Live opt-in | `tests/live-e2e` | 허용된 실제 출처 연결 |

## Parser fixture 규칙

- 실제 사람의 민감정보를 복사하지 않고 합성 이름·소속·대회로 만든다.
- 성공 응답, 빈 결과, 구조 변경을 구분한다.
- 빈 결과는 `[]`, 필수 식별자/열 누락은 schema 또는 parse error로 처리한다.
- parser 동작이 바뀌면 fixture test와 parser version을 함께 올린다.
- Edge generated bundle은 workspace parser test가 기준이다.

## 필수 게이트

완료 전 아래 네 명령을 모두 실행한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

실패한 테스트를 삭제하거나 skip 처리해 통과시키지 않는다. build의 chunk-size 경고는 실패가 아니지만 증가 원인을 검토한다.

## 기능별 최소 검증

| 변경 | 필요한 검증 |
| --- | --- |
| 부수·입상·지역 규칙 | domain unit + 영향을 받는 parser fixture |
| 검색 결과/상세 UI | component test + desktop/mobile 미리보기 |
| Supabase view/RPC | 새 migration + 공개 view 응답 확인 |
| Edge Function | auth test + local/remote 호출 결과 |
| 출처 활성화 | 정책 문서 + synthetic fixture + opt-in live test |
| 배포 workflow | GitHub Actions 성공과 실제 URL 응답 |

## 수동 화면 확인

- 부수 요약이 compact 2행 표로 보이고 mobile에서 페이지 전체 가로 overflow가 없는가
- 실제 공개 기록과 가상 데이터 badge가 구분되는가
- 동명이인 경고, 지역 추정 표현, 원문 링크가 보이는가
- 출처 조회 중·성공·실패 상태가 개별적으로 갱신되는가
- 키보드 focus와 semantic heading/table 구조가 유지되는가
