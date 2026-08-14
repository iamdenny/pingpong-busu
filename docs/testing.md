---
summary: "BUSU 테스트 계층, fixture 규칙, 필수 완료 게이트와 수동 확인 항목을 정의한다."
read_when:
  - 기능이나 parser 테스트를 추가할 때
  - 변경 완료 여부를 검증할 때
title: "테스트 전략"
---

# 테스트 전략

## 모션과 화면 전환 확인

모션 변경은 홈 진입, 결과 필터, 결과→상세와 상세→결과 이동을 desktop과 390px에서 확인한다. reduced motion으로 반복해 transform, stagger, pulse, view-transition animation이 보이지 않는지 확인한다. 네이티브 view transition 미지원 환경에서도 즉시 정상 이동해야 한다. production JS gzip 전후를 기록하며 Motion에 따른 초기 JS 증가는 15 KiB 이하여야 한다.

## 테스트 계층

| 계층                | 위치                                        | 검증 대상                                            |
| ------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Domain unit         | `packages/domain/src/*.test.ts`             | 이름·지역·부수·입상·정렬·hash 규칙                   |
| Crawler unit        | `packages/crawler-core/src/*.test.ts`       | insert/update/unchanged와 revision                   |
| Adapter/fixture     | `packages/source-adapters/src/**/*.test.ts` | 외부 응답 schema·정규화, 제한 재시도, 인증 세션 판별 |
| Web component       | `apps/web/src/**/*.test.tsx`                | 검색·출처 진행·요약 표·상세 UI                       |
| Migration contract  | `tests/*-migration.test.ts`                 | SQL 권한·집계·제한·원복 계약의 정적 회귀             |
| SQL integration     | `tests/sql/*.sql`                           | 실제 DB 트랜잭션의 병합·원복과 충돌 방어             |
| Release unit        | `tests/release-version.test.ts`             | package 버전 형식·ISO 주차·순번 증가                 |
| Deployment contract | `tests/*-deployment.test.ts`                | environment 격리·수동 trigger·seed·crawler 안전장치  |
| Edge auth           | `tests/edge-auth.test.ts`                   | publishable key 경계                                 |
| Browser smoke       | `tests/e2e`                                 | home → 검색 → 상세 흐름                              |
| Live opt-in         | `tests/live-e2e`                            | 허용된 실제 출처 연결                                |

## Parser fixture 규칙

- 실제 사람의 민감정보를 복사하지 않고 합성 이름·소속·대회로 만든다.
- 성공 응답, 빈 결과, 구조 변경을 구분한다.
- 빈 결과는 `[]`, 필수 식별자/열 누락은 schema 또는 parse error로 처리한다.
- parser 동작이 바뀌면 fixture test와 parser version을 함께 올린다.
- Edge generated bundle은 workspace parser test가 기준이다.
- CP949/EUC-KR 출처는 검색어 인코딩과 응답 디코딩도 별도 unit test로 고정한다.

## 필수 게이트

완료 전 아래 다섯 명령을 모두 실행한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs-check:scan
```

실패한 테스트를 삭제하거나 skip 처리해 통과시키지 않는다. build의 chunk-size 경고는 실패가 아니지만 증가 원인을 검토한다.

로컬 Supabase가 실행 중이면 병합·원복 SQL 통합 검증을 트랜잭션으로 실행하고 마지막에 롤백한다.

```bash
docker exec -i supabase_db_pingpong-busu psql -U postgres -d postgres < tests/sql/reversible-player-merge.sql
docker exec -i supabase_db_pingpong-busu psql -U postgres -d postgres < tests/sql/source-observation-boundary.sql
docker exec -i supabase_db_pingpong-busu psql -U postgres -d postgres < tests/sql/community-identity-edit.sql
```

## 기능별 최소 검증

| 변경                  | 필요한 검증                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 부수·입상·지역 규칙   | domain unit + 영향을 받는 parser fixture                                                                                 |
| 부수별 입상·참가 요약 | domain aggregation + public view migration contract + repository/component test                                          |
| 검색 결과/상세 UI     | component test + desktop/mobile 미리보기                                                                                 |
| 동명이인 참여 편집    | 10건 초과 별칭 그룹 배정 + 자유 입력 검증·중복 방지 + 기록 RPC fallback·재조회 + 자동 익명 ID 재사용 + migration dry-run |
| 동명이인 연결·원복    | 후보별 별칭 공개 이력 component test + 다중 그룹 source identity 연결/전체 복구 + 후속 작업 충돌 확인                    |
| Supabase view/RPC     | 새 migration + 공개 view 응답 확인                                                                                       |
| Edge Function         | auth test + local/remote 호출 결과                                                                                       |
| 익명 문의·제보        | dialog 접근성·브라우저 문맥 payload + origin/auth/개인정보 거부 + rate limit·멱등 전달 migration contract                |
| 운영 오류 자동 보고   | category/필드/origin/auth 거부 + event 멱등 집계 + 3회 threshold + lease·marker 조정 + 비차단 fallback                   |
| 출처 활성화           | 정책 문서 + synthetic fixture + opt-in live test                                                                         |
| 출처 요청 복원력      | 일시적 HTTP/timeout만 재시도 + 호출자 취소 유지 + 출처별 timeout 확인                                                    |
| 아이핑 인증           | guest/authenticated/challenge/unknown fixture + hidden session POST 전달 + 쿠키 비저장 + 로그인 POST 단일 시도           |
| 배포 workflow         | package 버전 형식·주차 순번 unit test + 태그/Release 선행 + GitHub Actions 성공 + 실제 URL 버전 확인                     |
| Supabase 개발 배포    | main 수동 trigger + project ref 불일치 + seed 2회 적용 + mock 외 source 비활성 + Edge function 목록 확인                 |

development 원격 검증은 production 데이터나 자격증명을 복사하지 않은 상태에서 수행한다. `supabase migration list --linked`로 전체 migration을 확인하고 같은 seed를 두 번 적용한 뒤 합성 club/player 수가 증가하지 않는지, 공개 `sources` 조회에서 `mock`만 활성인지 확인한다. Free 프로젝트가 자동 pause된 경우 Dashboard에서 resume한 뒤 다시 실행한다.

## 수동 화면 확인

- 부수 요약이 compact 2행 표로 보이고 mobile에서 페이지 전체 가로 overflow가 없는가
- 실제 공개 기록과 가상 데이터 badge가 구분되는가
- 동명이인 경고, 지역 추정 표현, 원문 링크가 보이는가
- 상세 기록의 전체 종목명이 desktop table과 mobile card에 동일하게 보이는가
- 동명이인 구분 dialog의 각 후보에 최근 출전 대회명과 원문 종목명이 보이고, 사용자가 서로 다른 탁구 별칭을 직접 입력해 비밀번호 없이 기록을 배정할 수 있는가
- 출처 조회 중·성공·실패 상태가 개별적으로 갱신되는가
- 키보드 focus와 semantic heading/table 구조가 유지되는가
