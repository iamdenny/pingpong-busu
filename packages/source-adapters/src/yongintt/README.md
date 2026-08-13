# 용인탁구협회 다음 카페 adapter

카카오의 공식 Daum 카페 검색 API로 `{이름} 대회`를 최신순 조회하고 `cafe.daum.net/yongintt/` 게시물만 남기는 `yongintt-3` adapter입니다. 제목·검색 요약·게시일·원문 URL만 처리하며 회원 전용 본문을 열거나 로그인 접근제어를 우회하지 않습니다.

- API: `GET https://dapi.kakao.com/v2/search/cafe`
- Secret: `KAKAO_REST_API_KEY` (trusted server only)
- Enable: `CRAWL_LIVE=true`, `CRAWLER_SOURCE_YONGINTT_ENABLED=true`, DB `sources.enabled=true`
- Limit: 검색 1회당 기본 1페이지·최대 50건, 호출당 최대 2페이지
- Identity: 이름만으로 병합하지 않고 게시글 URL별 검토 전 후보로 분리
- Exclusion: 입상자 사진 게시판(`/IWou/`)과 입상자·수상자 사진 게시물은 검색 요약에서 선수별 성적 관계를 확인할 수 없으므로 구조화 기록에서 제외
