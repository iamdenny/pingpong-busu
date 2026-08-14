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

`sources`는 adapter 상태, `players`와 `clubs`는 canonical entity, `source_player_identities`는 출처별 후보를 담습니다. 이름 하나만으로 identity를 연결하지 않습니다. 출처에 적힌 소속은 `source_player_identities.source_club_text`와 `results.club_text`에 원문 증거로 보존하지만 crawler가 `clubs`를 만들거나 `players.primary_club_id`로 자동 승격하지 않습니다. 대표 소속은 별도의 검토를 거친 canonical metadata입니다. `tournaments`와 `results`는 정규화된 기록이며 `result_revisions`는 실제 내용 변경만 보존합니다. `source_refreshes`는 조회 요약, `refresh_jobs`는 비동기/browser 작업입니다. `source_request_throttles`는 다른 검색어와 사용자를 함께 막지 않도록 `출처 + 정규화 검색어`별 마지막 호출 시각, 1분 제한 시작 시각과 시도 횟수를 보존합니다. `source_request_budgets`는 인증형 아이핑 계정의 분당 실제 요청 예산을 출처 단위로 원자적으로 관리합니다. `identity_partition_operations`는 한 번의 동명이인 분류 편집, `identity_partition_groups`는 탁구 별칭별 대표 선수와 내부 merge, `identity_partition_members`는 후보별 별칭과 이전 상태 snapshot을 담습니다. 기존 `identity_claims` 계열은 배포 전환기의 단일 병합 이력 호환을 위해 유지합니다. `correction_requests`와 `rule_sets`는 후속 기능의 schema입니다.

기록 시간축은 대회 개최일 `tournaments.held_on`을 우선합니다. 게시판형 출처가 대회일을 제공하지 않으면 `results.source_published_on`을 사용하고, 공개 view의 `sort_date`는 두 값을 이 순서로 합성합니다. 크롤러의 `last_checked_at`은 동일 날짜의 보조 정렬 기준일 뿐 경기·게시 시점을 대신하지 않습니다.

`results.rank_text`가 우승·준우승·1~3위·2강·4강을 나타낼 때만 입상으로 집계합니다. 단, `예선 12조 3위`나 `조별 1위`처럼 예선·조별 문맥의 순위는 숫자 등수가 있어도 참가 이력입니다. 8강 이하와 예선·본선 진출은 참가 이력으로 보존하지만 `public_player_search.result_count` 및 화면의 입상 필터에는 포함하지 않습니다. `public_player_search.award_results`는 입상 등수·대회명과 `대회일 → 게시일` 기준 날짜를 최신순 JSON 배열로 제공하고, `latest_participation_date`와 `latest_participation_tournament`는 입상이 아닌 최근 출전의 날짜와 대회명을 제공합니다. 검색 화면은 `identity_status = verified`인 참여 편집 결과를 우선하고, 나머지는 입상일 또는 최근 출전일이 없을 때만 확인 시각을 보조 기준으로 사용합니다. `primary_region`과 `primary_club` 출력은 이 시간축에서 가장 최근의 비어 있지 않은 `tournaments.region`·출처 지역 및 `results.club_text`·출처 소속을 사용하고 관측값이 없을 때만 선수의 검토된 대표값으로 대체합니다. 애플리케이션의 `isAwardRank`와 DB의 `is_award_rank`는 같은 판정 기준을 사용합니다.

`public_player_search.primary_region`은 `이름 지역` 검색의 부분 일치 필터에 사용합니다. 지역어는 외부 출처의 선수명 검색어에 포함하지 않습니다. 지역은 공개 대회 기록 기반 추정값이므로 동일인 자동 병합이나 거주지 판단의 단독 근거로 쓰지 않습니다.

`identity_partition_operations.editor_hash`는 브라우저가 자동 생성한 임의의 익명 편집자 ID를 서버 전용 key로 HMAC한 값입니다. 브라우저 ID 원문, 비밀번호, 휴대폰 번호, 생년월일은 저장하지 않습니다. 익명 편집자 ID는 abuse 제한을 보조하는 가명 식별자일 뿐 인증이나 원복 권한이 아닙니다. 동일 이름에 대한 빈도 제한은 이 HMAC과 `normalized_name`을 함께 사용합니다. `fingerprint`는 별칭과 각 그룹의 공개 선수 ID를 정렬한 canonical JSON의 SHA-256이며 중복 편집 판정에만 사용합니다. 후보 수에는 고정 상한을 두지 않고 같은 정규화 이름의 활성 후보만 분류할 수 있습니다.

`players.homonym_nickname`은 사용자가 입력하고 NFKC·공백 정규화를 거친 2~20자 표시 문자열을 저장합니다. 별칭은 한글이나 영문을 반드시 포함하고 제한된 문자만 허용하며, Edge Function이 연락처 형태와 같은 이름 안의 중복을 거부합니다. 별칭은 동명이인 기록 구분자일 뿐 실제 플레이 스타일·실력·부수·공식 등급이 아닙니다.

`identity_community_request_budgets`는 gateway 요청 원점과 익명 편집자 ID를 각각 서버 HMAC한 scope를 요청 단계에서 원자적으로 잠그고, 전체 scope는 실제 편집·원복 트랜잭션 안에서 성공할 때만 차감합니다. 따라서 무효 요청은 해당 요청자 예산에는 반영되지만 전체 사용자 예산을 고갈시키지 않습니다. 공개 이력의 변경·원복 근거는 검수된 구조화 사유만 저장하고 자유 입력은 저장하지 않습니다. 후보 총수에는 상한을 두지 않되 근거 조회 RPC는 100건씩 분할합니다.

참여 편집은 별칭 그룹 안에 후보가 둘 이상일 때 `identity_merge_operations`, `identity_merge_operation_players`, `identity_merge_operation_identities`에 병합 전 선수 상태·출처 identity 연결·match 상태를 저장합니다. 한 명뿐인 그룹도 partition member snapshot으로 이전 별칭과 identity 상태를 보존합니다. 원본 `players`, `source_player_identities`, `results` 행은 삭제하지 않습니다. 연결된 source 선수는 `players.merged_into_player_id`로 검색에서 숨기고 출처 identity만 그룹 대표 선수로 연결합니다. `list_identity_edit_history`는 HMAC을 제외한 편집 근거·후보별 별칭·상태를 공개합니다. 원복은 후속 분류와 현재 연결 충돌이 없을 때 한 partition의 모든 merge를 역순으로 해제하고 이전 별칭과 상태를 정확히 복구합니다.

향후 `correction_requests`는 참여자의 일반 소속·지역 정정과 근거를 받는 공개 편집 흐름으로 확장합니다. 수집된 원문 기록은 수정하지 않으며 이전 값·근거 URL·익명 처리자·처리 시각을 감사 이력으로 보존합니다.

`results.division_value`는 `4부`, `A부`, `T5` 같은 관측값이고 `results.division_system`은 `open`, `integrated`, `women`, `regional`, `division`, `unknown` 중 하나입니다. 같은 숫자라도 서로 다른 체계는 합산하지 않습니다. 판정 우선순위는 대회별 수동 override → T1~T7/디비전 → 종목 내부의 지역 구분(`지역`, `지역남성`, `지역여성`, `지역혼성`) → 참가 종목의 여자·여성 → 오픈 명시 → 지역부수 명시 → 일반 숫자·문자 부수의 통합부수입니다. 수동 override는 코드와 migration에 근거를 남겨 재수집과 기존 데이터에 동일하게 적용합니다. 현재 제16회 이하와 제18회 분당구청장기는 `regional`이며 제17회에는 적용하지 않습니다. 종목 내부 지역 구분은 대회명에 `오픈`이 있더라도 `integrated`로 저장합니다. `women`은 그 지역 구분이 없는 여자 종목을 보존하기 위한 내부 subtype이며 사용자 화면에서는 `통합부수 여자6부`처럼 표현합니다. 시·군·구 등 대회 지역은 부수 체계 판정 근거가 아니며 일반 숫자 부수는 `integrated`가 기본입니다. 부수 값 자체가 없거나 해석할 수 없는 값은 `unknown`으로 보존합니다.

`public_player_search.division_observations`는 논쟁 상태와 빈 부수값을 제외하고 `division_system + division_value`별 실제 기록을 JSON 배열로 집계합니다. 각 항목은 `{system, division, award_count, participation_count}`이며 `is_award_rank`가 참인 기록만 입상, 나머지는 참가로 서로 배타적으로 계산합니다. Supabase repository는 이를 `PlayerSummary.divisionObservations`의 `{system, division, awardCount, participationCount}`로 검증·변환하고, 로컬 live 경로는 같은 계약을 `summarizeDivisionObservations`로 생성합니다. 검색 화면은 여러 선수 후보의 이 배열을 합산하므로 같은 부수값이라도 오픈·통합·지역·디비전 체계는 분리됩니다.

출처가 누락값을 `NULL`, `NULL부`, `undefined`, `none`, `N/A`로 보낼 때는 `division_value`를 저장하지 않습니다. 기존 sentinel 값도 migration으로 null 처리하며, 방어적 UI 표기는 `통합부수 확인 필요`처럼 표현해 `여자NULL부`를 만들지 않습니다.

내부 key는 bigint identity, 외부 선수 식별자는 별도 UUID `public_id`입니다. natural key는 출처·source identity·대회 날짜/이름·종목을 canonical JSON으로 hash하여 논리적 동일성을 찾습니다. content hash는 소속·부수·순위·파트너의 변경을 찾습니다. 동일 content면 확인 시각만 갱신하고, 다르면 이전/다음 값과 changed fields를 revision에 남깁니다. 사라진 기록은 즉시 삭제하지 않습니다.

500MB 예산, 350MB 경고 기준을 사용합니다. refresh 상세 로그는 7~30일 뒤 정리할 수 있습니다. 원문 HTML, HTTP body, 이미지, PDF, 전화번호, 이메일, 전체 생년월일, 주소는 저장하지 않습니다.
