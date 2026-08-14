# BUSU 문서

이 디렉터리는 현재 구현과 운영 계약의 기준 문서를 보관한다. 기능 동작이 바뀌면 코드·테스트와 같은 커밋에서 관련 문서를 갱신한다.

## 권장 읽기 순서

1. [제품 스펙](product-spec.md) — 사용자 흐름, 기능 요구사항, 도메인 규칙, 수용 조건
2. [아키텍처](architecture.md) — 웹·domain·adapter·Supabase 경계
3. [데이터 모델](data-model.md)과 [부수 체계 전환 기준](division-transition-rules.md) — identity, result, 시간축, 지역별 역사 규칙
4. [수집 정책](crawling-policy.md)과 [출처 메모](source-notes.md) — 실출처 활성화 조건
5. [운영](operations.md) — GitHub Pages와 Supabase 배포

## 개발 문서

| 문서                                             | 내용                        |
| ------------------------------------------------ | --------------------------- |
| [codemap.md](codemap.md)                         | 디렉터리별 책임과 변경 영향 |
| [commands.md](commands.md)                       | 개발·검증·수집 명령         |
| [testing.md](testing.md)                         | 테스트 계층과 필수 게이트   |
| [adding-a-source.md](adding-a-source.md)         | 신규 출처 adapter 등록 절차 |
| [implementation-plan.md](implementation-plan.md) | 최초 MVP 구축 결정 기록     |
| [mvp-scope.md](mvp-scope.md)                     | 최초 MVP 포함/제외 범위     |
| [roadmap.md](roadmap.md)                         | 다음 제품 단계              |

UI 규칙은 [apps/web/DESIGN.md](../apps/web/DESIGN.md), 에이전트 작업 규칙은 [AGENTS.md](../AGENTS.md), Claude용 진입점은 [CLAUDE.md](../CLAUDE.md)에 있다.
