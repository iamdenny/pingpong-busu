---
summary: "Supabase와 GitHub 배포, 출처 장애, 환경 전환과 데이터 보존 절차를 설명한다."
read_when:
  - production을 배포하거나 운영할 때
  - 출처 장애나 DB 용량 문제에 대응할 때
title: "운영"
---

# 운영

## 방문 통계

운영 웹은 `busu.iamdenny.com`에 등록한 Cloudflare Web Analytics beacon을 `apps/web/index.html`에서 비차단 모듈 스크립트로 불러옵니다. 페이지 조회·방문과 웹 성능을 집계하는 용도이며 개별 방문자를 식별하거나 BUSU의 선수 검색어·문의 내용·참여 편집 값을 별도 이벤트로 전송하지 않습니다. 통계가 보이지 않으면 배포 HTML의 `data-cf-beacon` 토큰, 브라우저의 beacon 요청 차단 여부와 Cloudflare Dashboard의 호스트 이름을 확인합니다.

## 출처 장애

파서 오류가 증가하면 `sources.enabled=false`와 source 환경 변수 false를 적용하고 기존 저장 결과를 유지합니다. sanitized synthetic fixture로 구조 변경을 재현하고 parser version/test를 함께 올립니다. 내부 stack/secret은 공개 status에 반환하지 않습니다.

Supabase Edge의 에어핑퐁 요청은 10초 단일 시도 뒤 `source_timeout`과 5초 재시도 정보를 반환합니다. 화면은 최소 5초 간격으로 최대 2회 다시 Edge를 호출하며, 재시도 뒤에도 실패하면 시간 초과를 표시합니다. 수동 진단용 workspace live CLI에서는 에어핑퐁 16초, 오케이핑퐁 10초, 아이핑 12초 제한과 일시 오류 1회 재시도를 유지합니다. 아이핑이 `인증 실패`이면 Secret 값과 계정 상태를 확인하고, `사이트 구조 변경`이면 로그인 성공 화면 식별자가 달라졌는지 확인합니다. 로그인 POST는 중복 인증 시도를 막기 위해 자동 재시도하지 않습니다. 같은 결정적 오류가 연속 2회면 10분간 `보호 대기`로 실제 요청을 중단하며, 성공하거나 회로가 만료되면 초기화합니다. `source_request_diagnostics`에는 허용된 단계·오류 코드·소요 시간·시각만 남기고 매일 14일 초과분을 삭제하므로 원문 응답이나 검색어로 진단하려고 해서는 안 됩니다.

실시간 조회의 사용자 표시와 우선 대응은 다음과 같습니다.

| 표시             | 코드                    | 우선 대응                                                                       |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------- |
| 시간 초과        | `source_timeout`        | 출처 응답 지연과 화면의 최대 2회 재요청 결과를 확인한다.                        |
| 접근 차단        | `source_blocked`        | 403 또는 사람 확인 절차를 확인하고 해당 출처를 끈다. 우회하지 않는다.           |
| 사이트 구조 변경 | `source_schema_changed` | 합성 fixture와 parser 식별자를 갱신하고 parser version을 올린다.                |
| 응답 해석 실패   | `source_parse_error`    | 개인정보를 제거한 응답 형태로 parser 실패를 재현한다.                           |
| 연동 설정 누락   | `source_not_configured` | 서버 Secret과 출처별 운영 스위치를 확인한다.                                    |
| 인증 실패        | `source_auth_failed`    | 서버 전용 계정·키의 만료와 계정 상태를 확인한다.                                |
| 연결 실패        | `source_request_failed` | DNS, TLS, 출처 장애를 확인한다.                                                 |
| 저장 실패        | `source_persist_failed` | upsert RPC와 migration 적용 상태를 확인한다.                                    |
| 호출 제한        | `source_rate_limited`   | 화면의 남은 시간을 기다린다. 제한 시간이 없는 장기 제한은 자동 반복하지 않는다. |
| 조회 실패        | `source_refresh_failed` | 공개 메시지 뒤의 서버 로그를 확인하되 stack과 Secret은 노출하지 않는다.         |

## 용량과 보존

`pnpm db:size`의 project RPC를 운영 Supabase에 연결해 350MB에서 경고하고 500MB 전에 조치합니다. 완료 refresh 상세는 7~30일, 실패 요약은 진단 기간 뒤 정리합니다. revisions는 변경 이력 요구와 용량을 검토해 archive하며 최근 records를 삭제하지 않습니다.

## 환경 전환

Demo는 public env가 없거나 `VITE_APP_MODE=demo`일 때 자동 선택됩니다. Production은 URL/publishable key와 `VITE_APP_MODE=production`을 설정하고 migration/view/RLS/Edge Function을 먼저 검증합니다. service role/secret key는 trusted 환경만 사용합니다.

### Hosted development

Free 플랜에서는 유료 Branching 대신 production과 다른 두 번째 프로젝트 `pingpong-busu-dev`를 사용합니다. 두 프로젝트는 Singapore 리전에 두되 project ref, URL, publishable key, DB, Edge secrets를 공유하지 않습니다. table 이름에 `dev_` prefix를 붙이지 않고 같은 migration으로 동일한 schema를 유지합니다. Free 프로젝트가 비활성으로 자동 pause되면 배포 전에 Dashboard에서 resume하며, 슬롯 확보를 위해 production을 삭제하거나 결제로 전환하지 않습니다.

GitHub `development` environment에는 아래 값만 둡니다.

| 구분     | 이름                             | 용도                                                                                                            |
| -------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Secret   | `SUPABASE_ACCESS_TOKEN`          | 사용자가 직접 입력하는 Supabase PAT. production secret을 복사하지 않음                                          |
| Variable | `SUPABASE_PROJECT_ID`            | development project ref                                                                                         |
| Variable | `SUPABASE_PRODUCTION_PROJECT_ID` | 잘못된 production 대상 배포를 차단하기 위한 비교 ref                                                            |
| Variable | `SUPABASE_URL`                   | development 공개 API URL                                                                                        |
| Secret   | `SUPABASE_PUBLISHABLE_KEY`       | development 브라우저용 공개 key. 값은 공개 가능하지만 workflow 환경을 분리하기 위해 environment secret으로 저장 |

[Deploy Supabase development backend](../.github/workflows/deploy-supabase-development.yml)는 main 브랜치에서 `deploy-development` 확인 문자열을 입력한 수동 실행만 허용합니다. project ref가 production과 같거나 Supabase project 이름이 `pingpong-busu-dev`가 아니면 migration 전에 실패합니다. 성공 경로는 migration dry-run, `db push --include-seed`, 모든 crawler secret의 `false` 고정, Edge Function 배포, 공개 source 상태 검증 순서입니다. Kakao/iPing 자격증명과 production 데이터는 복제하지 않습니다.

`supabase/seed.sql`은 반복 실행 가능하며 합성 club/player만 추가하고 `mock`만 활성화합니다. production workflow는 seed를 적용하지 않습니다. 개발 프런트는 gitignored `.env.development.local`에 development URL/publishable key를 두고 production Pages 변수는 변경하지 않습니다.

## Supabase 서버 배포

main 브랜치의 `CI`가 성공하면 [Deploy Supabase backend](../.github/workflows/deploy-supabase.yml)가 production environment에 다음 순서로 배포합니다.

1. 프로젝트 연결과 migration dry-run
2. `supabase db push`로 미적용 migration 적용
3. crawler 안전 플래그를 Edge Function secrets에 동기화
4. `refresh-player`, `refresh-status`, `submit-identity-claim`, `revert-identity-edit`, `submit-feedback` Edge Function 배포

이번 변경의 migration은 파일명 순서대로 적용해야 합니다.

1. `202608130001_reversible_player_merges.sql`: 삭제 없는 병합·원복 RPC와 감사 로그
2. `202608130002_bounded_source_retries.sql`: 출처·정규화 검색어별 5초 하한과 분당 4회 제한
3. `202608130003_division_observation_counts.sql`: 공개 검색 view의 체계·부수별 입상·참가 건수
4. `202608130004_iping_global_throttle.sql`: 인증형 아이핑 출처 전체의 60초 간격 제한
5. `202608130005_live_source_failure_state.sql`: 아이핑 제한을 검색어별로 되돌리고 안전한 출처 오류 상태 기록
6. `202608130006_source_observation_boundary.sql`: 출처 소속 증거와 canonical 대표 소속의 경계 및 예선 순위 입상 제외
7. `202608130007_community_identity_edits.sql`: 무제한 후보 참여 편집, 공개 이력과 사용자 원복
8. `202608130008_homonym_nickname_partitions.sql`: 탁구 별칭별 동명이인 partition과 원자적 편집·원복
9. `202608130009_single_group_custom_nicknames.sql`: 적용된 운영 DB를 별칭 한 그룹·사용자 입력 별칭 규칙으로 교정
10. `202608130010_yongin_photo_board_cleanup.sql`: 용인시 탁구협회 사진 게시판 오염 관측 정리
11. `202608130011_harden_identity_aliases_and_orphans.sql`: 참여 별칭과 고아 identity 무결성 강화
12. `202608130012_anonymous_feedback.sql`: 익명 문의·제보 private outbox, abuse budget와 멱등 전달 RPC
13. `202608140001_player_search_priority.sql`: 참여 편집 우선, 최근 출전순 및 최신 관측 지역·소속 검색 요약
14. `202608140002_newttplay_source.sql`: 뉴티티플레이 출처 catalog와 기본 비활성화 상태
15. `202608140003_newttplay_global_request_budget.sql`: 뉴티티플레이 출처 전체 요청 예산
16. `202608140004_bundang_18_regional_division_override.sql`: 사용자 확인 근거로 제18회 분당구청장기 기록을 지역부수로 정정
17. `202608140005_integrated_local_event_ranges.sql`: `지역0~4부` 같은 종목 범위를 통합부수로 정정하고 대회별 지역부수 예외를 재적용
18. `202608140006_regional_division_parser_versions.sql`: 지역·대회일 전환 규칙을 사용하는 출처 parser version 갱신
19. `202608140007_regional_division_backfill.sql`: 소스 관측값은 보존하고 지역별 전환일·대회 예외을 계산하는 공개 view 적용
20. `202608140008_source_reliability.sql`: 비공개 출처 진단과 아이핑 연속 인증·구조 오류 회로 차단

배포 전 `supabase migration list --linked`와 `supabase db push --linked --dry-run`에서 스무 파일의 순서를 확인합니다. `202608130004`는 이미 적용된 DB도 안전하게 다음 migration으로 교정할 수 있도록 기록으로 유지하며, 최종 동작은 `202608130005`가 정의한 검색어별 제한을 따릅니다. `202608130009`는 이미 `202608130008`이 적용된 운영 DB에서도 별칭 한 그룹과 사용자 입력 별칭을 허용하기 위한 필수 후속 migration입니다. 배포 후에는 내부 `player_merge_review_log`, `identity_partition_*`, `feedback_reports`, `source_request_diagnostics` table이 일반 공개 역할에 노출되지 않고 개인정보를 제거한 공개 조회만 제공되는지, `claim_source_request_with_policy`, `record_source_request_outcome`, `delete_expired_source_request_diagnostics`와 출처 상태 기록 및 참여 편집·문의 전달 mutation RPC가 service role 전용인지, `public_player_search.division_observations`, `homonym_nickname`, `latest_participation_date`, `latest_participation_tournament`가 조회되고 `award_results`에 대회명이 포함되는지 확인합니다. 후속 migration의 view는 첫 번째 migration이 추가한 병합 선수 제외 조건을 유지하므로 일부만 골라 적용하지 않습니다.

`202608140007`은 파서가 저장한 관측 체계를 우선 보존하고, 대회명·종목명에서 직접 확인한 지역과 실제 대회일로 전환 규칙을 공개 view에서 보완합니다. 선수 단위 출처 지역, 출처 provenance가 없는 공유 대회 지역, 아이핑 클럽명에서 유추한 과거 지역은 개별 기록 판정에 사용하지 않습니다. `results.division_system`과 `content_hash`를 수정하지 않아 다음 수집에서 가짜 revision이 생기지 않습니다. 전환일 이전 기록과 제18회까지의 분당구청장기 기록은 상세 이력에 보존하되 현재 추정 부수·최근 대회 요약에서 제외합니다.

GitHub의 `production` environment에 아래 값을 설정합니다.

| 구분      | 이름                                 | 용도                                                                                                                                                                   |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret    | `SUPABASE_ACCESS_TOKEN`              | Supabase Management API 배포 권한. `sbp_`로 시작하는 PAT                                                                                                               |
| Variable  | `SUPABASE_PROJECT_ID`                | Supabase project ref                                                                                                                                                   |
| Variable  | `CRAWL_LIVE`                         | 운영 crawler 전체 스위치. 기본 `false`                                                                                                                                 |
| Variable  | `CRAWLER_SOURCE_ASTREE_ENABLED`      | 애즈트리 adapter 스위치. 기본 `false`                                                                                                                                  |
| Variable  | `CRAWLER_SOURCE_NEWTTPLAY_ENABLED`   | 뉴티티플레이 adapter 스위치. 운영 허가 확인 전 기본 `false`                                                                                                            |
| Variable  | `CRAWLER_SOURCE_TTADIVISION_ENABLED` | 대한탁구협회 디비전 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                              |
| Variable  | `CRAWLER_SOURCE_MYTT_ENABLED`        | 마이티티 공개 참가 정보 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                          |
| Variable  | `CRAWLER_SOURCE_SUPERSTAR_ENABLED`   | 슈퍼스타탁구 공개 개인별 결과 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                    |
| Variable  | `CRAWLER_SOURCE_YONGINTT_ENABLED`    | 용인탁구협회 다음 카페 공식 검색 API adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                             |
| Variable  | `CRAWLER_SOURCE_AIRPING_ENABLED`     | 에어핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                                         |
| Variable  | `CRAWLER_SOURCE_OKPINGPONG_ENABLED`  | 오케이핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                                       |
| Variable  | `CRAWLER_SOURCE_IPING_ENABLED`       | 아이핑 인증형 adapter 스위치. 전용 계정 Secret 설정 전 기본 `false`                                                                                                    |
| Generated | `CRAWLER_USER_AGENT`                 | 배포 시 루트 package 버전으로 만드는 `BUSU/{version}` 출처 요청 식별자                                                                                                 |
| Variable  | `CRAWLER_SOURCE_MIN_INTERVAL_MS`     | 아이핑을 포함한 출처·정규화 검색어별 최소 호출 간격. 5~60초 범위, 기본 5초                                                                                             |
| Secret    | `KAKAO_REST_API_KEY`                 | 카카오 공식 Daum 카페 검색 API 키. 브라우저와 로그에 노출하지 않음                                                                                                     |
| Secret    | `IPING_USERNAME`                     | 아이핑 조회 전용 최소권한 계정 ID. Supabase Edge 런타임에만 전달                                                                                                       |
| Secret    | `IPING_PASSWORD`                     | 아이핑 조회 전용 계정 비밀번호. Supabase Edge 런타임에만 전달                                                                                                          |
| Secret    | `FEEDBACK_GITHUB_TOKEN`              | GitHub production environment 필수값. 대상 저장소로 범위를 제한하고 Issues 읽기·쓰기만 허용한 fine-grained token. 배포 시 Edge 런타임의 `GITHUB_ISSUES_TOKEN`으로 전달 |
| Variable  | `GITHUB_ISSUES_REPOSITORY`           | 문의·제보 Issue 대상 저장소. 기본 `iamdenny/pingpong-busu`                                                                                                             |
| Variable  | `FEEDBACK_ALLOWED_ORIGINS`           | 쉼표로 구분한 문의·제보 허용 Origin. 기본 `https://busu.iamdenny.com`                                                                                                  |

기존 장애는 GitHub `production` environment의 feedback token이 비어 있었는데도 이전 workflow가 token 설정 단계를 건너뛰고 배포를 성공 처리해, `submit-feedback`이 설정되지 않은 상태로 남은 것이 원인입니다. GitHub Actions는 `GITHUB_` 접두사의 사용자 Secret 이름을 허용하지 않으므로 environment에는 `FEEDBACK_GITHUB_TOKEN`으로 등록합니다. 대상 저장소 하나로 범위를 제한하고 repository permission은 Issues 읽기·쓰기만 허용합니다. production workflow는 이 Secret이 비어 있으면 `supabase link`, migration, Edge Secret 변경, 함수 배포보다 먼저 실패하고, 값이 있으면 Supabase Edge 런타임의 `GITHUB_ISSUES_TOKEN`으로 전달합니다. Secret은 검증 단계와 GitHub Issues token 설정 단계에만 주입하며 브라우저 코드, 빌드 환경, 로그에는 전달하지 않습니다.

token을 회전하거나 누락을 복구할 때는 GitHub `production` environment의 `FEEDBACK_GITHUB_TOKEN`을 새 최소권한 값으로 갱신한 뒤 실패한 [Deploy Supabase backend](../.github/workflows/deploy-supabase.yml)를 다시 실행합니다. 검증과 token 설정 단계가 성공하고 Edge Function 배포까지 완료됐는지 확인합니다. 실제 문의 제출 검증은 자격증명 등록과 배포가 확인된 뒤 별도 승인된 합성 요청으로 수행하며, 그 전에는 production 복구를 완료로 판단하지 않습니다.

`submit-feedback`이 `503 server_not_configured`를 반환하면 Edge 런타임의 GitHub token 또는 대상 저장소 설정이 누락된 상태입니다. GitHub `production` environment에 `FEEDBACK_GITHUB_TOKEN`과 `GITHUB_ISSUES_REPOSITORY`가 설정됐는지 확인하고 workflow를 다시 실행합니다. token 원문을 출력하거나 브라우저에서 확인하지 말고 Actions 단계 성공 여부와 비민감 오류 코드만 조사합니다.

문의·제보 기능은 GitHub token 또는 허용 Origin 설정이 없으면 닫힌 상태로 실패합니다. 전체 요청이 10분당 10건 또는 하루 50건을 넘으면 429를 반환합니다. 성공 시 공개 Issue를 확인한 뒤 private outbox의 본문과 브라우저 문맥을 즉시 지웁니다. 공개되는 페이지 링크에서는 쿼리 문자열을 제거하고, hash route에도 붙은 쿼리를 제거합니다. `delivery_unknown`은 같은 submission ID로 재시도하면 GitHub marker를 먼저 조회해 중복 생성을 막습니다. migration이 매일 service role 전용 `redact_expired_feedback_internal()`을 예약해 30일이 지난 미전달 행을 삭제합니다. abuse 시 `submit-feedback` 배포를 중지하거나 token을 폐기하고 비민감 상태·오류 코드만 조사합니다.

GitHub Pages repository variables에는 `VITE_APP_MODE=production`, `VITE_APP_BASE_PATH=/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SOURCE_REFRESH_ENABLED=true`를 설정합니다. 커스텀 도메인은 `https://busu.iamdenny.com/` 루트에서 서비스하므로 asset base도 `/`여야 합니다. 이 중 source refresh 값은 브라우저에서 갱신 UI를 켜는 공개 설정일 뿐이며, 실제 외부 요청 허용 여부는 위의 서버 변수와 DB `sources.enabled`가 함께 결정합니다.

제품 버전은 루트 `package.json`에서만 관리하며 `YYYY.WEEK.SEQ` 형식이다. `SEQ`는 같은 ISO 주 안에서 `0`부터 순서대로 증가한다. 배포 변경을 준비할 때 `pnpm release:bump`를 실행하면 같은 ISO 주에는 순번을 하나 올리고 새 주에는 `0`으로 초기화한다. workspace package와 환경 변수에는 별도 제품 버전을 두지 않으며 web build도 루트 값을 직접 읽는다.

Pages workflow는 lint·typecheck·test·build를 먼저 통과시킨 뒤 `v{version}` 태그와 GitHub Release를 만들고 GitHub 자동 릴리즈 노트를 작성한다. release job이 성공해야 deploy job이 시작된다. 동일 태그가 현재 커밋을 가리키고 Release도 존재하면 재실행을 허용하지만, 다른 커밋을 가리키면 버전 미증가로 판단해 배포를 중단한다. 따라서 모든 배포 PR은 루트 `package.json` 버전 변경을 포함해야 한다.

PAT는 배포 job에만 주입되며 프런트 build에 전달하지 않습니다. Supabase CLI의 passwordless login role로 migration을 적용하므로 DB 비밀번호를 CI에 보관하지 않습니다. `sb_publishable_...`은 브라우저용이고, `sb_secret_...`은 DB 비밀번호나 PAT가 아닙니다. 카카오 키와 아이핑 자격증명은 GitHub Actions가 Supabase Edge Secret으로 전달하며 프런트 build에는 주입하지 않습니다. 아이핑을 켤 때는 두 Secret을 먼저 등록한 뒤 `CRAWLER_SOURCE_IPING_ENABLED=true`, 마지막으로 DB `sources.enabled=true` 순서로 활성화합니다. 어느 하나라도 없으면 요청하지 않습니다. 수동 `crawl-manual.yml`은 보호 규칙 없는 브랜치에 운영 Secret을 노출하지 않도록 `production` environment를 연결하지 않습니다. dispatch 문자열은 step 환경 변수로 전달하고 `CRAWLER_REDACT_QUERY=true`로 선수 검색어를 Actions 출력에서 가립니다. 수동 아이핑 운영 계정 검증은 GitHub `production` 환경을 `main`으로 제한하고 required reviewer를 설정한 뒤에만 별도로 활성화합니다.

Edge Functions는 새 publishable key를 지원하기 위해 platform의 legacy JWT 검증을 끄고, 함수 내부에서 `apikey`를 `SUPABASE_PUBLISHABLE_KEYS`와 대조합니다. 검색 화면의 자동 조회는 같은 이름의 최근 6시간 성공 결과를 재사용하며, 실패 행의 수동 재시도만 `force=true`를 전달합니다. 서버는 강제 갱신에도 아이핑을 포함한 `출처 + 정규화 검색어`별 5~60초 범위의 최소 호출 간격과 1분당 최대 4회 제한을 적용하며 `source_request_throttles`에 제한 구간과 시도 횟수를 저장합니다. 다른 이름 검색은 출처 전체 잠금 때문에 대기하지 않지만 원자적 정책 claim과 `source_request_budgets`에서 아이핑 계정 단위 분당 실제 요청 2회, 에어핑퐁 출처 단위 분당 실제 요청 6회 예산을 적용합니다. 제한 응답이나 에어핑퐁 10초 단일 시도의 시간 초과에 `retryAfterMs`가 있으면 프런트가 남은 시간을 표시하고 최대 2회 자동 재시도합니다. 에어핑퐁 시간 초과 재시도 사이에는 최소 5초를 두며 아이핑 인증 시간 초과·인증·파서 실패는 자동 반복하지 않습니다. 아이핑 인증·구조 오류가 연속 2회면 10분 회로를 열고 회로 만료 또는 성공 시 초기화합니다. 실패 행의 수동 재시도는 출처별로 현재 검색 화면에서 최대 3회이며 5초 쿨다운을 두고, 성공하면 횟수를 초기화합니다. 페이지를 새로 열어 클라이언트 횟수가 초기화돼도 서버 제한은 계속 적용됩니다. publishable key 자체는 비밀이 아니므로 트래픽 증가 시 CAPTCHA, gateway rate limit 또는 사용자 단위 quota를 추가해야 합니다.

Edge가 장애를 기록할 때는 service role 전용 `record_source_refresh_failure` RPC에 출처 코드와 허용 목록의 오류 코드만 전달합니다. 검색어, query key, 원문 오류, 쿠키, HTML은 전달하거나 저장하지 않습니다. 다음 성공은 기존 record upsert 트랜잭션 안에서 `last_error_code`를 지우고 성공 시각과 parser version을 갱신합니다. 별도의 `record_source_request_outcome` RPC는 허용된 진단 메타데이터를 남기고 아이핑의 연속 실패 회로를 열거나 성공 시 초기화합니다. 이 회로 상태 기록이 실패하면 성공으로 가장하지 않고 안전한 갱신 실패를 반환합니다. `delete_expired_source_request_diagnostics`는 pg_cron으로 매일 실행되어 14일 초과 진단을 삭제합니다.

## 동명이인 참여 편집

관리자 승인 queue는 사용하지 않습니다. 참여자는 검색 결과의 기록을 직접 입력한 탁구 별칭 하나 이상에 배정합니다. 저장된 별칭이 없는 첫 진입은 사람 한 명만 만들고 추천 목록에서 별칭 하나를 무작위로 제안합니다. 필요한 만큼 사람을 추가해 다른 무작위 제안을 받거나 문구를 직접 수정할 수 있습니다. 저장된 별칭이 있는 후보는 다음에 창을 열 때 기존 사람 그룹과 기록 배정을 복원합니다. 한 사람만 확실히 아는 경우 그 기록만 반영하고 나머지는 미분류로 둘 수 있습니다. 구분 근거는 별도로 입력받지 않으며 공개 이력에는 시스템 기본 사유를 남깁니다. 별칭은 동명이인 구분용이며 실제 실력이나 공식 등급이 아닙니다. 같은 이름 안의 별칭 중복을 막고 확실하지 않은 기록은 미분류로 둡니다. `submit-identity-claim`은 후보 수에 고정 상한을 두지 않고 별칭 길이·문자·연락처 형태, 중복 배정과 같은 정규화 이름의 활성 후보인지 서버에서 다시 확인합니다. 브라우저는 `crypto.randomUUID()`로 익명 편집자 ID를 한 번 만들고 `localStorage`에 보관하지만 사용자에게 기억하거나 입력하도록 요구하지 않습니다. Edge Function은 원문 ID를 서버 HMAC으로 즉시 변환하며 DB에는 HMAC만 남깁니다. 이 값은 인증 수단이 아니므로 브라우저 저장값을 지우거나 다른 기기를 사용해도 편집과 원복은 계속할 수 있습니다. 동일 브라우저 식별값은 이름별 24시간에 최대 3건, 전체 편집은 10분에 최대 30건으로 제한하고 숨겨진 honeypot 필드가 채워진 자동 제출은 저장하지 않습니다.

편집과 원복은 요청 단계에서 요청 원점별 10분 10건, 익명 편집자별 24시간 6건을 원자적으로 제한합니다. 전체 10분 30건 예산은 실제 변경 트랜잭션 안에서만 차감되므로 무효 후보나 존재하지 않는 편집번호로 전체 사용자의 예산을 소모할 수 없습니다. 변경·원복 근거는 검수된 선택지만 저장해 주소·연락처·생년월일 같은 개인정보가 공개 이력에 유입되는 경로를 차단합니다. 후보 전체 수는 제한하지 않지만 근거 조회는 100건씩 분할합니다.

전환 전에 접수되어 `pending` 상태로 남은 제보는 자동 병합하지 않고 migration에서 미반영 종결합니다. 참여자는 공개 참여 편집 화면에서 후보를 다시 선택하면 별도 코드 없이 즉시 반영할 수 있습니다.

`apply_identity_partition_internal`은 편집·그룹·후보 snapshot을 만들고 각 별칭 그룹의 대표 선수를 결정한 뒤 필요한 그룹 내부 병합과 별칭 반영을 한 트랜잭션에서 실행합니다. 대표 선수는 공개 결과 수, 출처 identity 수, 생성 시각과 내부 ID 순으로 안정적으로 정합니다. 선수와 대회 결과 행은 삭제하지 않으며 검색 화면은 `list_identity_edit_history`를 통해 편집번호, 근거, 후보별 별칭과 현재 상태를 공개합니다. HMAC과 내부 상세 감사 정보는 공개하지 않습니다.

잘못된 최신 편집은 검색 화면의 `참여 편집 이력 → 되돌리기`에서 누구나 검수된 원복 사유를 선택해 전체 원복할 수 있습니다. 기존 편집자의 코드나 동일 브라우저일 필요는 없습니다. `revert-identity-edit`은 참여 편집으로 생성된 작업만 허용하고 내부 `revert_identity_partition_internal`을 호출해 해당 편집의 그룹 병합과 별칭을 모두 되돌립니다. 후속 편집이나 현재 연결 충돌이 있으면 덮어쓰지 않고 충돌을 반환하며 최신 편집부터 역순으로 되돌립니다.

운영자는 승인자가 아니라 장애 대응자입니다. abuse가 발생하면 Edge Function 또는 feature flag를 일시 중지하고, 내부 `player_merge_review_log`와 rate-limit 로그로 원인을 조사합니다. 일반 사용자의 직접 table 쓰기와 service role 노출은 계속 금지합니다.

[source catalog migration](../supabase/migrations/202608120003_source_catalog.sql)은 production DB에 기본 source 메타데이터를 생성하고, 후속 migration이 검증을 마친 출처를 개별 활성화합니다. 합성 선수와 대회 데이터는 `seed.sql`에 남아 있어 `db push` production 배포에는 포함되지 않습니다.

Supabase point-in-time recovery/backup 정책, migration restore rehearsal, seed와 실제 데이터 분리를 production launch 전에 확인합니다.
