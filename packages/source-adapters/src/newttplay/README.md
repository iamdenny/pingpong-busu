# 뉴티티플레이 adapter

공개 `member_search` 탁구인검색 결과를 로그인 없이 GET으로 조회한다. 최대 2페이지만 요청하며 결과 표의 선수명, 소속, 대회, 날짜, 종목, 관측 부수와 결과만 정규화한다.

실제 응답 HTML이나 세션 쿠키는 저장하지 않는다. 합성 fixture만 테스트에 사용하며 `CRAWL_LIVE`, `CRAWLER_SOURCE_NEWTTPLAY_ENABLED`, DB `sources.enabled`가 모두 활성화된 경우에만 외부 요청을 허용한다. production은 2026-08-15 저장소 운영자 승인으로 opt-in하며 긴급 중지 시 환경 변수와 DB 값을 모두 비활성화한다.
