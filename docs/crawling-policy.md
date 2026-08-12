# 수집 정책

- live crawling과 모든 실출처는 기본 비활성화한다.
- 활성화 전 robots.txt, 약관, 데이터 사용 허가, 요청 허용 범위를 확인한다.
- 로그인, CAPTCHA, 접근제어 우회나 세션 탈취를 구현하지 않는다.
- BAND는 scraper 없이 manual source URL만 취급한다.
- 출처별 timeout(기본 8초), concurrency, cooldown, max pages를 적용한다.
- raw HTML을 저장하거나 React에 렌더링하지 않는다.
- URL fragment와 `jsessionid` 같은 임시 session identifier를 영구 URL에 넣지 않는다.
- parser는 합성 fixture, runtime schema validation, version을 갖는다. 구조 불일치는 0건이 아니라 schema/parse error다.
- 긴급 중지는 DB `sources.enabled=false`와 대응 환경 변수 `false`로 이중 적용한다.

현재 live CLI는 `CRAWL_LIVE=true` 없이는 즉시 종료합니다. 애즈트리는 `CRAWLER_SOURCE_ASTREE_ENABLED=true`, 대한탁구협회 디비전은 `CRAWLER_SOURCE_TTADIVISION_ENABLED=true`, 마이티티는 `CRAWLER_SOURCE_MYTT_ENABLED=true`가 추가로 필요하며 기본 6시간 cooldown을 적용합니다. 검색 화면의 사용자 실행 갱신은 이 query cache를 우회하지만, 출처별 최소 요청 간격은 계속 적용합니다. Edge 운영에서는 DB `sources.enabled=true`까지 필요합니다. 대한탁구협회 응답의 휴대폰과 RT점수는 저장하지 않습니다. 에어핑퐁과 오케이핑퐁은 parser가 준비됐더라도 이용약관의 사전 승낙 제한 때문에 운영 disabled를 유지합니다.

사용자가 검색을 실행하면 저장 기록 유무와 관계없이 활성 출처를 각각 다시 확인합니다. 출처가 `since`/날짜 조건을 제공하면 마지막 성공 조회 시각 이후 범위를 요청하고, 제공하지 않는 현재 출처들은 공개 검색 결과를 다시 받아 `natural_key_hash`와 `content_hash`로 비교합니다. 이 경우 DB에는 신규·변경분만 삽입 또는 수정하고 동일 기록은 마지막 확인 시각만 갱신합니다. 과거 대회 기록이 뒤늦게 추가되는 상황을 놓칠 수 있으므로 클라이언트에서 대회 날짜만 잘라내지는 않습니다.
