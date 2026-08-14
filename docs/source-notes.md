---
summary: "각 탁구 출처의 URL, adapter 상태, parser version과 운영 허용 근거를 기록한다."
read_when:
  - 출처별 구현·운영 상태를 확인할 때
  - parser version이나 정책 근거를 갱신할 때
title: "출처 메모"
---

# 출처 메모

| 출처        | URL                                                                   | 예상 mode | 상태                  | parser        | 확인 사항                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------- | --------: | --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mock        | `example.invalid`                                                     |      http | enabled               | mock-1/2      | 합성 fixture 전용                                                                                                                                                         |
| airping     | <https://airping.co.kr/11player/01.php>                               |      http | production opt-in     | airping-2     | 공개 검색 parser와 합성 fixture 완료. 저장소 운영자가 2026-08-12 수집 승낙 완료를 확인해 운영 활성화                                                                      |
| astree      | <https://astree.co.kr/bbs/board.php?bo_table=member_search>           |      http | production opt-in     | astree-5      | UTF-8 GET, 최대 2페이지, 결과 표 한정·동일 origin 링크 검증, 6시간 cooldown, 정규식 기반 도·시·군·구 및 부수 체계 추출                                                    |
| newttplay   | <https://www.newttplay.co.kr/bbs/board.php?bo_table=member_search>    |      http | 구현 완료 / 비활성    | newttplay-1   | 비회원 UTF-8 GET, 최대 2페이지·2 MiB, redirect 차단, 출처 전체 분당 6회 claim. 결과 표만 처리하며 운영 허가 확인 전 환경 변수와 DB를 모두 비활성화                          |
| ttadivision | <https://ttadivision.sports.or.kr/statistic/moveSearchOteamPlayer.do> |      http | production opt-in     | ttadivision-1 | 공개 이름 검색, T1~T7·소속팀·지역만 저장. 휴대폰과 RT점수는 저장하지 않음. 서버가 잘못 제공하는 중간 인증서 대신 leaf AIA의 공식 Sectigo DV R36 CA를 추가해 TLS 검증 유지 |
| okpingpong  | <http://okpingpong.co.kr/04match/08.php>                              |      http | production opt-in     | okpingpong-3  | 공개 검색 parser와 합성 fixture 완료. 명시적 검색 결과 없음 행을 정상 0건으로 처리                                                                                        |
| mytt        | <https://mytt.kr/main/player_list.xhtml>                              |      http | production opt-in     | mytt-2        | robots 전체 허용, 비회원 JSF GET/POST 공개 검색. 단기 JSESSIONID는 요청에만 사용하고 저장하지 않음                                                                        |
| superstar   | <https://www.superstar.kr/open/Do.jsp?urlSeq=302>                     |      http | production opt-in     | superstar-1   | 비회원 이름 GET 검색. 개인별 대회 결과만 저장하고 레이팅·연락처는 제외                                                                                                    |
| yongintt    | <https://cafe.daum.net/yongintt>                                      |      http | production opt-in     | yongintt-3    | 카카오 공식 카페 검색 API로 `{이름} 대회` 최신 50건 조회. 해당 카페 URL·완전 일치 이름 근거만 저장하고 입상자 사진 게시판은 구조화 기록에서 제외                          |
| iping       | <https://www.iping.club/?pg=Search>                                   |      http | 인증형 / opt-in       | iping-2       | CP949 로그인 세션과 현재 로그인·로그아웃 화면 식별로 전국오픈·시군구 입상과 출전 이력 조회                                                                                |
| band        | <https://band.us/>                                                    |    manual | 사용자 출처 목록 제외 | manual-0      | scraping 금지. 향후 정책 검토를 위해 내부 식별자만 유지                                                                                                                   |

2026-08-12 애즈트리 robots.txt, 공개 검색 form/result와 이용약관을 확인했습니다. 일반 user-agent에 공개 검색 경로가 금지되어 있지 않고 약관에서 자동 수집 금지 문구를 찾지 못했지만, 이는 영구적 재사용 허가를 뜻하지 않습니다. 실제 응답이나 정책을 확인하지 않은 나머지는 추정이며 사실로 단정하지 않습니다.

2026-08-14 뉴티티플레이의 비회원 `member_search` form과 결과를 확인했습니다. 화면 form은 POST지만 동일한 `bo_table`, `sfl`, `stx`, `page`의 GET 요청도 서버 렌더링 결과를 반환합니다. 일반 user-agent의 `robots.txt`는 `/bbs/board.php`를 금지하지 않지만 특정 bot 차단과 이용약관의 사이트 정보 이용 제한이 있으므로 이를 운영 허가로 해석하지 않습니다. parser는 탁구인검색 결과 표만 읽고 페이지 운영자 연락처·주소, 세션 쿠키와 원문 HTML을 저장하지 않습니다. 서면 허가 또는 동등한 운영 확인 전에는 `CRAWLER_SOURCE_NEWTTPLAY_ENABLED=false`와 DB `sources.enabled=false`를 유지합니다.

2026-08-12 대한탁구협회 디비전 공개 선수조회는 로그인 없이 이름·T1~T7 등급·팀·지역을 조회할 수 있음을 확인했습니다. `robots.txt`는 별도 정책 대신 404를 반환했습니다. 요청은 6시간 cooldown과 출처별 최소 간격을 적용하며, 응답에 포함된 휴대폰 필드와 RT점수는 저장하지 않습니다.

2026-08-12 에어핑퐁과 오케이핑퐁은 비회원 공개 검색과 HTML 구조를 확인해 parser를 구현했습니다. 두 사이트 약관의 사전승낙 제한 때문에 비활성화했으나, 같은 날 저장소 운영자가 수집 승낙 완료를 확인해 DB와 Edge의 opt-in 운영 스위치를 활성화했습니다. 승낙 범위가 변경되거나 철회되면 두 스위치를 즉시 false로 전환합니다.

2026-08-12 마이티티 `robots.txt`는 일반 user-agent 전체 접근을 허용하며, 참가 정보 검색은 로그인 없이 JSF form GET/POST로 동작합니다. browser 자동화 없이 HTTP adapter로 구현했고, 검색에 필요한 `JSESSIONID`와 ViewState는 단일 요청 흐름에서만 사용하며 DB와 출처 URL에 저장하지 않습니다.

2026-08-12 슈퍼스타탁구 `robots.txt`는 `Form.jsp`, `Manager.jsp`, `/ok/`, `Upload.jsp`를 제외하고 공개 `open/Do.jsp?urlSeq=302&userNm=...` 개인별 결과 경로를 막지 않습니다. 비회원 GET 검색에서 고유번호·대회일·대회명·부수·결과를 확인했습니다. parser는 이 결과 표만 읽고 별도 레이팅 표와 화면의 연락처를 수집하지 않습니다.

2026-08-12 확인 결과 아이핑 메인과 대회 목록은 비회원에게 공개되지만 `pg=Search&SchVal=...` 선수 검색은 로그인 화면으로 전환됩니다. 로그인 후 검색 화면은 전국오픈 입상(`Ctype=A`), 시군구 입상(`Ctype=B`), 출전 이력(`B=Y`)을 분리하고 선수명·관측 부수·소속·대회명·대회일·종목·순위를 표로 제공합니다. 사이트는 CP949/EUC-KR 쿼리와 응답을 사용합니다. BUSU는 전용 최소권한 계정으로 조회마다 새 PHP 세션을 만들고 이 세 화면만 파싱하며 자격증명·쿠키·원문 HTML은 보관하지 않습니다. 자격증명은 브라우저나 `VITE_`에 두지 않고 Supabase Edge Secrets에 보관하며, GitHub Actions secret은 배포 시 런타임 secret을 설정하는 전달 수단으로만 사용합니다. CAPTCHA/MFA 또는 사람 확인 절차가 나타나면 우회하지 않습니다.

2026-08-13 공개 구조 재점검에서 오케이핑퐁은 결과가 없을 때도 8열 표 안에 `colspan=8` 안내 행을 반환하는 것을 확인했습니다. 이 행은 구조 변경이 아니라 정상 0건으로 처리합니다. 에어핑퐁은 합성 검색에서 정상 HTML을 반환했지만 Supabase Edge와 출처 사이의 응답이 장시간 지연되는 사례가 있어 Edge에서는 5초 단일 시도로 종료하고 화면이 최소 5초 간격으로 최대 2회 다시 요청합니다. 별도 진단용 workspace live CLI adapter는 16초 timeout과 일시 오류 1회 재시도를 유지합니다. 아이핑은 로그인 성공 판정을 과거 `mb_logout.php` 문자열 하나에 고정하지 않고 현재 로그인 폼·로그아웃 링크·사람 확인 화면을 구분하도록 변경했습니다. 같은 날 아이핑의 출처 전체 60초 잠금을 제거하고 `출처 + 정규화 검색어`별 5~60초 제한으로 통일해 다른 이름 검색이 서로 막지 않도록 했으며, 계정 보호를 위해 분당 실제 요청 6회의 별도 전체 예산을 추가했습니다.

2026-08-12 카카오 공식 문서에서 Daum 카페 검색 API의 무료 제공량이 전체 Daum 검색 일 5만 건, 카페 검색 일 3만 건, 전체 API 월 300만 건임을 확인했습니다. BUSU는 선수 검색마다 최신순 1페이지(최대 50개 문서)만 요청하며 추가 유료 쿼터를 신청하지 않습니다. 실제 `임대현 대회` 검색에서 용인 카페의 2025 시장기 승급자 공지와 입상자 사진 글이 공개 검색 결과로 확인됐습니다. parser는 `cafe.daum.net/yongintt/` URL과 검색 요약의 정확한 이름만 허용하고 제목·요약·게시일·원문 URL 외 본문이나 개인정보를 저장하지 않습니다.
