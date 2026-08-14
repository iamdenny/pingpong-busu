# Astree adapter

- Mode: HTTP
- Parser version: `astree-6`
- Default: disabled
- Enable: trusted environment에서 `CRAWL_LIVE=true`와 `CRAWLER_SOURCE_ASTREE_ENABLED=true`
- Endpoint: 공개 탁구인검색 GET form (`bo_table=member_search`, `sfl=wr_subject`, `stx`)
- Limits: 검색당 최대 2페이지, caller cooldown 기본 6시간, query별 in-flight dedupe

robots.txt는 일반 user-agent에 `/adm`, `/plugin`, `/data/member`만 금지하며 공개 검색 경로는 금지하지 않습니다. 2026-08-12 확인한 이용약관에서는 자동 수집 금지 문구를 찾지 못했습니다. 이는 영구 허가를 의미하지 않으므로 운영 전 출처 운영자에게 데이터 재사용 범위를 확인하고, 요청이 있으면 즉시 비활성화합니다.

Parser는 synthetic fixture만 repository에 저장합니다. 원문 HTML은 DB나 cache에 저장하지 않습니다. 결과 table의 열 또는 page marker가 바뀌면 빈 결과 대신 `SourceSchemaChangedError`를 반환합니다.
