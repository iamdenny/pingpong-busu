# 출처 메모

| 출처 | URL | 예상 mode | 상태 | parser | 확인 사항 |
|---|---|---:|---|---|---|
| mock | `example.invalid` | http | enabled | mock-1/2 | 합성 fixture 전용 |
| airping | https://airping.co.kr/11player/01.php | http | parser ready / disabled | airping-1 | 공개 검색 parser와 합성 fixture 완료. 약관상 사전 승낙 없는 정보 복제·제3자 제공 제한으로 운영 자동 연동하지 않음 |
| astree | https://astree.co.kr/bbs/board.php?bo_table=member_search | http | production opt-in | astree-3 | UTF-8 GET, 최대 2페이지, 6시간 cooldown, 정규식 기반 도·시·군·구 및 부수 체계 추출 |
| ttadivision | https://ttadivision.sports.or.kr/statistic/moveSearchOteamPlayer.do | http | production opt-in | ttadivision-1 | 공개 이름 검색, T1~T7·소속팀·지역만 저장. 휴대폰과 RT점수는 저장하지 않음. 서버가 잘못 제공하는 중간 인증서 대신 leaf AIA의 공식 Sectigo DV R36 CA를 추가해 TLS 검증 유지 |
| okpingpong | http://okpingpong.co.kr/04match/08.php | http | parser ready / disabled | okpingpong-1 | 공개 검색 parser와 합성 fixture 완료. 약관상 사전 승낙 없는 정보 복제·제3자 제공 제한으로 운영 자동 연동하지 않음 |
| mytt | https://mytt.kr/main/player_list.xhtml | http | production opt-in | mytt-1 | robots 전체 허용, 비회원 JSF GET/POST 공개 검색. 단기 JSESSIONID는 요청에만 사용하고 저장하지 않음 |
| band | https://band.us/ | manual | 사용자 출처 목록 제외 | manual-0 | scraping 금지. 향후 정책 검토를 위해 내부 식별자만 유지 |

2026-08-12 애즈트리 robots.txt, 공개 검색 form/result와 이용약관을 확인했습니다. 일반 user-agent에 공개 검색 경로가 금지되어 있지 않고 약관에서 자동 수집 금지 문구를 찾지 못했지만, 이는 영구적 재사용 허가를 뜻하지 않습니다. 실제 응답이나 정책을 확인하지 않은 나머지는 추정이며 사실로 단정하지 않습니다.

2026-08-12 대한탁구협회 디비전 공개 선수조회는 로그인 없이 이름·T1~T7 등급·팀·지역을 조회할 수 있음을 확인했습니다. `robots.txt`는 별도 정책 대신 404를 반환했습니다. 요청은 6시간 cooldown과 출처별 최소 간격을 적용하며, 응답에 포함된 휴대폰 필드와 RT점수는 저장하지 않습니다.

2026-08-12 에어핑퐁과 오케이핑퐁은 비회원 공개 검색과 HTML 구조를 확인해 parser를 구현했습니다. 두 사이트 약관에는 서비스에서 얻은 정보를 사전승낙 없이 이용 목적 외로 복제하거나 제3자에게 제공하는 행위를 제한하는 문구가 있어 운영 환경 변수와 DB 상태를 false로 유지합니다.

2026-08-12 마이티티 `robots.txt`는 일반 user-agent 전체 접근을 허용하며, 참가 정보 검색은 로그인 없이 JSF form GET/POST로 동작합니다. browser 자동화 없이 HTTP adapter로 구현했고, 검색에 필요한 `JSESSIONID`와 ViewState는 단일 요청 흐름에서만 사용하며 DB와 출처 URL에 저장하지 않습니다.
