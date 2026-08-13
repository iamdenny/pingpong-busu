---
summary: "선수 identity, 대회 결과, 부수 체계, 시간축과 revision 저장 규칙을 설명한다."
read_when:
  - Supabase schema나 public view를 변경할 때
  - 부수·입상·동명이인 데이터 규칙을 확인할 때
title: "데이터 모델"
---

# 데이터 모델

`sources`는 adapter 상태, `players`와 `clubs`는 검토된 canonical entity, `source_player_identities`는 출처별 후보를 담습니다. 이름 하나만으로 identity를 연결하지 않습니다. `tournaments`와 `results`는 정규화된 기록이며 `result_revisions`는 실제 내용 변경만 보존합니다. `source_refreshes`는 조회 요약, `refresh_jobs`는 비동기/browser 작업입니다. `source_request_throttles`는 다른 검색어와 사용자를 함께 막지 않도록 `출처 + 정규화 검색어`별 마지막 호출 시각, 1분 제한 시작 시각과 시도 횟수를 보존합니다. `identity_claims`와 `identity_claim_candidates`는 참여자가 선택한 동일인 후보 묶음을, `identity_claim_reviews`는 관리자 상태 변경 감사 이력을 담습니다. `correction_requests`와 `rule_sets`는 후속 기능의 schema입니다.

기록 시간축은 대회 개최일 `tournaments.held_on`을 우선합니다. 게시판형 출처가 대회일을 제공하지 않으면 `results.source_published_on`을 사용하고, 공개 view의 `sort_date`는 두 값을 이 순서로 합성합니다. 크롤러의 `last_checked_at`은 동일 날짜의 보조 정렬 기준일 뿐 경기·게시 시점을 대신하지 않습니다.

`results.rank_text`가 우승·준우승·1~3위·2강·4강을 나타낼 때만 입상으로 집계합니다. 8강 이하와 예선·본선 진출은 참가 이력으로 보존하지만 `public_player_search.result_count` 및 화면의 입상 필터에는 포함하지 않습니다. `public_player_search.award_results`는 입상 등수와 `대회일 → 게시일` 기준 날짜를 최신순 JSON 배열로 제공합니다. 애플리케이션의 `isAwardRank`와 DB의 `is_award_rank`는 같은 판정 기준을 사용합니다.

`public_player_search.primary_region`은 `이름 지역` 검색의 부분 일치 필터에 사용합니다. 지역어는 외부 출처의 선수명 검색어에 포함하지 않습니다. 지역은 공개 대회 기록 기반 추정값이므로 동일인 자동 병합이나 거주지 판단의 단독 근거로 쓰지 않습니다.

`identity_claims.verification_hash`는 정규화 이름과 참여자가 정한 숫자 4자리를 서버 전용 key로 HMAC한 값입니다. 코드 원문, 휴대폰 번호, 생년월일은 저장하지 않습니다. `candidate_fingerprint`는 선택된 공개 선수 ID 정렬값의 SHA-256이며 중복 제보 판정에만 사용합니다. 제보는 항상 `pending`으로 생성되고 같은 정규화 이름의 후보만 연결할 수 있으며, 자동 merge를 실행하지 않습니다. 관리자 상태 변경은 trigger가 `identity_claim_reviews`에 이전·다음 상태와 처리자를 남깁니다. `identity_claim_review_queue`는 service role만 조회할 수 있습니다.

관리자 병합은 `identity_merge_operations`에 대상 선수, 처리자, 사유, 선택적 제보 ID를 남기고 `identity_merge_operation_players`와 `identity_merge_operation_identities`에 병합 전 선수 상태·출처 identity 연결·match 상태를 저장합니다. 원본 `players`, `source_player_identities`, `results` 행은 삭제하지 않습니다. 병합된 source 선수는 `players.merged_into_player_id`로 숨기고 출처 identity만 대상 선수로 연결합니다. 원복은 저장된 스냅샷과 현재 연결이 일치하고 같은 대상의 후속 병합이 없을 때만 허용하며, 이전 연결과 상태를 정확히 복구합니다.

향후 `correction_requests`는 참여자의 일반 정정·분리 제보와 근거를 받고 관리자가 승인·반려합니다. 승인 결과는 canonical metadata에 반영하되 수집된 원문 기록을 수정하지 않으며, 이전 값·근거 URL·처리자·처리 시각을 감사 이력으로 보존합니다.

`results.division_value`는 `4부`, `A부`, `T5` 같은 관측값이고 `results.division_system`은 `open`, `integrated`, `women`, `regional`, `division`, `unknown` 중 하나입니다. 같은 숫자라도 서로 다른 체계는 합산하지 않습니다. 판정 우선순위는 대회별 수동 override → T1~T7/디비전 → 종목 내부의 지역 구분(`지역`, `지역남성`, `지역여성`, `지역혼성`) → 참가 종목의 여자·여성 → 오픈 명시 → 지역부수 명시 → 일반 숫자·문자 부수의 통합부수입니다. 수동 override는 코드와 migration에 근거를 남겨 재수집과 기존 데이터에 동일하게 적용합니다. 현재 제16회 이하 분당구청장기는 `regional`입니다. 종목 내부 지역 구분은 대회명에 `오픈`이 있더라도 `integrated`로 저장합니다. `women`은 그 지역 구분이 없는 여자 종목을 보존하기 위한 내부 subtype이며 사용자 화면에서는 `통합부수 여자6부`처럼 표현합니다. 시·군·구 등 대회 지역은 부수 체계 판정 근거가 아니며 일반 숫자 부수는 `integrated`가 기본입니다. 부수 값 자체가 없거나 해석할 수 없는 값은 `unknown`으로 보존합니다.

출처가 누락값을 `NULL`, `NULL부`, `undefined`, `none`, `N/A`로 보낼 때는 `division_value`를 저장하지 않습니다. 기존 sentinel 값도 migration으로 null 처리하며, 방어적 UI 표기는 `통합부수 확인 필요`처럼 표현해 `여자NULL부`를 만들지 않습니다.

내부 key는 bigint identity, 외부 선수 식별자는 별도 UUID `public_id`입니다. natural key는 출처·source identity·대회 날짜/이름·종목을 canonical JSON으로 hash하여 논리적 동일성을 찾습니다. content hash는 소속·부수·순위·파트너의 변경을 찾습니다. 동일 content면 확인 시각만 갱신하고, 다르면 이전/다음 값과 changed fields를 revision에 남깁니다. 사라진 기록은 즉시 삭제하지 않습니다.

500MB 예산, 350MB 경고 기준을 사용합니다. refresh 상세 로그는 7~30일 뒤 정리할 수 있습니다. 원문 HTML, HTTP body, 이미지, PDF, 전화번호, 이메일, 전체 생년월일, 주소는 저장하지 않습니다.
