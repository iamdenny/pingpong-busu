# 데이터 모델

`sources`는 adapter 상태, `players`와 `clubs`는 검토된 canonical entity, `source_player_identities`는 출처별 후보를 담습니다. 이름 하나만으로 identity를 연결하지 않습니다. `tournaments`와 `results`는 정규화된 기록이며 `result_revisions`는 실제 내용 변경만 보존합니다. `source_refreshes`는 조회 요약, `refresh_jobs`는 비동기/browser 작업입니다. `correction_requests`와 `rule_sets`는 후속 기능의 schema입니다.

기록 시간축은 대회 개최일 `tournaments.held_on`을 우선합니다. 게시판형 출처가 대회일을 제공하지 않으면 `results.source_published_on`을 사용하고, 공개 view의 `sort_date`는 두 값을 이 순서로 합성합니다. 크롤러의 `last_checked_at`은 동일 날짜의 보조 정렬 기준일 뿐 경기·게시 시점을 대신하지 않습니다.

`results.rank_text`가 우승·준우승·1~3위·2강·4강을 나타낼 때만 입상으로 집계합니다. 8강 이하와 예선·본선 진출은 참가 이력으로 보존하지만 `public_player_search.result_count` 및 화면의 입상 필터에는 포함하지 않습니다. 애플리케이션의 `isAwardRank`와 DB의 `is_award_rank`는 같은 판정 기준을 사용합니다.

`results.division_value`는 `4부`, `A부`, `T5` 같은 관측값이고 `results.division_system`은 `open`, `integrated`, `women`, `regional`, `division`, `unknown` 중 하나입니다. 오픈부수·통합부수·여자부수·지역부수·디비전부수는 서로 다른 체계이므로 같은 숫자라도 합산하지 않습니다. 디비전부수는 대한탁구협회 공개 선수조회의 T1~T7 값을 사용합니다. 일반 숫자 부수는 시·군·구 등 대회 지역과 관계없이 `integrated`가 기본이며, `open`, `women`, `regional`은 출처 문구에 해당 체계가 명시된 경우에만 사용합니다. 부수 값 자체가 없거나 해석할 수 없는 값은 `unknown`으로 보존합니다.

내부 key는 bigint identity, 외부 선수 식별자는 별도 UUID `public_id`입니다. natural key는 출처·source identity·대회 날짜/이름·종목을 canonical JSON으로 hash하여 논리적 동일성을 찾습니다. content hash는 소속·부수·순위·파트너의 변경을 찾습니다. 동일 content면 확인 시각만 갱신하고, 다르면 이전/다음 값과 changed fields를 revision에 남깁니다. 사라진 기록은 즉시 삭제하지 않습니다.

500MB 예산, 350MB 경고 기준을 사용합니다. refresh 상세 로그는 7~30일 뒤 정리할 수 있습니다. 원문 HTML, HTTP body, 이미지, PDF, 전화번호, 이메일, 전체 생년월일, 주소는 저장하지 않습니다.
