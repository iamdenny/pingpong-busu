# BUSU Claude context

작업을 시작할 때 [AGENTS.md](AGENTS.md)를 먼저 읽고 저장소 규칙, 도메인 불변식, 완료 게이트를 따른다.

## Canonical documents

- 현재 제품 동작과 수용 조건: [docs/product-spec.md](docs/product-spec.md)
- 런타임·모듈 경계: [docs/architecture.md](docs/architecture.md)
- 데이터·부수·입상 규칙: [docs/data-model.md](docs/data-model.md)
- 외부 출처 안전 정책: [docs/crawling-policy.md](docs/crawling-policy.md)
- 배포와 장애 대응: [docs/operations.md](docs/operations.md)
- 전체 문서 인덱스: [docs/README.md](docs/README.md)

## Working conventions

- 이 저장소의 GitHub 계정은 `iamdenny`, 커밋 작성자는 `Denny Lim <hi.iamdenny@gmail.com>`이다.
- 구현과 문서가 다르면 테스트된 소스 동작을 확인한 뒤 기준 문서를 함께 갱신한다.
- 외부 parser 변경은 synthetic fixture와 parser version을 함께 올린다.
- 공개 웹 번들에는 publishable key 외의 Supabase 비밀값을 넣지 않는다.
- 완료 전 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 모두 통과시킨다.

## Knowledge graph

아키텍처, 의존성, workspace 관계를 다룰 때만 `graphify-out/GRAPH_REPORT.md`를 읽는다. 매 세션에 자동으로 불러오지 않는다.
