---
summary: "선수 identity, 대회 결과, 부수 체계, 시간축과 revision 저장 규칙을 설명한다."
read_when:
  - Supabase schema나 public view를 변경할 때
  - 부수·입상·동명이인 데이터 규칙을 확인할 때
title: "데이터 모델"
---

# 데이터 모델

## 익명 문의·제보 outbox

`feedback_reports`는 public API에 노출하지 않는 service-role 전용 전달 outbox다. `submission_id`와 `payload_hash`가 재시도 멱등성을 보장하고, 전체 요청량 예산은 트랜잭션 안에서 원자적으로 검사한다. 상태는 `pending → delivering → published`이며 GitHub 응답을 확정할 수 없으면 `delivery_unknown`으로 두고 고유 marker로 조정한다. `published` 전환 시 message, page URL, User-Agent, 언어와 viewport는 즉시 null 처리하고 Issue 번호·URL과 비민감 전달 메타데이터만 보존한다.

## 선수 조회 순위 집계

`player_view_counts`는 `선수 + 시간 bucket`별 고유 세션 수만 담는 service-role 전용 집계다. `player_view_origins`는 같은 원점이 같은 선수를 한 시간에 두 번 올리지 못하게 막는 `(origin hash, 선수, bucket)` marker이며, 원점은 service-role HMAC-SHA-256 해시로만 저장하고 원본 주소·User-Agent·검색어·referrer는 schema에 없다. 한 원점은 한 시간에 최대 60명까지만 올릴 수 있다.

`public_trending_players`는 최근 24시간 합계 기준 상위 10명만 내보내는 view다. 고유 세션 5회 미만인 선수와 병합된 선수는 제외하고, 순위·공개 ID·이름·대표 지역·대표 소속·별칭만 노출하며 조회 수 자체는 내보내지 않는다. 집계가 private table이므로 이 view만 view 소유자 권한으로 실행하고 anon에는 view select만 부여한다. `prune_player_view_counts_internal`은 25시간이 지난 두 table의 행을 삭제하고 `pg_cron`이 매시 실행한다.

## 운영 오류 집계

`operational_incidents`는 허용된 category, query/hash 없는 route, 선택적인 출처 코드·parser version으로 만든 SHA-256 fingerprint별 집계다. 출처 fingerprint에는 앱 버전을 포함하지만 공개 브라우저 보고는 임의 버전 회전으로 fingerprint를 늘릴 수 없도록 category와 고정 route template만 사용한다. 브라우저는 `render_error`, `uncaught_error`, `unhandled_rejection`, 출처는 `source_schema_changed`, `source_auth_failed`만 허용한다. `operational_incident_events.event_id`가 같은 전송 재시도를 멱등 처리하고, 서로 다른 event는 원자적으로 `occurrence_count`와 `last_seen_at`을 늘린다. 검색어·선수명·메시지·stack·원문 URL·HTML/body·쿠키·자격증명·세션 또는 기기 fingerprint는 schema에 없다.

게시 상태는 `pending`, `delivering`, `delivery_unknown`, `failed`, `published`이며 3회 미만은 `pending`으로 유지한다. 브라우저와 신뢰된 출처 범위를 분리한 10분당 최대 300개 event의 `operational_incident_ingestion_budgets`와 시간당 최대 5건의 `operational_incident_publication_budgets`가 저장·게시 폭주를 각각 제한한다. 따라서 공개 브라우저 요청이 출처 장애 보고 용량을 소진할 수 없다. GitHub 본문의 정확한 fingerprint marker로 모호한 전달을 조정하고 Issue 번호·URL만 연결한다. 네 table과 모든 mutation/purge RPC는 RLS와 revoke를 적용한 service-role 전용 경계다. `purge_operational_incidents_internal`은 최소 30일이 지났고 현재 전달 중이 아닌 집계를 삭제하고 2일이 지난 수집·게시 예산을 정리하며 `pg_cron`이 매일 실행한다.

`sources`는 adapter 상태, `players`와 `clubs`는 canonical entity, `source_player_identities`는 출처별 후보를 담습니다. 이름 하나만으로 identity를 연결하지 않습니다. 출처에 적힌 소속은 `source_player_identities.source_club_text`와 `results.club_text`에 원문 증거로 보존하지만 crawler가 `clubs`를 만들거나 `players.primary_club_id`로 자동 승격하지 않습니다. 대표 소속은 별도의 검토를 거친 canonical metadata입니다. `tournaments`와 `results`는 정규화된 기록이며 `result_revisions`는 실제 내용 변경만 보존합니다. `source_refreshes`는 조회 요약입니다. `source_request_throttles`는 일반 동기 출처의 `출처 + 정규화 검색어`별 마지막 호출 시각, 1분 제한 시작 시각과 시도 횟수를 보존합니다. `source_request_budgets`는 출처 회로 상태와 아이핑 queue의 분당 신규 4건 admission budget을 원자적으로 관리합니다. 실제 아이핑 요청 빈도는 5분 예약 workflow와 한 실행당 한 job 제한으로 제어합니다. `identity_partition_operations`는 한 번의 동명이인 분류 편집, `identity_partition_groups`는 탁구 별칭별 대표 선수와 내부 merge, `identity_partition_members`는 후보별 별칭과 이전 상태 snapshot을 담습니다. 기존 `identity_claims` 계열은 배포 전환기의 단일 병합 이력 호환을 위해 유지합니다. `correction_requests`와 `rule_sets`는 후속 기능의 schema입니다.

`refresh_jobs`는 현재 아이핑 비동기 수집의 service-role 전용 큐다. payload는 서버가 선수 이름 형태로 검증한 2~30자 `{name}` 하나만 허용하며 자격증명·쿠키·HTML·연락처·생년월일·주소를 저장하지 않는다. `source_id + query_key + 6시간 bucket` 고유성이 중복 enqueue를 막고 활성 작업은 최대 12개다. `status`, `next_attempt_at`, `attempt_count`가 예약 상태와 최대 3회 시도를 표현한다. worker는 `lease_token`, `lease_expires_at`으로 한 작업을 4분 동안 단독 소유하고, 성공하면 `source_refresh_id`로 정규화 결과의 조회 요약을 연결한다. 대기 작업은 24시간 뒤 만료하고 terminal 작업 메타데이터는 7일 뒤 삭제한다.

기록 시간축은 대회 개최일 `tournaments.held_on`을 우선합니다. 게시판형 출처가 대회일을 제공하지 않으면 `results.source_published_on`을 사용하고, 공개 view의 `sort_date`는 두 값을 이 순서로 합성합니다. 크롤러의 `last_checked_at`은 동일 날짜의 보조 정렬 기준일 뿐 경기·게시 시점을 대신하지 않습니다.

`results.rank_text`가 우승·준우승·1~3위·2강·4강을 나타낼 때만 입상으로 집계합니다. 단, `예선 12조 3위`나 `조별 1위`처럼 예선·조별 문맥의 순위는 숫자 등수가 있어도 참가 이력입니다. 8강 이하와 예선·본선 진출은 참가 이력으로 보존하지만 `public_player_search.result_count` 및 화면의 입상 필터에는 포함하지 않습니다. `public_player_search.award_results`는 입상 등수·대회명·원문 종목명과 `대회일 → 게시일` 기준 날짜를 최신순 JSON 배열로 제공하고, `latest_participation_date`, `latest_participation_tournament`, `latest_participation_event`는 입상이 아닌 최근 출전의 날짜·대회명·원문 종목명을 제공합니다. 전환일 이전 및 대회별 지역부수 예외 기록은 원문 이력에 남지만 이 검색 요약용 건수·입상·출전 필드에서는 제외합니다. 검색 화면은 `identity_status = verified`인 참여 편집 결과를 우선하고, 나머지는 입상일 또는 최근 출전일이 없을 때만 확인 시각을 보조 기준으로 사용합니다. `primary_region`과 `primary_club` 출력은 이 시간축에서 가장 최근의 비어 있지 않은 `tournaments.region`·출처 지역 및 `results.club_text`·출처 소속을 사용하고 관측값이 없을 때만 선수의 검토된 대표값으로 대체합니다. 애플리케이션의 `isAwardRank`와 DB의 `is_award_rank`는 같은 판정 기준을 사용합니다.

`results.natural_key_hash`는 출처별 원본 증거와 revision을 구분하므로 교차 출처 중복을 제거하지 않습니다. 공개 표시용 `result_display_fingerprint`는 이미 연결된 한 선수 안에서 실제 대회일·정규화한 대회명·종목·종목 유형·유효 부수 체계와 값·정규화한 입상 결과·파트너가 모두 일치할 때만 사용합니다. `public_result_groups`는 대표 행 한 개와 모든 출처의 원본 ID·URL을 함께 내보내며 원본 `results`를 수정하지 않습니다. 날짜나 핵심 필드가 없거나 같은 출처 안에 동일 fingerprint가 둘 이상이면 해당 기록은 각각 유지합니다.

`public_player_search.primary_region`은 `이름 지역` 검색의 부분 일치 필터에 사용합니다. 지역어는 외부 출처의 선수명 검색어에 포함하지 않습니다. 지역은 공개 대회 기록 기반 추정값이므로 동일인 자동 병합이나 거주지 판단의 단독 근거로 쓰지 않습니다.

`identity_partition_operations.editor_hash`는 브라우저가 자동 생성한 임의의 익명 편집자 ID를 서버 전용 key로 HMAC한 값입니다. 브라우저 ID 원문, 비밀번호, 휴대폰 번호, 생년월일은 저장하지 않습니다. 익명 편집자 ID는 abuse 제한을 보조하는 가명 식별자일 뿐 인증이나 원복 권한이 아닙니다. 동일 이름에 대한 빈도 제한은 이 HMAC과 `normalized_name`을 함께 사용합니다. `fingerprint`는 별칭과 각 그룹의 공개 선수 ID를 정렬한 canonical JSON의 SHA-256이며 중복 편집 판정에만 사용합니다. 후보 수에는 고정 상한을 두지 않고 같은 정규화 이름의 활성 후보만 분류할 수 있습니다.

`players.homonym_nickname`은 사용자가 입력하고 NFKC·공백 정규화를 거친 2~20자 표시 문자열을 저장합니다. 별칭은 한글이나 영문을 반드시 포함하고 제한된 문자만 허용하며, Edge Function이 연락처 형태와 같은 이름 안의 중복을 거부합니다. 별칭은 동명이인 기록 구분자일 뿐 실제 플레이 스타일·실력·부수·공식 등급이 아닙니다.

`identity_community_request_budgets`는 gateway 요청 원점과 익명 편집자 ID를 각각 서버 HMAC한 scope를 요청 단계에서 원자적으로 잠그고, 전체 scope는 실제 편집·원복 트랜잭션 안에서 성공할 때만 차감합니다. 따라서 무효 요청은 해당 요청자 예산에는 반영되지만 전체 사용자 예산을 고갈시키지 않습니다. 공개 이력의 변경·원복 근거는 검수된 구조화 사유만 저장하고 자유 입력은 저장하지 않습니다. 후보 총수에는 상한을 두지 않되 근거 조회 RPC는 100건씩 분할합니다.

참여 편집은 별칭 그룹 안에 후보가 둘 이상일 때 `identity_merge_operations`, `identity_merge_operation_players`, `identity_merge_operation_identities`에 병합 전 선수 상태·출처 identity 연결·match 상태를 저장합니다. 한 명뿐인 그룹도 partition member snapshot으로 이전 별칭과 identity 상태를 보존합니다. 원본 `players`, `source_player_identities`, `results` 행은 삭제하지 않습니다. 연결된 source 선수는 `players.merged_into_player_id`로 검색에서 숨기고 출처 identity만 그룹 대표 선수로 연결합니다. `list_identity_edit_history`는 HMAC을 제외한 편집 근거·후보별 별칭·상태를 공개합니다. 원복은 후속 분류와 현재 연결 충돌이 없을 때 한 partition의 모든 merge를 역순으로 해제하고 이전 별칭과 상태를 정확히 복구합니다.

향후 `correction_requests`는 참여자의 일반 소속·지역 정정과 근거를 받는 공개 편집 흐름으로 확장합니다. 수집된 원문 기록은 수정하지 않으며 이전 값·근거 URL·익명 처리자·처리 시각을 감사 이력으로 보존합니다.

`results.division_value`는 `4부`, `A부`, `T5` 같은 관측값이고 `results.division_system`은 `open`, `integrated`, `women`, `regional`, `division`, `unknown` 중 하나입니다. 같은 숫자라도 서로 다른 체계는 합산하지 않습니다. 판정 우선순위는 T1~T7/디비전 → 대회별 수동 override와 과거 지역부수 예외 → 종목 내부의 명시적 지역 구분 → 종목명·부수 값의 여자·여성 → 명시된 통합·오픈 체계 → 일반 숫자·문자 부수입니다. `지역0~4부`, `지역남성`, `지역여성`, `지역혼성`처럼 종목에 지역 구분이 명시되면 날짜와 관계없이 `regional`로 표시합니다. 전환 이후 명시적 지역 구분이 없는 종목명 또는 부수 값에 여자·여성이 있으면 출처가 일반 `integrated`로 저장했더라도 파생 체계는 `women`을 우선하며, 사용자 화면에서는 `통합부수 여자6부`처럼 표현합니다. 공개 view는 출처 category·scale 등 view에 없는 근거로 파서가 확정한 `open`·`regional` 관측 체계를 우선 보존합니다. 선수 단위의 출처 지역이나 공유 대회 지역은 개별 기록의 지역 provenance가 아니므로 부수 판정에 사용하지 않습니다. 신규 migration은 원본 관측값과 revision hash를 변경하지 않고 기존 명시적 지역 종목의 공개 파생 체계를 `regional`로 일괄 정정합니다. 현재 제18회까지의 분당구청장기는 대회별 override로 `regional`입니다. 지역 또는 대회일이 없으면 명시적 지역 종목을 제외한 일반 숫자 부수는 `integrated`가 기본이고, 부수 값 자체가 없거나 해석할 수 없는 값은 `unknown`으로 보존합니다. 구체적인 기준일과 근거는 [부수 체계 전환 기준](division-transition-rules.md)에서 관리합니다.

`public_player_search.division_observations`는 논쟁 상태·빈 부수값·아직 열리지 않은 미래 대회 기록을 제외하고 `division_system + division_value`별 실제 기록을 JSON 배열로 집계합니다. 현재 부수 추정에는 개인전 관측을 우선하기 위해 `event_type`이 복식·단체이거나 종목명에 `복식`, `단체`, `혼합`, `혼성`이 포함된 기록을 제외합니다. 종목 종류가 명확하지 않더라도 이 제외 표지가 없으면 기존 관측을 유지합니다. 각 항목은 `{system, division, award_count, participation_count}`이며 `is_award_rank`가 참인 기록만 입상, 나머지는 참가로 서로 배타적으로 계산합니다. Supabase repository는 이를 `PlayerSummary.divisionObservations`의 `{system, division, awardCount, participationCount}`로 검증·변환하고, 로컬 live 경로는 같은 계약을 `summarizeDivisionObservations`로 생성합니다. 검색 화면은 여러 선수 후보의 이 배열을 합산하므로 같은 부수값이라도 오픈·통합·지역·디비전 체계는 분리됩니다.

지역 전환일 이전 또는 대회별 예외인 `regional` 기록은 `results`와 공개 상세 결과에 보존하지만 `public_player_search.recent_observed_division*`, `division_observations`, `result_count`, `award_results`, 최근 출전 필드에서는 제외합니다. 따라서 과거 대회 근거는 계속 열람할 수 있으면서 `현재 추정 부수`와 최근 대회 요약에는 합산되지 않습니다.

개최일이 현재 날짜보다 뒤인 대회 신청 기록도 원문 상세에는 보존하지만 최근 관측 부수·현재 추정부수·입상·출전 요약에는 합산하지 않습니다. 복식·단체·혼합·혼성 기록은 원문 이력과 일반 입상·출전 요약에는 유지하되 최근 관측 부수와 현재 추정부수 집계에서는 제외합니다. 같은 최신 개인전 대회일에 오픈 기록과 통합 또는 여자 기록이 함께 있으면 검색 카드의 단일 최근 관측값은 통합·여자 기록을 우선하고, 체계별 전체 관측값은 각각 분리해 유지합니다.

선수 상세의 `통합부수 기록`은 출처별 요약 배열 순서를 데이터 의미로 사용하지 않습니다. 선수 전체 공개 기록에 위와 같은 현재 부수 요약 제외 규칙을 먼저 적용하고, 그중 정규화한 체계가 `integrated` 또는 `women`인 기록을 `대회일 → 게시일 → 확인 시각` 최신순으로 선택합니다. 따라서 서로 다른 출처에 더 최신 통합부수 기록이 있으면 그 기록이 표시되며, 선수별 하드코딩 예외는 두지 않습니다.

출처가 누락값을 `NULL`, `NULL부`, `undefined`, `none`, `N/A`로 보낼 때는 `division_value`를 저장하지 않습니다. 기존 sentinel 값도 migration으로 null 처리하며, 방어적 UI 표기는 `통합부수 확인 필요`처럼 표현해 `여자NULL부`를 만들지 않습니다.

내부 key는 bigint identity, 외부 선수 식별자는 별도 UUID `public_id`입니다. natural key는 출처·source identity·대회 날짜/이름·종목을 canonical JSON으로 hash하여 논리적 동일성을 찾습니다. content hash는 소속·부수·순위·파트너의 변경을 찾습니다. 동일 content면 확인 시각만 갱신하고, 다르면 이전/다음 값과 changed fields를 revision에 남깁니다. 사라진 기록은 즉시 삭제하지 않습니다.

`iping_refresh_enqueue_budgets`는 원본 IP를 저장하지 않고 service-role HMAC으로 만든 요청 원점 해시와 10분 4건 예산만 보존하며 하루 뒤 삭제합니다.

500MB 예산, 350MB 경고 기준을 사용합니다. refresh 상세 로그는 7~30일 뒤 정리할 수 있습니다. 원문 HTML, HTTP body, 이미지, PDF, 전화번호, 이메일, 전체 생년월일, 주소는 저장하지 않습니다.
