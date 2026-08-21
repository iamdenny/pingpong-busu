---
summary: "Cloudflare와 셀프 호스트 Umami의 제품 분석 이벤트, 개인정보 최소화, 배포와 이전 절차를 설명한다."
read_when:
  - 제품 이벤트를 추가하거나 분석 대시보드를 운영할 때
  - Umami를 배포·백업·이전할 때
title: "제품 분석"
---

# 제품 분석

BUSU는 Cloudflare Web Analytics로 기본 방문·성능을 확인하고, 셀프 호스트 Umami로 제품 사용 흐름을 분석한다. Umami는 별도 Vercel 애플리케이션과 Neon PostgreSQL에 배포하고 `analytics.iamdenny.com` 전용 호스트를 연결한다. GitHub Pages의 BUSU 앱에는 이 호스트의 공개 tracker 주소와 website ID만 둔다.

## 수집 원칙

- 페이지 조회 URL에서는 query string을 제외한다. `/search?q=...`는 `/search`로 집계한다.
- 검색어는 별도 `search_submitted` 이벤트에서만 보낸다. 선수 이름은 한글 2~6자 또는 제한된 영문 이름만, 지역은 검토된 광역 지역·도시 별칭이나 `시·군·구·도` 구조만 허용한다.
- 이름과 지역 이외의 자유 문장, 상세 주소, 이메일, 숫자열과 연락처 형태는 전송하지 않는다.
- 문의 본문, 동명이인 별칭, 편집 근거, User-Agent 원문, IP 주소, 이메일·전화번호·주소·전체 생년월일은 custom event data로 전송하지 않는다.
- 로그인 사용자 ID나 별도의 영구 방문자 ID를 설정하지 않고 세션 리플레이·히트맵·브라우저 핑거프린팅을 사용하지 않는다.
- tracker가 없거나 차단·오류가 발생해도 검색, 링크 이동, 참여 편집과 문의 제출은 그대로 동작한다.
- HTML Content Security Policy도 실행·전송 대상을 Cloudflare, BUSU Supabase와 `analytics.iamdenny.com`으로 제한한다.

Umami 자체의 기본 방문 분석에는 페이지 경로, referrer, 기기·브라우저 종류와 대략적인 지역 집계가 포함될 수 있다. 운영자는 개인을 식별하려 하지 않고 집계된 제품 의사결정에만 사용한다.

## 이벤트 사전

| 이벤트                         | 시점                    | 속성                                                                |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------- |
| `search_submitted`             | 검색 결과가 처음 확정됨 | 검증된 `query`, `result_bucket` (`0`, `1`, `2-5`, `6-20`, `21+`)    |
| `search_result_clicked`        | 선수 결과 카드 선택     | `player_id`, 1부터 시작하는 `position`, `result_tab`                |
| `trending_player_clicked`      | 홈 조회 순위 항목 선택  | `player_id`, 1부터 시작하는 `position`                              |
| `division_filter_selected`     | 부수 요약 필터 선택     | `division_system`, `division`, `award_count`, `participation_count` |
| `search_result_tab_selected`   | 입상/출전 탭 전환       | `result_tab`                                                        |
| `direct_source_search_clicked` | 원문 사이트 직접 검색   | `source_code`                                                       |
| `source_catalog_clicked`       | 홈의 출처 URL 선택      | `source_code`, `source_enabled`                                     |
| `player_detail_tab_selected`   | 선수 상세 탭 전환       | `player_id`, `detail_tab`                                           |
| `player_source_clicked`        | 선수 기록의 원문 선택   | `player_id`, `source_code`                                          |
| `identity_edit_submitted`      | 동명이인 참여 편집 성공 | `candidate_count`, `group_count`                                    |
| `feedback_submitted`           | 문의·제보 등록 성공     | `category`만 전송, 본문 제외                                        |

이벤트 이름과 속성은 장기 대시보드의 계약이다. 자유 입력 문자열을 새 속성으로 추가하려면 민감정보 차단과 길이 제한 테스트를 먼저 추가한다.

## 대시보드 질문

- 수요: 인기 검색어, 결과 없음 비율, 검색어별 반복 수요
- 탐색: 검색→선수 상세 전환율, 결과 순서별 클릭률, 입상/출전 탭 선호
- 데이터 가치: 선수별 상세 조회와 원문 확인율, 출처별 원문 이동량
- 참여: 상세 조회 대비 동명이인 편집·문의 전환율과 문의 분류
- 획득: referrer·캠페인별 방문, 검색 실행, 선수 상세 및 원문 이동 퍼널

홈의 조회 순위는 이 분석 이벤트가 아니라 Supabase의 자체 집계를 사용한다. 제품 화면이 분석 스택 가용성에 의존하지 않게 하고, 분석 데이터를 제품 노출로 되돌려 쓰지 않기 위해서다.

검색어·선수별 장기 추이는 event data로 분석하고, 개인 사용자를 재식별하거나 개별 행동 이력을 영업 대상으로 사용하지 않는다.

## 셀프 호스트 배포

1. 공식 `umami-software/umami` 저장소를 전용 저장소로 fork한다.
2. Neon Free에 BUSU 분석 전용 프로젝트와 production branch를 만들고 pooled PostgreSQL 연결 문자열을 복사한다.
3. fork를 Vercel Hobby에 import하고 `DATABASE_URL`에 Neon 연결 문자열을 Secret으로 설정한다. Umami 버전이 요구하면 같은 값을 `POSTGRES_PRISMA_URL`에도 설정한다.
4. 배포 뒤 기본 관리자 비밀번호를 즉시 변경하고 `busu.iamdenny.com` website를 추가한다.
5. GitHub Pages repository variables에 다음 공개 값을 설정한다.
   - `VITE_UMAMI_SCRIPT_URL=https://analytics.iamdenny.com/script.js`
   - `VITE_UMAMI_WEBSITE_ID=<BUSU website UUID>`
6. Vercel custom domain에 `analytics.iamdenny.com`을 연결하고 Cloudflare DNS·TLS가 정상인지 확인한다. BUSU는 보안을 위해 이 정확한 origin의 `/script.js`만 실행한다.
7. BUSU를 배포하고 `/`, `/search?q=김탁구`, `/players/<id>`를 이동한 뒤 Umami Realtime에서 path에 query가 없고 이벤트 속성이 사전과 일치하는지 확인한다.

`DATABASE_URL`, Neon 비밀번호, Umami 관리자 자격 증명과 API token은 BUSU 저장소, GitHub Pages variables, 브라우저 번들에 넣지 않는다. Vercel 환경 변수는 Production/Preview 범위를 분리하고 Preview는 별도 DB 또는 분석 비활성화를 기본으로 한다.

## 보존·백업·이전

셀프 호스트 데이터는 Umami Cloud Hobby의 6개월 보존 제한을 따르지 않는다. 실제 보존 기간은 Neon 저장 공간과 운영 정책으로 결정한다.

- 매월 DB 크기와 이벤트 증가량을 확인하고 Neon Free 한도의 70%에서 유료 전환 또는 archive를 결정한다.
- 분기마다 `pg_dump`의 custom format 백업을 암호화된 운영 보관소에 만들고 복원 연습을 한다.
- 이전할 때 Umami를 maintenance 상태로 두고 마지막 `pg_dump`, 새 PostgreSQL의 `pg_restore`, Umami migration, event/pageview 건수와 최근 시각 비교 순서로 검증한다.
- 백업에는 방문 분석 데이터가 포함되므로 공개 저장소나 일반 파일 공유 서비스에 올리지 않고 접근 권한과 삭제 일정을 관리한다.

Umami 애플리케이션 버전은 월 1회 release note와 migration을 확인하고 Preview에서 업그레이드·복원을 검증한 뒤 production에 반영한다.
