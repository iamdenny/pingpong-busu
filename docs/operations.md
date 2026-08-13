---
summary: "Supabase와 GitHub 배포, 출처 장애, 환경 전환과 데이터 보존 절차를 설명한다."
read_when:
  - production을 배포하거나 운영할 때
  - 출처 장애나 DB 용량 문제에 대응할 때
title: "운영"
---

# 운영

## 출처 장애

파서 오류가 증가하면 `sources.enabled=false`와 source 환경 변수 false를 적용하고 기존 저장 결과를 유지합니다. sanitized synthetic fixture로 구조 변경을 재현하고 parser version/test를 함께 올립니다. 내부 stack/secret은 공개 status에 반환하지 않습니다.

Supabase Edge의 에어핑퐁 요청은 5초 단일 시도 뒤 `source_timeout`과 5초 재시도 정보를 반환합니다. 화면은 최소 5초 간격으로 최대 2회 다시 Edge를 호출하며, 재시도 뒤에도 실패하면 시간 초과를 표시합니다. 수동 진단용 workspace live CLI에서는 에어핑퐁 16초, 오케이핑퐁 10초, 아이핑 12초 제한과 일시 오류 1회 재시도를 유지합니다. 아이핑이 `인증 실패`이면 Secret 값과 계정 상태를 확인하고, `사이트 구조 변경`이면 로그인 성공 화면 식별자가 달라졌는지 확인합니다. 로그인 POST는 중복 인증 시도를 막기 위해 자동 재시도하지 않습니다.

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

## Supabase 서버 배포

main 브랜치의 `CI`가 성공하면 [Deploy Supabase backend](../.github/workflows/deploy-supabase.yml)가 production environment에 다음 순서로 배포합니다.

1. 프로젝트 연결과 migration dry-run
2. `supabase db push`로 미적용 migration 적용
3. crawler 안전 플래그를 Edge Function secrets에 동기화
4. `refresh-player`, `refresh-status`, `submit-identity-claim` Edge Function 배포

이번 변경의 migration은 파일명 순서대로 적용해야 합니다.

1. `202608130001_reversible_player_merges.sql`: 삭제 없는 관리자 병합·원복 RPC와 감사 로그
2. `202608130002_bounded_source_retries.sql`: 출처·정규화 검색어별 5초 하한과 분당 4회 제한
3. `202608130003_division_observation_counts.sql`: 공개 검색 view의 체계·부수별 입상·참가 건수
4. `202608130004_iping_global_throttle.sql`: 인증형 아이핑 출처 전체의 60초 간격 제한
5. `202608130005_live_source_failure_state.sql`: 아이핑 제한을 검색어별로 되돌리고 안전한 출처 오류 상태 기록

배포 전 `supabase migration list --linked`와 `supabase db push --linked --dry-run`에서 다섯 파일의 순서를 확인합니다. `202608130004`는 이미 적용된 DB도 안전하게 다음 migration으로 교정할 수 있도록 기록으로 유지하며, 최종 동작은 `202608130005`가 정의한 검색어별 제한을 따른다. 배포 후에는 `player_merge_review_log`가 일반 공개 역할에 노출되지 않는지, `claim_source_request`와 출처 상태 기록 RPC가 service role 전용인지, `public_player_search.division_observations`가 조회되는지 확인합니다. 세 번째 migration의 view는 첫 번째 migration이 추가한 병합 선수 제외 조건을 유지하므로 일부만 골라 적용하지 않습니다.

GitHub의 `production` environment에 아래 값을 설정합니다.

| 구분      | 이름                                 | 용도                                                                                                       |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Secret    | `SUPABASE_ACCESS_TOKEN`              | Supabase Management API 배포 권한. `sbp_`로 시작하는 PAT                                                   |
| Variable  | `SUPABASE_PROJECT_ID`                | Supabase project ref                                                                                       |
| Variable  | `CRAWL_LIVE`                         | 운영 crawler 전체 스위치. 기본 `false`                                                                     |
| Variable  | `CRAWLER_SOURCE_ASTREE_ENABLED`      | 애즈트리 adapter 스위치. 기본 `false`                                                                      |
| Variable  | `CRAWLER_SOURCE_TTADIVISION_ENABLED` | 대한탁구협회 디비전 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                  |
| Variable  | `CRAWLER_SOURCE_MYTT_ENABLED`        | 마이티티 공개 참가 정보 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`              |
| Variable  | `CRAWLER_SOURCE_SUPERSTAR_ENABLED`   | 슈퍼스타탁구 공개 개인별 결과 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`        |
| Variable  | `CRAWLER_SOURCE_YONGINTT_ENABLED`    | 용인탁구협회 다음 카페 공식 검색 API adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false` |
| Variable  | `CRAWLER_SOURCE_AIRPING_ENABLED`     | 에어핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                             |
| Variable  | `CRAWLER_SOURCE_OKPINGPONG_ENABLED`  | 오케이핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                           |
| Variable  | `CRAWLER_SOURCE_IPING_ENABLED`       | 아이핑 인증형 adapter 스위치. 전용 계정 Secret 설정 전 기본 `false`                                        |
| Generated | `CRAWLER_USER_AGENT`                 | 배포 시 루트 package 버전으로 만드는 `BUSU/{version}` 출처 요청 식별자                                     |
| Variable  | `CRAWLER_SOURCE_MIN_INTERVAL_MS`     | 아이핑을 포함한 출처·정규화 검색어별 최소 호출 간격. 5~60초 범위, 기본 5초                                 |
| Secret    | `KAKAO_REST_API_KEY`                 | 카카오 공식 Daum 카페 검색 API 키. 브라우저와 로그에 노출하지 않음                                         |
| Secret    | `IPING_USERNAME`                     | 아이핑 조회 전용 최소권한 계정 ID. Supabase Edge 런타임에만 전달                                           |
| Secret    | `IPING_PASSWORD`                     | 아이핑 조회 전용 계정 비밀번호. Supabase Edge 런타임에만 전달                                              |

GitHub Pages repository variables에는 `VITE_APP_MODE=production`, `VITE_APP_BASE_PATH=/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SOURCE_REFRESH_ENABLED=true`를 설정합니다. 커스텀 도메인은 `https://busu.iamdenny.com/` 루트에서 서비스하므로 asset base도 `/`여야 합니다. 이 중 source refresh 값은 브라우저에서 갱신 UI를 켜는 공개 설정일 뿐이며, 실제 외부 요청 허용 여부는 위의 서버 변수와 DB `sources.enabled`가 함께 결정합니다.

제품 버전은 루트 `package.json`에서만 관리하며 `YYYY.WEEK.SEQ` 형식이다. `SEQ`는 같은 ISO 주 안에서 `0`부터 순서대로 증가한다. 배포 변경을 준비할 때 `pnpm release:bump`를 실행하면 같은 ISO 주에는 순번을 하나 올리고 새 주에는 `0`으로 초기화한다. workspace package와 환경 변수에는 별도 제품 버전을 두지 않으며 web build도 루트 값을 직접 읽는다.

Pages workflow는 lint·typecheck·test·build를 먼저 통과시킨 뒤 `v{version}` 태그와 GitHub Release를 만들고 GitHub 자동 릴리즈 노트를 작성한다. release job이 성공해야 deploy job이 시작된다. 동일 태그가 현재 커밋을 가리키고 Release도 존재하면 재실행을 허용하지만, 다른 커밋을 가리키면 버전 미증가로 판단해 배포를 중단한다. 따라서 모든 배포 PR은 루트 `package.json` 버전 변경을 포함해야 한다.

PAT는 배포 job에만 주입되며 프런트 build에 전달하지 않습니다. Supabase CLI의 passwordless login role로 migration을 적용하므로 DB 비밀번호를 CI에 보관하지 않습니다. `sb_publishable_...`은 브라우저용이고, `sb_secret_...`은 DB 비밀번호나 PAT가 아닙니다. 카카오 키와 아이핑 자격증명은 GitHub Actions가 Supabase Edge Secret으로 전달하며 프런트 build에는 주입하지 않습니다. 아이핑을 켤 때는 두 Secret을 먼저 등록한 뒤 `CRAWLER_SOURCE_IPING_ENABLED=true`, 마지막으로 DB `sources.enabled=true` 순서로 활성화합니다. 어느 하나라도 없으면 요청하지 않습니다. 수동 `crawl-manual.yml`은 보호 규칙 없는 브랜치에 운영 Secret을 노출하지 않도록 `production` environment를 연결하지 않습니다. dispatch 문자열은 step 환경 변수로 전달하고 `CRAWLER_REDACT_QUERY=true`로 선수 검색어를 Actions 출력에서 가립니다. 수동 아이핑 운영 계정 검증은 GitHub `production` 환경을 `main`으로 제한하고 required reviewer를 설정한 뒤에만 별도로 활성화합니다.

Edge Functions는 새 publishable key를 지원하기 위해 platform의 legacy JWT 검증을 끄고, 함수 내부에서 `apikey`를 `SUPABASE_PUBLISHABLE_KEYS`와 대조합니다. 일반 호출은 같은 이름의 최근 6시간 성공 결과를 재사용할 수 있지만, 현재 검색 화면은 사용자의 명시적 검색마다 `force=true`를 전달합니다. 서버는 강제 갱신에도 아이핑을 포함한 `출처 + 정규화 검색어`별 5~60초 범위의 최소 호출 간격과 1분당 최대 4회 제한을 적용하며 `source_request_throttles`에 제한 구간과 시도 횟수를 저장합니다. 다른 이름 검색은 출처 전체 잠금 때문에 대기하지 않지만 아이핑은 `source_request_budgets`에서 계정 단위 분당 실제 요청 6회 예산을 원자적으로 적용합니다. 제한 응답이나 에어핑퐁 5초 단일 시도의 시간 초과에 `retryAfterMs`가 있으면 프런트가 남은 시간을 표시하고 최대 2회 자동 재시도합니다. 에어핑퐁 시간 초과 재시도 사이에는 최소 5초를 두며 아이핑 인증 시간 초과·인증·파서 실패는 자동 반복하지 않습니다. 실패 행의 수동 재시도는 출처별로 현재 검색 화면에서 최대 3회이며 5초 쿨다운을 두고, 성공하면 횟수를 초기화합니다. 페이지를 새로 열어 클라이언트 횟수가 초기화돼도 서버 제한은 계속 적용됩니다. publishable key 자체는 비밀이 아니므로 트래픽 증가 시 CAPTCHA, gateway rate limit 또는 사용자 단위 quota를 추가해야 합니다.

Edge가 장애를 기록할 때는 service role 전용 `record_source_refresh_failure` RPC에 출처 코드와 허용 목록의 오류 코드만 전달합니다. 검색어, query key, 원문 오류, 쿠키, HTML은 전달하거나 저장하지 않습니다. 다음 성공은 기존 record upsert 트랜잭션 안에서 `last_error_code`를 지우고 성공 시각과 parser version을 갱신합니다. 별도 성공 상태 RPC를 두지 않아 동시 조회의 완료 순서를 뒤집지 않으며, 실패 상태 기록 자체가 실패해도 사용자에게 반환할 원래 출처 오류를 다른 오류로 덮지 않습니다.

## 동명이인 제보 검토

참여자 제보는 `submit-identity-claim`이 같은 정규화 이름의 후보인지 서버에서 다시 확인한 뒤 `identity_claims.status=pending`으로 저장합니다. 사용자가 정한 숫자 4자리 원문은 저장하지 않고 Edge Function에서 서버 HMAC으로 즉시 변환합니다. 동일 확인값은 24시간에 최대 3건, 전체 제보는 10분에 최대 30건으로 제한하고 숨겨진 honeypot 필드가 채워진 자동 제출은 저장하지 않습니다.

운영자는 Supabase Studio의 SQL Editor에서 service role만 읽을 수 있는 `identity_claim_review_queue`를 확인합니다. 후보별 원문 출처와 소속·지역을 별도로 대조한 후 다음처럼 상태를 변경합니다.

```sql
update public.identity_claims
set status = 'approved',
    reviewed_by = 'iamdenny',
    review_note = '출처와 소속 이력을 확인함'
where id = '<claim-id>'
  and status = 'pending';
```

반려는 `status='rejected'`로 기록합니다. 상태 변경 trigger가 이전·다음 상태와 처리 정보를 `identity_claim_reviews`에 남깁니다. 승인은 검토 완료 표시일 뿐 선수를 자동 병합하지 않습니다.

승인된 후보를 병합할 때는 삭제나 직접 `player_id` 수정을 하지 않고 service role 전용 RPC를 사용합니다. 첫 UUID는 유지할 대상 선수, 배열은 그 대상으로 합칠 후보입니다. 승인 제보를 근거로 삼는 경우 제보 ID까지 전달하며, RPC가 후보 집합과 정규화 이름을 다시 검증합니다.

```sql
select public.merge_players_internal(
  '<target-player-public-id>'::uuid,
  array['<source-player-public-id>']::uuid[],
  'iamdenny',
  '원문 대회와 소속 이력을 대조해 동일인으로 확인함',
  '<approved-claim-id>'::uuid
);
```

반환된 UUID가 병합 작업 ID입니다. `player_merge_review_log`에서 대상·원본 후보·처리 사유·원복 여부를 확인할 수 있습니다. 병합은 원본 선수와 대회 결과를 삭제하지 않고 출처 identity 연결만 이동합니다.

잘못 병합했다면 같은 작업 ID로 원복합니다.

```sql
select public.revert_player_merge_internal(
  '<merge-operation-id>'::uuid,
  'iamdenny',
  '원문 출처를 재확인해 서로 다른 동명이인으로 판정함'
);
```

원복 RPC는 병합 당시 저장한 선수 상태, 출처 identity의 이전 선수 연결과 match 상태를 복구합니다. 병합 뒤 해당 연결이 별도로 수정됐거나 같은 대상 선수에 더 최근 병합이 있으면 자동 실행하지 않고 오류를 냅니다. 이 경우 `player_merge_review_log`에서 최신 작업부터 역순으로 검토·원복합니다. 원복 전후에는 검색 결과에서 후보 수와 각 후보의 원문 대회·종목이 다시 분리되는지 확인합니다.

[source catalog migration](../supabase/migrations/202608120003_source_catalog.sql)은 production DB에 기본 source 메타데이터를 생성하고, 후속 migration이 검증을 마친 출처를 개별 활성화합니다. 합성 선수와 대회 데이터는 `seed.sql`에 남아 있어 `db push` production 배포에는 포함되지 않습니다.

Supabase point-in-time recovery/backup 정책, migration restore rehearsal, seed와 실제 데이터 분리를 production launch 전에 확인합니다.
