---
summary: "최초 BUSU MVP에 포함된 기능과 의도적으로 제외한 기능을 기록한다."
read_when:
  - 초기 MVP 범위를 확인할 때
  - roadmap 우선순위를 검토할 때
title: "MVP 범위"
---

# MVP 범위

포함: demo 검색, 동명이인 후보 분리, 비공개 4자리 구분 코드를 이용한 참여자 동일인 후보 제보와 관리자 검토 queue, 상세 timeline, 출처 비교, refresh status, mock crawler, opt-in 에어핑퐁·애즈트리·대한탁구협회 디비전·오케이핑퐁·마이티티·슈퍼스타탁구·용인탁구협회 다음 카페 HTTP adapter, 서버 전용 계정으로 동작하는 opt-in 아이핑 인증형 HTTP adapter, Supabase schema/RLS/seed, Edge Functions, GitHub Pages 배포.

미포함: 공식 부수 판정, BAND crawling, 전체 실사이트 backfill, 회원가입, 운영자 인증 UI, 자동 선수 병합, 광고, 결제. 승인 후 canonical merge와 충돌 방지 원복 RPC는 포함하지만 현재는 Supabase Studio에서 service role로만 실행합니다. 대회 부수검증 route/UI는 준비 중 설명만 제공합니다.
