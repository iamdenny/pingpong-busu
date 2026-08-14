# 에어핑퐁 adapter

공개 선수 검색 HTML을 정규화하는 `airping-3` 파서와 HTTP adapter입니다. 2026-08-12 저장소 운영자가 수집 승낙 완료를 확인해 production opt-in source로 전환했습니다. 원문 URL과 선수 대회 기록만 저장하며 서버·DB의 독립 스위치로 즉시 중지할 수 있습니다.

이 workspace adapter는 수동 live CLI 진단에서 16초 timeout과 일시 오류 1회 재시도를 사용합니다. production Supabase Edge는 실행 시간을 짧게 유지하기 위해 5초 단일 시도 뒤 `source_timeout`과 5초 재시도 정보를 반환하고, React 화면이 최대 2회 다시 요청합니다.
