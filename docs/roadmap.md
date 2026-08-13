---
summary: "BUSU MVP 이후의 출처 확대, identity 검토, 규칙 엔진과 운영 기능 순서를 제시한다."
read_when:
  - 다음 개발 우선순위를 정할 때
  - 현재 구현과 장기 범위를 구분할 때
title: "제품 로드맵"
---

# 제품 로드맵

## 완료

1. pnpm monorepo와 strict TypeScript 기반 구축
2. demo 검색·동명이인 후보·선수 상세 수직 기능
3. Supabase schema/RLS/public views/RPC/Edge Functions
4. 애즈트리·대한탁구협회 디비전·마이티티 opt-in adapter
5. 에어핑퐁·오케이핑퐁 parser와 synthetic fixture, 승인 후 운영 활성화와 일시 오류 재시도
6. 완료 후 접히고 수동 재시도를 제한하는 출처별 진행 상태, 클릭 가능한 체계·부수별 입상/참가 요약
7. 슈퍼스타탁구 공개 개인별 결과와 로그인 상태를 구분하는 아이핑 인증형 선수 기록 adapter
8. 이름+지역 동명이인 검색, 입상/출전 탭, 입상 등수·날짜 요약
9. `YYYY.WEEK.SEQ` 버전을 모든 페이지 footer에 표시하는 GitHub Pages 및 Supabase 배포 workflow
10. 카카오 공식 무료 검색 API 기반 용인탁구협회 다음 카페 adapter
11. 최근 출전 대회·원문 종목명 기반 동명이인 제보와 충돌 방지 병합·원복 RPC

## 다음 단계

1. 공개 refresh에 gateway rate limit, quota, 운영 metric 추가
2. 출처 정책·parser health 정기 점검과 실패 알림
3. 일반 소속·지역 정정 제보와 근거 URL 제출
4. 구현된 동명이인 merge/원복 RPC를 사용하는 관리자 인증 UI
5. 대회 규정 근거를 이용한 최소 출전 가능 부수 검증 엔진
6. 운영자 CSV 업로드와 provenance 검증

## 보류

- BAND scraping
- 공식 부수 확정 표현
- 광고·결제·회원가입
