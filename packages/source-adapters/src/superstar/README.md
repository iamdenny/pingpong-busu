# 슈퍼스타탁구 출처

로그인 없이 공개되는 개인별 결과 GET 검색을 사용하는 `superstar-2` HTTP adapter다. 이름, 출처 고유번호, 대회일, 대회·종목명, 관측 부수와 결과만 저장한다. 별도 레이팅 표, 이메일, 전화번호 등은 수집하지 않는다.

- Search: `https://www.superstar.kr/open/Do.jsp?urlSeq=302&userNm=<name>`
- Parser version: `superstar-2`
- robots.txt: 공개 `Do.jsp` 검색 경로 허용, 관리자·업로드 경로 제외
- Safety: 8초 timeout, 출처별 최소 요청 간격, 6시간 query cache, synthetic fixture test
