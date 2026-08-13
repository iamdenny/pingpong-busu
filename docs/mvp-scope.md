---
summary: "최초 BUSU MVP에 포함된 기능과 의도적으로 제외한 기능을 기록한다."
read_when:
  - 초기 MVP 범위를 확인할 때
  - roadmap 우선순위를 검토할 때
title: "MVP 범위"
---

# MVP 범위

포함: demo 검색, 동명이인 후보 분리, 체계·부수별 입상/참가 기록 요약과 후보 필터, 최근 출전 대회·원문 종목명을 확인하고 개수 제한 없이 검수된 탁구 별칭 그룹에 배정하는 참여형 동명이인 편집, 입력이나 기억이 필요 없는 브라우저 자동 익명 편집자 ID, 후보별 별칭이 보이는 공개 변경 이력과 전체 원복, 상세 timeline, 출처 비교, 완료 후 접히는 refresh status와 제한된 수동 재시도, mock crawler, opt-in 에어핑퐁·애즈트리·대한탁구협회 디비전·오케이핑퐁·마이티티·슈퍼스타탁구·용인탁구협회 다음 카페 HTTP adapter, 서버 전용 계정으로 동작하는 opt-in 아이핑 인증형 HTTP adapter, Supabase schema/RLS/seed, Edge Functions, 되돌릴 수 있는 canonical merge RPC, `YYYY.WEEK.SEQ` 버전을 표시하는 GitHub Pages 배포.

미포함: 공식 부수 판정, BAND crawling, 전체 실사이트 backfill, 회원가입, 운영자 승인 UI, 이름만으로 실행되는 자동 선수 병합, 광고, 결제. 명시적인 사용자 선택에 따른 canonical 연결과 충돌 방지 원복은 앱에서 실행합니다. 대회 부수검증 route/UI는 준비 중 설명만 제공합니다.
