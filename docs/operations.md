---
summary: "Supabase와 GitHub 배포, 출처 장애, 환경 전환과 데이터 보존 절차를 설명한다."
read_when:
  - production을 배포하거나 운영할 때
  - 출처 장애나 DB 용량 문제에 대응할 때
title: "운영"
---

# 운영

## 방문 통계

운영 웹은 `busu.iamdenny.com`에 등록한 Cloudflare Web Analytics beacon을 `apps/web/index.html`에서 비차단 모듈 스크립트로 불러옵니다. 페이지 조회·방문과 웹 성능 집계는 Cloudflare를 사용하고, 검색·선수 상세·원문 이동 같은 제품 흐름은 Vercel + Neon에 셀프 호스트한 Umami로 분석합니다. Umami의 이벤트 사전, 개인정보 최소화, 배포·백업·이전 절차는 [제품 분석](./analytics.md)을 기준으로 합니다. 두 tracker가 차단되거나 실패해도 사용자 기능은 계속 동작해야 합니다.

## 출처 장애

파서 오류가 증가하면 `sources.enabled=false`와 source 환경 변수 false를 적용하고 기존 저장 결과를 유지합니다. sanitized synthetic fixture로 구조 변경을 재현하고 parser version/test를 함께 올립니다. 내부 stack/secret은 공개 status에 반환하지 않습니다.

Supabase Edge의 에어핑퐁 요청은 10초 단일 시도 뒤 `source_timeout`과 5초 재시도 정보를 반환합니다. 화면은 최소 5초 간격으로 최대 2회 다시 Edge를 호출하며, 재시도 뒤에도 실패하면 시간 초과를 표시합니다. 수동 진단용 workspace live CLI에서는 에어핑퐁 16초, 오케이핑퐁 10초, 아이핑 12초 제한과 일시 오류 1회 재시도를 유지합니다. 아이핑 브라우저 요청은 외부 사이트를 호출하지 않고 private queue에 등록합니다. 예약 worker의 인증 또는 구조 실패는 해당 job과 backlog를 terminal 처리하고 6시간 회로를 열며 기존 저장 결과는 유지합니다. `source_request_diagnostics`에는 허용된 단계·오류 코드·소요 시간·시각만 남기고 매일 14일 초과분을 삭제하므로 원문 응답이나 검색어로 진단하려고 해서는 안 됩니다.

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
4. `refresh-player`, `refresh-status`, `submit-identity-claim`, `revert-identity-edit`, `submit-feedback`, `report-runtime-incident` Edge Function 배포

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
21. `202608140009_operational_incidents.sql`: service-role 전용 운영 오류 집계·게시 lease·보존 RPC 적용
22. `202608140010_search_result_event_context.sql`: 검색 카드 입상·출전 요약에 대회명과 원문 종목명 제공
23. `202608140011_current_division_summary.sql`: 미래 대회 신청을 현재 부수 관측에서 제외하고 같은 날 통합·여자 관측 우선
24. `202608140012_individual_division_summary.sql`: 최근 관측 부수와 현재 추정부수를 개인전 중심으로 제한
25. `202608150001_prioritize_women_division.sql`: 종목명·부수 값의 여자·여성 표시를 일반 통합부수보다 우선
26. `202608150003_explicit_regional_events.sql`: 원본 관측 이력을 보존하면서 명시적 지역 종목의 공개 파생 체계를 날짜와 관계없이 지역부수로 일괄 정정
27. `202608150004_enable_newttplay_source.sql`: 운영 승인된 뉴티티플레이 production 출처 활성화
28. `202608150005_cross_source_result_groups.sql`: 원본 결과를 보존한 교차 출처 동일 결과 표시 그룹과 검색 요약 적용
29. `202608150006_result_group_query_indexes.sql`: 표시 그룹의 선수 identity·결과 join을 위한 조회 index
30. `202608150007_restore_result_view_availability.sql`: 전체 window 계산으로 인한 운영 조회 timeout을 막기 위해 결과 그룹을 일시적으로 원본 결과별 단일 그룹으로 복원
31. `202608150008_public_player_seo_manifest.sql`: Pages 빌드가 필요한 공개 메타데이터만 읽도록 경량 SEO manifest view 제공
32. `202608150009_iping_refresh_queue.sql`: 아이핑 private queue, 원자적 lease·backoff·보존 RPC와 parser `iping-4`
33. `202608150010_iping_operational_recovery.sql`: 아이핑 결정적 실패 회로를 운영자가 원자적으로 초기화하고 최근 실패 작업 한 건만 재예약하는 service-role 복구 RPC

배포 전 `supabase migration list --linked`와 `supabase db push --linked --dry-run`에서 전체 migration 파일의 순서를 확인합니다. `202608130004`는 이미 적용된 DB도 안전하게 다음 migration으로 교정할 수 있도록 기록으로 유지하며, 최종 동작은 `202608130005`가 정의한 검색어별 제한을 따릅니다. `202608130009`는 이미 `202608130008`이 적용된 운영 DB에서도 별칭 한 그룹과 사용자 입력 별칭을 허용하기 위한 필수 후속 migration입니다. 배포 후에는 내부 `player_merge_review_log`, `identity_partition_*`, `feedback_reports`, `source_request_diagnostics`, `operational_incident*` table이 일반 공개 역할에 노출되지 않고 개인정보를 제거한 공개 조회만 제공되는지, `claim_source_request_with_policy`, `record_source_request_outcome`, `delete_expired_source_request_diagnostics`와 출처 상태 기록 및 참여 편집·문의·운영 오류 mutation RPC가 service role 전용인지, `public_player_search.division_observations`, `homonym_nickname`, `latest_participation_date`, `latest_participation_tournament`가 조회되고 `award_results`에 대회명이 포함되는지 확인합니다. 후속 migration의 view는 첫 번째 migration이 추가한 병합 선수 제외 조건을 유지하므로 일부만 골라 적용하지 않습니다.

`202608140007`은 파서가 저장한 관측 체계를 우선 보존하고, 대회명·종목명에서 직접 확인한 지역과 실제 대회일로 전환 규칙을 공개 view에서 보완합니다. 선수 단위 출처 지역, 출처 provenance가 없는 공유 대회 지역, 아이핑 클럽명에서 유추한 과거 지역은 개별 기록 판정에 사용하지 않습니다. `results.division_system`과 `content_hash`를 수정하지 않아 다음 수집에서 가짜 revision이 생기지 않습니다. 전환일 이전 기록과 제18회까지의 분당구청장기 기록은 상세 이력에 보존하되 현재 추정 부수·최근 대회 요약에서 제외합니다.

`202608150007`은 `public_result_groups`의 전체 결과 window 계산이 PostgREST 선수 필터보다 먼저 실행되어 `57014 statement timeout`을 일으킨 운영 장애를 복구합니다. 공개 view의 컬럼과 provenance 배열 계약은 유지하되, 재설계 전까지 결과 하나를 그룹 하나로 취급하므로 교차 출처 중복 축약은 일시 중단됩니다. 배포 후 `public_player_search`와 선수별 `public_results`가 제한 시간 안에 200을 반환하는지 확인합니다.

GitHub의 `production` environment에 아래 값을 설정합니다.

| 구분      | 이름                                 | 용도                                                                                                                                                                   |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret    | `SUPABASE_ACCESS_TOKEN`              | Supabase Management API 배포 권한. `sbp_`로 시작하는 PAT                                                                                                               |
| Variable  | `SUPABASE_PROJECT_ID`                | Supabase project ref                                                                                                                                                   |
| Variable  | `CRAWL_LIVE`                         | 운영 crawler 전체 스위치. 기본 `false`                                                                                                                                 |
| Variable  | `CRAWLER_SOURCE_ASTREE_ENABLED`      | 애즈트리 adapter 스위치. 기본 `false`                                                                                                                                  |
| Variable  | `CRAWLER_SOURCE_NEWTTPLAY_ENABLED`   | 뉴티티플레이 adapter 스위치. production 기본 `true`, 긴급 중지 시 DB 출처와 함께 `false`                                                                               |
| Variable  | `CRAWLER_SOURCE_TTADIVISION_ENABLED` | 대한탁구협회 디비전 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                              |
| Variable  | `CRAWLER_SOURCE_MYTT_ENABLED`        | 마이티티 공개 참가 정보 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                          |
| Variable  | `CRAWLER_SOURCE_SUPERSTAR_ENABLED`   | 슈퍼스타탁구 공개 개인별 결과 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                    |
| Variable  | `CRAWLER_SOURCE_YONGINTT_ENABLED`    | 용인탁구협회 다음 카페 공식 검색 API adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                             |
| Variable  | `CRAWLER_SOURCE_AIRPING_ENABLED`     | 에어핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                                         |
| Variable  | `CRAWLER_SOURCE_OKPINGPONG_ENABLED`  | 오케이핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                                                                                       |
| Variable  | `CRAWLER_SOURCE_IPING_ENABLED`       | 아이핑 인증형 browser worker 스위치. 전용 계정 Secret 설정 전 기본 `false`                                                                                             |
| Generated | `CRAWLER_USER_AGENT`                 | 배포 시 루트 package 버전으로 만드는 `BUSU/{version}` 출처 요청 식별자                                                                                                 |
| Variable  | `CRAWLER_SOURCE_MIN_INTERVAL_MS`     | 일반 동기 출처의 출처·정규화 검색어별 최소 호출 간격. 5~60초 범위, 기본 5초                                                                                            |
| Secret    | `KAKAO_REST_API_KEY`                 | 카카오 공식 Daum 카페 검색 API 키. 브라우저와 로그에 노출하지 않음                                                                                                     |
| Secret    | `IPING_USERNAME`                     | 아이핑 조회 전용 최소권한 계정 ID. main 예약 workflow의 Playwright step에만 전달                                                                                       |
| Secret    | `IPING_PASSWORD`                     | 아이핑 조회 전용 계정 비밀번호. main 예약 workflow의 Playwright step에만 전달                                                                                          |
| Secret    | `FEEDBACK_GITHUB_TOKEN`              | GitHub production environment 필수값. 대상 저장소로 범위를 제한하고 Issues 읽기·쓰기만 허용한 fine-grained token. 배포 시 Edge 런타임의 `GITHUB_ISSUES_TOKEN`으로 전달 |
| Variable  | `GITHUB_ISSUES_REPOSITORY`           | 문의·제보 Issue 대상 저장소. 기본 `iamdenny/pingpong-busu`                                                                                                             |
| Variable  | `FEEDBACK_ALLOWED_ORIGINS`           | 쉼표로 구분한 문의·제보 허용 Origin. 기본 `https://busu.iamdenny.com`                                                                                                  |

기존 장애는 GitHub `production` environment의 feedback token이 비어 있었는데도 이전 workflow가 token 설정 단계를 건너뛰고 배포를 성공 처리해, `submit-feedback`이 설정되지 않은 상태로 남은 것이 원인입니다. GitHub Actions는 `GITHUB_` 접두사의 사용자 Secret 이름을 허용하지 않으므로 environment에는 `FEEDBACK_GITHUB_TOKEN`으로 등록합니다. 대상 저장소 하나로 범위를 제한하고 repository permission은 Issues 읽기·쓰기만 허용합니다. production workflow는 이 Secret이 비어 있으면 `supabase link`, migration, Edge Secret 변경, 함수 배포보다 먼저 실패하고, 값이 있으면 Supabase Edge 런타임의 `GITHUB_ISSUES_TOKEN`으로 전달합니다. Secret은 검증 단계와 GitHub Issues token 설정 단계에만 주입하며 브라우저 코드, 빌드 환경, 로그에는 전달하지 않습니다.

token을 회전하거나 누락을 복구할 때는 GitHub `production` environment의 `FEEDBACK_GITHUB_TOKEN`을 새 최소권한 값으로 갱신한 뒤 실패한 [Deploy Supabase backend](../.github/workflows/deploy-supabase.yml)를 다시 실행합니다. 검증과 token 설정 단계가 성공하고 Edge Function 배포까지 완료됐는지 확인합니다. 실제 문의 제출 검증은 자격증명 등록과 배포가 확인된 뒤 별도 승인된 합성 요청으로 수행하며, 그 전에는 production 복구를 완료로 판단하지 않습니다.

`submit-feedback`이 `503 server_not_configured`를 반환하면 Edge 런타임의 GitHub token 또는 대상 저장소 설정이 누락된 상태입니다. GitHub `production` environment에 `FEEDBACK_GITHUB_TOKEN`과 `GITHUB_ISSUES_REPOSITORY`가 설정됐는지 확인하고 workflow를 다시 실행합니다. token 원문을 출력하거나 브라우저에서 확인하지 말고 Actions 단계 성공 여부와 비민감 오류 코드만 조사합니다.

## 운영 오류 자동 Issue

`report-runtime-incident`는 production에서 `RUNTIME_INCIDENT_ALLOWED_ORIGINS=https://busu.iamdenny.com`을 사용합니다. 여러 Origin이 필요하면 쉼표로 나열하되 각각 query/path 없는 정확한 Origin이어야 합니다. 값이 없으면 `FEEDBACK_ALLOWED_ORIGINS`를 fallback으로 사용하지만, 배포 환경에는 기능별 값을 명시해 변경 범위를 분리합니다. 함수는 publishable key와 Origin을 모두 검증하고 GitHub token, service role key와 private table 접근은 Edge 런타임에만 둡니다. production/development workflow가 migration 뒤 이 함수를 배포하며 development Origin은 해당 개발 프런트 Origin만 허용합니다.

자동 집계 대상은 브라우저의 렌더 오류·미처리 오류·미처리 Promise 거부와 출처의 구조 변경·인증 실패뿐입니다. timeout, rate limit, offline, 취소, 일반 네트워크 실패는 자동 Issue로 만들지 않습니다. payload와 DB에는 category, 앱 버전, query/hash를 제거한 route, 선택적인 출처 코드·parser version, 무작위 event ID와 그 조합의 SHA-256 fingerprint만 둡니다. 오류 메시지, stack, 검색어, 선수명, 전체 URL, HTML/body, 쿠키, 자격증명과 브라우저/기기 식별자는 수집하지 않습니다.

같은 fingerprint가 3회 쌓여야 게시 lease를 얻으며 브라우저·출처 범위별로 시간당 최대 5건만 새로 전달합니다. 수집도 두 범위를 분리해 DB에서 각각 10분당 300개의 새 event로 원자적으로 제한하고 초과 요청은 429를 반환합니다. 브라우저 fingerprint는 category와 고정 route template만 사용하므로 공개 key·Origin을 재사용해 앱 버전을 바꿔도 새 fingerprint나 출처용 quota를 소진할 수 없습니다. GitHub 본문의 `busu-operational-incident:{fingerprint}` marker가 중복 조정 기준입니다. Issue 생성 뒤 응답을 확정하지 못한 `delivery_unknown`은 다음 동일 이벤트에서 marker를 정확히 검색해 기존 Issue를 연결하고, 찾지 못하면 새 Issue를 만들지 않습니다. 자동 종료는 하지 않습니다. 게시 실패는 집계를 `failed` 또는 `delivery_unknown`으로 남기지만 브라우저 fallback과 출처 refresh 응답은 그대로 유지합니다. 출처 incident 게시 전체는 `EdgeRuntime.waitUntil` background lifetime으로 넘겨 원래 refresh 응답이 GitHub 요청을 기다리지 않습니다.

보존 정리는 service role 전용 `purge_operational_incidents_internal(<기준 시각>)`을 `pg_cron`이 매일 실행합니다. 함수는 최근 30일 이내 집계를 삭제하지 않고 전달 중 lease도 건드리지 않으며, 2일이 지난 수집·게시 예산을 함께 삭제합니다. 운영자는 scheduler 실행 여부와 삭제 건수만 확인하고 fingerprint나 token 원문을 로그에 출력하지 않습니다. 장애 시 우선 `report-runtime-incident` 배포를 중단하거나 GitHub token을 폐기할 수 있으며 사용자 검색·저장 결과는 계속 동작합니다.

문의·제보 기능은 GitHub token 또는 허용 Origin 설정이 없으면 닫힌 상태로 실패합니다. 전체 요청이 10분당 10건 또는 하루 50건을 넘으면 429를 반환합니다. 성공 시 공개 Issue를 확인한 뒤 private outbox의 본문과 브라우저 문맥을 즉시 지웁니다. 공개되는 페이지 링크에서는 쿼리 문자열을 제거하고, hash route에도 붙은 쿼리를 제거합니다. `delivery_unknown`은 같은 submission ID로 재시도하면 GitHub marker를 먼저 조회해 중복 생성을 막습니다. migration이 매일 service role 전용 `redact_expired_feedback_internal()`을 예약해 30일이 지난 미전달 행을 삭제합니다. abuse 시 `submit-feedback` 배포를 중지하거나 token을 폐기하고 비민감 상태·오류 코드만 조사합니다.

GitHub Pages repository variables에는 `VITE_APP_MODE=production`, `VITE_APP_BASE_PATH=/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SOURCE_REFRESH_ENABLED=true`, `VITE_UMAMI_SCRIPT_URL`, `VITE_UMAMI_WEBSITE_ID`를 설정합니다. 커스텀 도메인은 `https://busu.iamdenny.com/` 루트에서 서비스하므로 asset base도 `/`여야 합니다. source refresh와 Umami 두 값은 브라우저 공개 설정일 뿐이며, 실제 외부 요청 허용 여부는 위의 서버 변수와 DB `sources.enabled`가 함께 결정합니다. Umami DB 연결 문자열·관리자 비밀번호·API token은 Pages 환경에 두지 않습니다.

Pages build는 같은 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`로 경량 공개 `public_player_seo_manifest` view만 읽어 선수 SEO 스냅샷을 만든다. workflow의 `SEO_MANIFEST_REQUIRED=true`는 운영 전용 fail-closed 스위치이며 별도 secret이 아니다. 설정 누락, 공개 API 오류, 행 검증 실패, 빈 manifest면 build와 배포를 중단한다. service role/secret key 또는 private table 접근을 이 단계에 추가하지 않는다.

운영 배포는 `CI → current production read-only E2E → Deploy Supabase backend → production public read health → 새 build의 production-backed E2E → Release → Deploy GitHub Pages` 순서로만 진행한다. main CI는 backend 변경 전에 현재 production 공개 API에 새 정적 build를 연결해 검색·상세 브라우저 흐름을 확인한다. backend workflow는 migration 직후 publishable key로 SEO manifest, 선수 검색, 선수 상세를 각각 조회하며 HTTP 오류·빈 결과·5초 timeout 또는 2.5초 성능 예산 초과가 하나라도 있으면 실패한다. Pages workflow는 성공한 backend workflow의 정확한 commit SHA만 checkout하고 새 정적 build를 갱신된 production API에 연결한 read-only 검색·상세 E2E를 다시 통과시킨 뒤 같은 SHA로 tag와 Release를 생성한다. 이 게이트를 우회해 Pages를 먼저 수동 배포하지 않는다.

제품 버전은 루트 `package.json`에서만 관리하며 `YYYY.WEEK.SEQ` 형식이다. `SEQ`는 같은 ISO 주 안에서 `0`부터 순서대로 증가한다. 배포 변경을 준비할 때 `pnpm release:bump`를 실행하면 같은 ISO 주에는 순번을 하나 올리고 새 주에는 `0`으로 초기화한다. workspace package와 환경 변수에는 별도 제품 버전을 두지 않으며 web build도 루트 값을 직접 읽는다.

Pages workflow는 lint·typecheck·test·build를 먼저 통과시킨 뒤 `v{version}` 태그와 GitHub Release를 만들고 GitHub 자동 릴리즈 노트를 작성한다. release job이 성공해야 deploy job이 시작된다. 동일 태그가 현재 커밋을 가리키고 Release도 존재하면 재실행을 허용하지만, 다른 커밋을 가리키면 버전 미증가로 판단해 배포를 중단한다. 따라서 모든 배포 PR은 루트 `package.json` 버전 변경을 포함해야 한다.

web은 일반 path 라우팅을 사용하며 build 시 `index.html`과 동일한 `404.html`을 생성한다. GitHub Pages에서 `/search`나 `/players/:id`로 직접 접근할 때 이 fallback이 SPA를 부팅하고 React Router가 현재 path를 처리한다. 과거 `/#/search?...`와 `/#/players/:id` 링크는 앱 시작 전에 같은 path URL로 치환한다. 검색어는 계속 `?q=`에 두며 path segment나 분석 이벤트로 옮기지 않는다.

build는 추가로 `/search/index.html`, `/players/{public-id}/index.html`, `/robots.txt`, `/sitemap.xml`을 생성한다. 알려진 선수 URL은 HTTP 200 정적 문서에서 선수별 OG를 제공하고, 검색 문서는 `noindex,follow`이며 sitemap에는 홈과 생성된 선수만 포함한다. 선수 목록과 메타데이터는 배포 당시 스냅샷이므로 수집 후 즉시 반영되지 않는다. 새 선수 노출 또는 기존 선수 OG 갱신이 필요하면 정상 release 절차로 다시 배포한다. 배포 후 네 파일 유형을 직접 요청해 상태 코드와 초기 HTML을 확인한다.

`REFRESH_WORKER_TOKEN`은 GitHub repository secret으로 등록한 64자리 hex 값입니다. production environment secret이 아니라 main 예약 workflow와 Edge worker mode가 함께 읽는 repo-level secret이며 프런트와 로그에 전달하지 않습니다.

PAT는 배포 job에만 주입되며 프런트 build에 전달하지 않습니다. Supabase CLI의 passwordless login role로 migration을 적용하므로 DB 비밀번호를 CI에 보관하지 않습니다. `sb_publishable_...`은 브라우저용이고, `sb_secret_...`은 DB 비밀번호나 PAT가 아닙니다. 카카오 키는 Supabase Edge Secret에 두지만, 아이핑 자격증명은 GitHub `production` environment Secret에 두고 main 예약 workflow의 Playwright step에만 주입합니다. 아이핑을 켤 때는 계정 Secret과 repo-level `REFRESH_WORKER_TOKEN`을 먼저 등록한 뒤 `CRAWLER_SOURCE_IPING_ENABLED=true`, 마지막으로 DB `sources.enabled=true` 순서로 활성화합니다. `SUPABASE_PROJECT_ID`는 production environment뿐 아니라 main 예약 workflow가 읽을 repository variable에도 둡니다. 수동 `crawl-manual.yml`에는 production 환경을 연결하지 않으며, 운영 browser worker는 main branch guard와 production environment를 모두 통과해야 합니다. 자격증명·검색어·쿠키·HTML은 Actions 로그와 artifact에 출력하지 않습니다.

Edge Functions는 새 publishable key를 지원하기 위해 platform의 legacy JWT 검증을 끄고, 브라우저 mode에서 `apikey`를 `SUPABASE_PUBLISHABLE_KEYS`와 대조합니다. 아이핑 요청은 선수 이름 형태만 허용하고 같은 이름의 최근 6시간 성공 결과를 재사용하거나 service-role 전용 queue에 등록하며 `force=true`도 freshness·dedupe를 우회하지 않습니다. 분당 신규 4건·활성 12건의 DB admission budget이 공개 key를 이용한 대기열 독점을 제한합니다. worker mode는 64자리 hex `REFRESH_WORKER_TOKEN`만 허용합니다. `claim-iping-browser`가 한 job과 무작위 lease token만 반환하고, `complete-iping-browser`와 `fail-iping-browser`는 실행 중 job·source·lease 만료를 다시 대조합니다. complete payload는 화면별 150만 byte·합계 400만 byte로 제한하며 Edge parser를 통과한 정규화 기록만 저장합니다. `refresh_jobs`의 4분 lease, 최대 3회 시도, 15~60분 backoff, 24시간 pending 만료와 7일 terminal 보존이 재진입과 장애를 제한합니다. 일반 동기 출처는 기존 호출 제한과 수동 재시도 정책을 유지합니다.

아이핑 queue 운영 상태는 `Scheduled iPing refresh worker` Actions 실행과 private `refresh_jobs` 집계로 확인합니다. `queued`가 계속 증가하면 production의 계정 Secret, repository의 worker token·project variable, Edge 배포 상태와 GitHub runner의 Chrome 확인 단계를 순서대로 봅니다. `running`의 lease가 4분을 넘으면 다음 claim이 자동 회수합니다. `source_backlog_stopped`나 화면의 `보호 대기`가 나타나면 먼저 인증·구조·접근 차단 원인을 해결하고 `sources.enabled`, `CRAWL_LIVE`, `CRAWLER_SOURCE_IPING_ENABLED`, 계정 Secret을 확인합니다. 계정 Secret을 바꾸면 Edge 재배포는 필요하지 않으며, main의 `Scheduled iPing refresh worker`를 수동 실행해 mode를 `recover-iping`으로 한 번 선택합니다. 이 모드는 service-role RPC가 최근 24시간의 결정적 실패 작업 한 건만 재예약한 뒤 실제 Chrome으로 즉시 검증합니다. 작업이 `succeeded`로 끝난 경우에만 workflow가 통과합니다. `busy`, `reset_only`, 재시도 예약 또는 재인증 실패는 검증 미완료로 workflow를 실패시키므로 반복 실행하지 말고 원인을 확인합니다. 긴급 중지는 환경 변수와 DB source 스위치를 false로 내려 새 enqueue와 claim을 모두 막고 저장 기록은 삭제하지 않습니다. token 회전 시에는 새 repo secret으로 Supabase 배포 workflow를 실행해 Edge secret을 먼저 동기화한 뒤 예약 workflow를 재개합니다.

Edge가 장애를 기록할 때는 service role 전용 `record_source_refresh_failure` RPC에 출처 코드와 허용 목록의 오류 코드만 전달합니다. 검색어, query key, 원문 오류, 쿠키, HTML은 전달하거나 저장하지 않습니다. 다음 성공은 기존 record upsert 트랜잭션 안에서 `last_error_code`를 지우고 성공 시각과 parser version을 갱신합니다. 별도의 `record_source_request_outcome` RPC는 허용된 진단 메타데이터를 남기고 아이핑의 연속 실패 회로를 열거나 성공 시 초기화합니다. 이 회로 상태 기록이 실패하면 성공으로 가장하지 않고 안전한 갱신 실패를 반환합니다. `delete_expired_source_request_diagnostics`는 pg_cron으로 매일 실행되어 14일 초과 진단을 삭제합니다.

아이핑 enqueue에는 service-role HMAC 요청 원점별 10분 4건 제한도 적용합니다. 원본 IP는 저장하지 않고 budget hash는 하루 뒤 삭제하며, 전역 분당 4건·활성 12건 제한과 함께 단일 호출자의 대기열 독점을 막습니다.

## 동명이인 참여 편집

관리자 승인 queue는 사용하지 않습니다. 참여자는 검색 결과의 기록을 직접 입력한 탁구 별칭 하나 이상에 배정합니다. 저장된 별칭이 없는 첫 진입은 사람 한 명만 만들고 추천 목록에서 별칭 하나를 무작위로 제안합니다. 필요한 만큼 사람을 추가해 다른 무작위 제안을 받거나 문구를 직접 수정할 수 있습니다. 저장된 별칭이 있는 후보는 다음에 창을 열 때 기존 사람 그룹과 기록 배정을 복원합니다. 한 사람만 확실히 아는 경우 그 기록만 반영하고 나머지는 미분류로 둘 수 있습니다. 구분 근거는 별도로 입력받지 않으며 공개 이력에는 시스템 기본 사유를 남깁니다. 별칭은 동명이인 구분용이며 실제 실력이나 공식 등급이 아닙니다. 같은 이름 안의 별칭 중복을 막고 확실하지 않은 기록은 미분류로 둡니다. `submit-identity-claim`은 후보 수에 고정 상한을 두지 않고 별칭 길이·문자·연락처 형태, 중복 배정과 같은 정규화 이름의 활성 후보인지 서버에서 다시 확인합니다. 브라우저는 `crypto.randomUUID()`로 익명 편집자 ID를 한 번 만들고 `localStorage`에 보관하지만 사용자에게 기억하거나 입력하도록 요구하지 않습니다. Edge Function은 원문 ID를 서버 HMAC으로 즉시 변환하며 DB에는 HMAC만 남깁니다. 이 값은 인증 수단이 아니므로 브라우저 저장값을 지우거나 다른 기기를 사용해도 편집과 원복은 계속할 수 있습니다. 동일 브라우저 식별값은 이름별 24시간에 최대 3건, 전체 편집은 10분에 최대 30건으로 제한하고 숨겨진 honeypot 필드가 채워진 자동 제출은 저장하지 않습니다.

편집과 원복은 요청 단계에서 요청 원점별 10분 10건, 익명 편집자별 24시간 6건을 원자적으로 제한합니다. 전체 10분 30건 예산은 실제 변경 트랜잭션 안에서만 차감되므로 무효 후보나 존재하지 않는 편집번호로 전체 사용자의 예산을 소모할 수 없습니다. 변경·원복 근거는 검수된 선택지만 저장해 주소·연락처·생년월일 같은 개인정보가 공개 이력에 유입되는 경로를 차단합니다. 후보 전체 수는 제한하지 않지만 근거 조회는 100건씩 분할합니다.

전환 전에 접수되어 `pending` 상태로 남은 제보는 자동 병합하지 않고 migration에서 미반영 종결합니다. 참여자는 공개 참여 편집 화면에서 후보를 다시 선택하면 별도 코드 없이 즉시 반영할 수 있습니다.

`apply_identity_partition_internal`은 편집·그룹·후보 snapshot을 만들고 각 별칭 그룹의 대표 선수를 결정한 뒤 필요한 그룹 내부 병합과 별칭 반영을 한 트랜잭션에서 실행합니다. 대표 선수는 공개 결과 수, 출처 identity 수, 생성 시각과 내부 ID 순으로 안정적으로 정합니다. 선수와 대회 결과 행은 삭제하지 않으며 검색 화면은 `list_identity_edit_history`를 통해 편집번호, 근거, 후보별 별칭과 현재 상태를 공개합니다. HMAC과 내부 상세 감사 정보는 공개하지 않습니다.

잘못된 최신 편집은 검색 화면의 `참여 편집 이력 → 되돌리기`에서 누구나 검수된 원복 사유를 선택해 전체 원복할 수 있습니다. 기존 편집자의 코드나 동일 브라우저일 필요는 없습니다. `revert-identity-edit`은 참여 편집으로 생성된 작업만 허용하고 내부 `revert_identity_partition_internal`을 호출해 해당 편집의 그룹 병합과 별칭을 모두 되돌립니다. 후속 편집이나 현재 연결 충돌이 있으면 덮어쓰지 않고 충돌을 반환하며 최신 편집부터 역순으로 되돌립니다.

운영자는 승인자가 아니라 장애 대응자입니다. abuse가 발생하면 Edge Function 또는 feature flag를 일시 중지하고, 내부 `player_merge_review_log`와 rate-limit 로그로 원인을 조사합니다. 일반 사용자의 직접 table 쓰기와 service role 노출은 계속 금지합니다.

[source catalog migration](../supabase/migrations/202608120003_source_catalog.sql)은 production DB에 기본 source 메타데이터를 생성하고, 후속 migration이 검증을 마친 출처를 개별 활성화합니다. 합성 선수와 대회 데이터는 `seed.sql`에 남아 있어 `db push` production 배포에는 포함되지 않습니다.

Supabase point-in-time recovery/backup 정책, migration restore rehearsal, seed와 실제 데이터 분리를 production launch 전에 확인합니다.
