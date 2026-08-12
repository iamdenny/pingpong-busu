# 마이티티 adapter

공개 `player_list.xhtml`의 JSF form을 GET한 뒤 같은 단기 세션으로 검색 POST를 보내는 `mytt-2` HTTP adapter입니다. 로그인이나 브라우저 자동화가 필요하지 않습니다. 응답의 `JSESSIONID`와 `;jsessionid` URL은 저장하지 않고 고정 공개 검색 URL만 출처로 보존합니다.
