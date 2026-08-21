---
summary: "BUSU 최초 MVP 수직 기능을 구축한 단계와 기술 결정을 기록한다."
read_when:
  - 초기 구현 의도와 선택 배경을 확인할 때
  - 현재 제품 스펙과 최초 계획을 비교할 때
title: "MVP 구현 계획"
---

# MVP 구현 계획

## 목표

환경 변수 없이 가상 데이터로 검색부터 선수 상세, 출처 비교까지 동작하고, 동일한 domain/crawler 규칙을 Supabase 연동으로 확장할 수 있는 첫 번째 수직 기능을 만든다.

## 단계

1. Node 24와 pnpm workspace, strict TypeScript 공통 설정을 만든다.
2. 이름 정규화, canonical hash, natural/content hash, diff/upsert 판정을 순수 함수로 구현한다.
3. 공통 `SourceAdapter` 계약, 완전한 mock adapter, 비활성 실출처 skeleton을 만든다.
4. repository interface를 기준으로 demo와 Supabase 구현을 분리한다.
5. React UI에서 저장된 demo 결과를 먼저 표시하고 출처별 갱신 상태를 독립적으로 보여준다.
6. Supabase schema/RLS/seed와 mock 기반 Edge Functions를 준비한다.
7. CI, Pages, 수동 crawler workflow와 운영 문서를 작성한다.
8. lint, typecheck, unit/component test, build, Playwright smoke를 검증한다.

## 결정과 가정

- 현재 active LTS인 Node 24를 사용한다.
- GitHub Pages의 새로고침 호환성을 위해 `HashRouter`를 사용한다. 로컬 기본 Vite asset base는 `/pingpong-busu/`, 커스텀 도메인 production base는 `/`로 둔다.
- Supabase 공개 환경 변수가 둘 다 있을 때만 Supabase repository를 선택한다. 그렇지 않으면 명시적 demo mode다.
- Edge Function 공유 코드는 `supabase/functions/_shared`의 edge-compatible 모듈을 사용한다. 핵심 알고리즘의 기준 구현은 workspace domain package이며 Edge 배포용 sync 지점은 문서화한다.
- 실사이트는 정책/구조 확인 전까지 전부 disabled이며 네트워크를 호출하지 않는다. BAND는 manual-only다.
- fixture crawler의 로컬 반복 실행 시나리오는 `.busu-crawler-state.json`에 비민감 정규화 상태만 저장한다.
