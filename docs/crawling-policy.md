---
summary: '외부 출처 접근, 개인정보 제외, 요청 제한과 긴급 중지 정책을 정의한다.'
read_when:
  - live crawling을 구현하거나 활성화할 때
  - 외부 출처 정책과 안전 장치를 검토할 때
title: '수집 정책'
---

# 수집 정책

- live crawling과 모든 실출처는 기본 비활성화한다.
- 활성화 전 robots.txt, 약관, 데이터 사용 허가, 요청 허용 범위를 확인한다.
- 로그인 자격증명은 허용된 전용 계정으로 서버에서만 사용하며, CAPTCHA, MFA, 접근제어 우회나 세션 탈취를 구현하지 않는다.
- BAND는 scraper 없이 manual source URL만 취급한다.
- 출처별 timeout(기본 8초), concurrency, cooldown, max pages를 적용한다.
- raw HTML을 저장하거나 React에 렌더링하지 않는다.
- URL fragment와 `jsessionid` 같은 임시 session identifier를 영구 URL에 넣지 않는다.
- parser는 합성 fixture, runtime schema validation, version을 갖는다. 구조 불일치는 0건이 아니라 schema/parse error다.
- 긴급 중지는 DB `sources.enabled=false`와 대응 환경 변수 `false`로 이중 적용한다.

현재 live CLI는 `CRAWL_LIVE=true` 없이는 즉시 종료합니다. 각 live 출처에는 대응하는 `CRAWLER_SOURCE_*_ENABLED=true`가 추가로 필요합니다. 에어핑퐁과 오케이핑퐁은 저장소 운영자가 2026-08-12 수집 승낙 완료를 확인해 opt-in 운영 출처로 전환했습니다. 용인 카페는 `KAKAO_REST_API_KEY`를 Supabase Edge Secret에만 두며 검색 1회당 공식 API 1회로 제한합니다. 아이핑은 `IPING_USERNAME`, `IPING_PASSWORD`를 Supabase Edge Secret에만 두고 조회마다 새 PHP 세션으로 전국오픈·시군구 입상과 출전 이력 세 화면만 확인합니다. 자격증명, 세션 쿠키, 원문 HTML은 저장하지 않습니다. CAPTCHA, MFA 또는 사람 확인 화면이 나타나면 우회하지 않고 아이핑 갱신만 실패 처리합니다. 일반 서버 호출은 같은 이름의 최근 6시간 성공 결과를 재사용할 수 있지만, 검색 화면은 사용자의 명시적 검색마다 `force=true`로 이 query cache를 우회합니다. 모든 호출에는 출처별 최소 요청 간격이 계속 적용됩니다. Edge 운영에서는 DB `sources.enabled=true`까지 필요합니다. 대한탁구협회 응답의 휴대폰·RT점수와 슈퍼스타의 레이팅 표는 저장하지 않습니다.

아이핑은 전용 계정 Secret과 운영 스위치가 준비되기 전에는 `서버 계정 설정 필요` 상태와 원문 로그인 링크만 표시합니다. 아이핑·에어핑퐁·오케이핑퐁의 운영 스위치를 긴급 중지하면 저장 기록은 유지하고 원문 직접 검색 링크를 다시 표시합니다.

사용자가 검색을 실행하면 저장 기록 유무와 관계없이 활성 출처를 각각 다시 확인합니다. 출처가 `since`/날짜 조건을 제공하면 마지막 성공 조회 시각 이후 범위를 요청하고, 제공하지 않는 현재 출처들은 공개 검색 결과를 다시 받아 `natural_key_hash`와 `content_hash`로 비교합니다. 이 경우 DB에는 신규·변경분만 삽입 또는 수정하고 동일 기록은 마지막 확인 시각만 갱신합니다. 과거 대회 기록이 뒤늦게 추가되는 상황을 놓칠 수 있으므로 클라이언트에서 대회 날짜만 잘라내지는 않습니다.
