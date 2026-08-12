# 대한탁구협회 디비전 adapter

- Source: `https://ttadivision.sports.or.kr/statistic/moveSearchOteamPlayer.do`
- Parser version: `ttadivision-1`
- Mode: public HTTP form + JSON response
- Stored fields: 이름, T1~T7 등급, 소속팀, 지역, 공개 source identity
- Discarded fields: 휴대폰, RT점수, 성별, 선수출신 구분
- Safety: `CRAWL_LIVE`, `CRAWLER_SOURCE_TTADIVISION_ENABLED`, DB `sources.enabled`가 모두 켜져야 동작

서버가 leaf 발급자와 다른 legacy intermediate 인증서를 제공하므로 leaf AIA가 가리키는 공식 Sectigo DV R36 intermediate를 추가 CA로 사용합니다. TLS 인증서 및 hostname 검증은 유지하며 검증 우회 옵션은 사용하지 않습니다.
