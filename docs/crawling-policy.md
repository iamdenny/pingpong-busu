---
summary: "외부 출처 접근, 개인정보 제외, 요청 제한과 긴급 중지 정책을 정의한다."
read_when:
  - live crawling을 구현하거나 활성화할 때
  - 외부 출처 정책과 안전 장치를 검토할 때
title: "수집 정책"
---

# 수집 정책

- live crawling과 모든 실출처는 기본 비활성화한다.
- 활성화 전 robots.txt, 약관, 데이터 사용 허가, 요청 허용 범위를 확인한다.
- 로그인 자격증명은 허용된 전용 계정으로 서버에서만 사용하며, CAPTCHA, MFA, 접근제어 우회나 세션 탈취를 구현하지 않는다.
- BAND는 scraper 없이 manual source URL만 취급한다.
- 출처별 timeout, concurrency, cooldown, max pages를 적용한다. Supabase Edge의 에어핑퐁은 10초 단일 시도를 사용한다. workspace live CLI는 기본 8초이며 에어핑퐁 16초, 오케이핑퐁 10초, 아이핑 12초를 사용한다.
- raw HTML을 저장하거나 React에 렌더링하지 않는다.
- URL fragment와 `jsessionid` 같은 임시 session identifier를 영구 URL에 넣지 않는다.
- parser는 합성 fixture, runtime schema validation, version을 갖는다. 구조 불일치는 0건이 아니라 schema/parse error다.
- 긴급 중지는 DB `sources.enabled=false`와 대응 환경 변수 `false`로 이중 적용한다.

현재 live CLI는 `CRAWL_LIVE=true` 없이는 즉시 종료합니다. 각 live 출처에는 대응하는 `CRAWLER_SOURCE_*_ENABLED=true`가 추가로 필요합니다. 에어핑퐁과 오케이핑퐁은 저장소 운영자가 2026-08-12 수집 승낙 완료를 확인해 opt-in 운영 출처로 전환했습니다. 용인 카페는 `KAKAO_REST_API_KEY`를 Supabase Edge Secret에만 두며 검색 1회당 공식 API 1회로 제한합니다. 운영 아이핑은 `IPING_USERNAME`, `IPING_PASSWORD`를 GitHub `production` environment Secret에만 두고 main 예약 workflow의 실제 Chrome에서 조회마다 새 PHP 세션으로 출전·전국오픈 입상·시군구 입상 세 화면을 순차 확인합니다. 자격증명, 세션 쿠키, 원문 HTML은 저장·출력하지 않습니다. CAPTCHA, MFA 또는 사람 확인 화면이 나타나면 우회하지 않고 terminal 실패로 처리합니다. Edge는 worker token과 4분 lease를 확인한 뒤 HTML을 메모리에서 파싱하고 즉시 폐기합니다. 운영에는 DB `sources.enabled=true`까지 필요합니다. 대한탁구협회 응답의 휴대폰·RT점수와 슈퍼스타의 레이팅 표는 저장하지 않습니다.

사용자 브라우저 검색은 아이핑을 직접 조회하지 않고 최근 6시간 성공 결과를 우선 표시한 뒤 private queue에 이름 검색 작업을 중복 없이 등록합니다. 서버는 선수 이름 형태만 허용해 연락처·생년월일·주소가 payload에 저장되는 것을 막고, 분당 신규 4건·활성 12건으로 admission을 제한합니다. `force=true`도 아이핑 freshness와 dedupe를 우회하지 않으며 queued 상태에는 수동 재시도를 제공하지 않습니다. main 전용 예약 browser worker가 10분마다 최대 한 작업만 처리합니다. timeout·일시적 네트워크 실패·5xx는 15~60분 backoff로 최대 3회 시도하고, 인증 실패·구조 변경·접근 차단·설정 누락은 즉시 종료해 대기열을 멈춥니다. Supabase backend의 main 배포가 성공하면 worker token으로 인증된 `recover-iping` 작업이 최근 24시간의 결정적 실패 한 건만 재예약해 실제 Chrome으로 한 번 검증합니다. 이미 작업 중이거나 복구 대상이 없으면 외부 조회 없이 끝납니다. 계정 Secret만 바꾼 경우에는 같은 제한의 수동 복구를 사용할 수 있으며, 일반 예약 schedule은 회로를 자동 해제하지 않습니다. 재검증이 실패하면 6시간 보호를 다시 적용합니다. 일반 동기 출처는 기존 `출처 + 정규화 검색어` 호출 제한과 화면 재시도 정책을 유지합니다.

뉴티티플레이는 비회원 공개 탁구인검색 결과를 GET으로 최대 2페이지만 조회하며 기존 쿼리별 호출 제한과 출처 전체 분당 6회 예산을 적용합니다. 결과 표 밖의 페이지 운영자 연락처·주소, 응답 원문과 PHP 세션 쿠키는 수집·저장하지 않습니다. 2026-08-15 저장소 운영자 승인으로 production opt-in했으며 승인이 변경되거나 철회되면 환경 변수와 DB 출처 스위치를 모두 비활성화합니다.

Supabase Edge의 에어핑퐁 네트워크 계층은 10초 단일 시도 뒤 안전한 `source_timeout`과 5초 재시도 정보를 반환합니다. workspace live CLI의 에어핑퐁·오케이핑퐁·아이핑 GET은 timeout, 연결 오류, HTTP 408/5xx만 최대 한 번 재시도합니다. 두 경로 모두 인증 실패, 4xx, parser 오류와 아이핑 로그인 POST는 재시도하지 않습니다. 아이핑 로그인은 HTTP Cookie와 hidden form token을 구분하고 현재 로그인 폼, 로그아웃 링크, 사람 확인 화면을 판별합니다. 오케이핑퐁의 명시적인 `검색 결과가 없습니다.` 행은 정상 0건이며 구조 변경으로 기록하지 않습니다.

Edge가 기록하는 출처 장애 상태는 허용 목록에 있는 `last_error_code`뿐입니다. 검색어, query key, 원문 오류, 쿠키, HTML은 실패 기록 RPC에 전달하거나 저장하지 않으며 다음 성공 시 이전 오류 코드를 지웁니다.

아이핑은 전용 계정 Secret과 운영 스위치가 준비되기 전에는 `서버 계정 설정 필요` 상태와 원문 로그인 링크만 표시합니다. 아이핑·에어핑퐁·오케이핑퐁의 운영 스위치를 긴급 중지하면 저장 기록은 유지하고 원문 직접 검색 링크를 다시 표시합니다.

사용자가 검색을 실행하면 저장 기록 유무와 관계없이 활성 출처를 각각 다시 확인합니다. 출처가 `since`/날짜 조건을 제공하면 마지막 성공 조회 시각 이후 범위를 요청하고, 제공하지 않는 현재 출처들은 공개 검색 결과를 다시 받아 `natural_key_hash`와 `content_hash`로 비교합니다. 이 경우 DB에는 신규·변경분만 삽입 또는 수정하고 동일 기록은 마지막 확인 시각만 갱신합니다. 과거 대회 기록이 뒤늦게 추가되는 상황을 놓칠 수 있으므로 클라이언트에서 대회 날짜만 잘라내지는 않습니다.

아이핑 enqueue는 원본 IP를 저장하지 않는 요청 원점 HMAC별 10분 4건 제한과 전역 분당 신규 4건·활성 12건 제한을 함께 적용하며, 요청 원점 hash는 하루 안에 삭제합니다.
