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

GitHub의 `production` environment에 아래 값을 설정합니다.

| 구분     | 이름                                 | 용도                                                                                                       |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Secret   | `SUPABASE_ACCESS_TOKEN`              | Supabase Management API 배포 권한. `sbp_`로 시작하는 PAT                                                   |
| Variable | `SUPABASE_PROJECT_ID`                | Supabase project ref                                                                                       |
| Variable | `CRAWL_LIVE`                         | 운영 crawler 전체 스위치. 기본 `false`                                                                     |
| Variable | `CRAWLER_SOURCE_ASTREE_ENABLED`      | 애즈트리 adapter 스위치. 기본 `false`                                                                      |
| Variable | `CRAWLER_SOURCE_TTADIVISION_ENABLED` | 대한탁구협회 디비전 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                  |
| Variable | `CRAWLER_SOURCE_MYTT_ENABLED`        | 마이티티 공개 참가 정보 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`              |
| Variable | `CRAWLER_SOURCE_SUPERSTAR_ENABLED`   | 슈퍼스타탁구 공개 개인별 결과 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`        |
| Variable | `CRAWLER_SOURCE_YONGINTT_ENABLED`    | 용인탁구협회 다음 카페 공식 검색 API adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false` |
| Variable | `CRAWLER_SOURCE_AIRPING_ENABLED`     | 에어핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                             |
| Variable | `CRAWLER_SOURCE_OKPINGPONG_ENABLED`  | 오케이핑퐁 adapter 스위치. production workflow 기본 `true`, 긴급 중지 시 `false`                           |
| Variable | `CRAWLER_SOURCE_IPING_ENABLED`       | 아이핑 인증형 adapter 스위치. 전용 계정 Secret 설정 전 기본 `false`                                        |
| Variable | `CRAWLER_USER_AGENT`                 | 출처 요청 식별자                                                                                           |
| Variable | `CRAWLER_SOURCE_MIN_INTERVAL_MS`     | 출처·정규화 검색어별 최소 호출 간격. 기본 2초                                                              |
| Secret   | `KAKAO_REST_API_KEY`                 | 카카오 공식 Daum 카페 검색 API 키. 브라우저와 로그에 노출하지 않음                                         |
| Secret   | `IPING_USERNAME`                     | 아이핑 조회 전용 최소권한 계정 ID. Supabase Edge 런타임에만 전달                                           |
| Secret   | `IPING_PASSWORD`                     | 아이핑 조회 전용 계정 비밀번호. Supabase Edge 런타임에만 전달                                              |

GitHub Pages repository variables에는 `VITE_APP_MODE=production`, `VITE_APP_BASE_PATH=/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SOURCE_REFRESH_ENABLED=true`를 설정합니다. 커스텀 도메인은 `https://busu.iamdenny.com/` 루트에서 서비스하므로 asset base도 `/`여야 합니다. 이 중 source refresh 값은 브라우저에서 갱신 UI를 켜는 공개 설정일 뿐이며, 실제 외부 요청 허용 여부는 위의 서버 변수와 DB `sources.enabled`가 함께 결정합니다.

PAT는 배포 job에만 주입되며 프런트 build에 전달하지 않습니다. Supabase CLI의 passwordless login role로 migration을 적용하므로 DB 비밀번호를 CI에 보관하지 않습니다. `sb_publishable_...`은 브라우저용이고, `sb_secret_...`은 DB 비밀번호나 PAT가 아닙니다. 카카오 키와 아이핑 자격증명은 GitHub Actions가 Supabase Edge Secret으로 전달하며 프런트 build에는 주입하지 않습니다. 아이핑을 켤 때는 두 Secret을 먼저 등록한 뒤 `CRAWLER_SOURCE_IPING_ENABLED=true`, 마지막으로 DB `sources.enabled=true` 순서로 활성화합니다. 어느 하나라도 없으면 요청하지 않습니다.

Edge Functions는 새 publishable key를 지원하기 위해 platform의 legacy JWT 검증을 끄고, 함수 내부에서 `apikey`를 `SUPABASE_PUBLISHABLE_KEYS`와 대조합니다. 일반 호출은 같은 이름의 최근 6시간 성공 결과를 재사용할 수 있지만, 현재 검색 화면은 사용자의 명시적 검색마다 `force=true`를 전달합니다. 서버는 강제 갱신에도 `출처 + 정규화 검색어`별 최소 호출 간격을 적용하며 `source_request_throttles`에는 이 중복 방지 시각만 저장합니다. 제한 응답의 `retryAfterMs` 또는 외부 출처의 `Retry-After`가 있으면 프런트가 남은 시간을 표시하고 최대 2회 재시도합니다. publishable key 자체는 비밀이 아니므로 트래픽 증가 시 CAPTCHA, gateway rate limit 또는 사용자 단위 quota를 추가해야 합니다.

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

반려는 `status='rejected'`로 기록합니다. 상태 변경 trigger가 이전·다음 상태와 처리 정보를 `identity_claim_reviews`에 남깁니다. 승인은 검토 완료 표시일 뿐 선수를 자동 병합하지 않으며, canonical merge/split은 별도 운영 기능이 구현되기 전까지 수행하지 않습니다.

[source catalog migration](../supabase/migrations/202608120003_source_catalog.sql)은 production DB에 기본 source 메타데이터를 생성하고, 후속 migration이 검증을 마친 출처를 개별 활성화합니다. 합성 선수와 대회 데이터는 `seed.sql`에 남아 있어 `db push` production 배포에는 포함되지 않습니다.

Supabase point-in-time recovery/backup 정책, migration restore rehearsal, seed와 실제 데이터 분리를 production launch 전에 확인합니다.
