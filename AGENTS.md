# BUSU repository guide

BUSU는 여러 공개 탁구 대회 출처의 선수 부수·소속·입상 기록을 원문 근거와 함께 모아 보여주는 한국어 웹 서비스다. 공식 부수 판정이나 이름 기반 자동 병합은 하지 않는다. 현재 제품 기준은 [제품 스펙](docs/product-spec.md)이다.

## Workspaces

| 경로                       | 책임                                                   | 런타임             |
| -------------------------- | ------------------------------------------------------ | ------------------ |
| `apps/web`                 | React UI, repository 구현, 로컬 live middleware        | Browser / Vite     |
| `packages/domain`          | 정규화, 부수·지역·입상 규칙, 모델, hash, 정렬          | Node / Browser     |
| `packages/crawler-core`    | source adapter 계약, 오류, revision 판정               | Node               |
| `packages/source-adapters` | 출처별 HTTP adapter, parser, Zod schema                | Node / Edge bundle |
| `supabase`                 | PostgreSQL migration, public views/RPC, Edge Functions | Supabase           |

## Repository rules

- 사용자 화면과 사용자 대상 문서는 한국어를 기본으로 한다.
- 코드 식별자, 타입, DB 컬럼, 커밋 메시지는 영어를 사용한다.
- 이 저장소의 Git 작성자는 `Denny Lim <hi.iamdenny@gmail.com>`을 사용한다. GitHub 계정은 `iamdenny`다.
- TypeScript strict mode를 유지하고 `any`를 사용하지 않는다. 불가피하면 이유를 주석으로 남긴다.
- 외부 데이터는 Zod 또는 동등한 런타임 검증을 거친다.
- HTML 문자열을 React에 직접 렌더링하지 않는다.
- service role key, crawler secret, admin token을 브라우저 번들에 넣지 않는다. `VITE_`에는 공개 값만 둔다.
- 이름만 같다는 이유로 선수를 자동 병합하지 않는다.
- 동명이인 참여 편집은 사용자가 직접 입력한 탁구 별칭 하나 이상에 기록을 명시적으로 그룹화하며 후보 수에 고정 상한을 두지 않는다. 별칭은 길이·문자·개인정보 형태를 검증하고 실제 실력·부수·공식 등급으로 해석하지 않는다.
- 동명이인 분류는 한 편집의 모든 그룹을 원자적으로 반영하고 공개 이력을 남기며, 최신 편집 전체를 원자적으로 원복할 수 있어야 한다.
- live crawling은 기본 비활성화하고 BAND scraping은 구현하지 않는다.
- parser 변경 시 개인정보를 제거한 synthetic fixture test를 추가한다.
- 신규 기능에는 가능한 한 unit test를 추가한다.
- 임시 mock과 실제 공개 데이터를 화면에서 명확히 구분한다.
- 전화번호, 이메일, 전체 생년월일, 주소 등 민감 개인정보를 수집하지 않는다.
- 사용자 화면에서 “현재 확정 부수”라는 표현을 사용하지 않는다.
- 지나친 추상화와 불필요한 마이크로서비스를 만들지 않는다.
- 변경 후 README와 관련 문서를 함께 갱신한다.
- 테스트 실패를 무시하거나 삭제해서 통과시키지 않는다.
- 제품 버전의 단일 기준은 루트 `package.json`의 `version`이다. workspace package, 소스, 환경 변수에 별도 버전을 중복 기록하지 않는다.
- 배포 PR은 `pnpm release:bump`로 `YYYY.WEEK.SEQ` 버전을 먼저 올리고 변경을 함께 커밋한다. `SEQ`는 ISO 주마다 `0`에서 시작해 배포마다 하나씩 증가한다.
- `main` 배포는 같은 버전 태그가 없어야 하며, Pages 게시 전에 `v{version}` 태그와 GitHub Release 및 자동 릴리즈 노트를 생성한다. 버전을 올리지 않은 배포는 실패해야 한다.

## Domain invariants

- 최근순은 `대회일 → 게시일 → 확인 시각` 순서로 판단한다.
- 입상은 우승·준우승·1~3위·2강·4강까지만 집계한다. 8강 이하는 참가 이력이다.
- 참가 종목에 `여자` 또는 `여성`이 있으면 내부적으로 `women`으로 구분하되 사용자 화면에는 `통합부수 여자6부`처럼 표시한다.
- T1~T7 또는 디비전 명시는 디비전부수다.
- `오픈`이 명시된 기록만 오픈부수다. 일반 숫자 부수는 시·군·구 지역명과 무관하게 통합부수다.
- `지역부수`라는 체계가 명시된 경우에만 지역부수로 보존한다.
- 도·시·군·구 추정은 정규표현식과 제한된 별칭 사전만 사용하며 거주지나 동일인 병합 근거로 쓰지 않는다.

## Evidence capture

| 항목          | 값                                                   |
| ------------- | ---------------------------------------------------- |
| 화면          | React 검색·선수 상세 페이지                          |
| 개발 명령     | `pnpm dev`                                           |
| URL           | `http://localhost:5173/pingpong-busu/`               |
| 검증 방법     | in-app browser 또는 Playwright, terminal test output |
| 기본 viewport | Desktop 및 700px 이하 mobile                         |

## Commands

- 설치/개발: `pnpm install`, `pnpm dev`
- 필수 게이트: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm docs-check:scan`
- 브라우저: `pnpm test:e2e`
- fixture: `pnpm crawl:fixture --query 김탁구 --version 1`
- live opt-in: `pnpm crawl:live --query 김탁구 --source astree`
- DB 용량: `pnpm db:size`
- 릴리즈: `pnpm release:check`, `pnpm release:bump`

## Documentation

| 문서                                               | 용도                                   |
| -------------------------------------------------- | -------------------------------------- |
| [docs/README.md](docs/README.md)                   | 문서 인덱스와 읽는 순서                |
| [docs/product-spec.md](docs/product-spec.md)       | 현재 구현의 기준 제품 스펙과 수용 조건 |
| [docs/architecture.md](docs/architecture.md)       | 런타임 경계와 데이터 흐름              |
| [docs/data-model.md](docs/data-model.md)           | 엔터티, 시간축, hash/revision 규칙     |
| [docs/crawling-policy.md](docs/crawling-policy.md) | 외부 출처 접근·수집 안전 정책          |
| [docs/source-notes.md](docs/source-notes.md)       | 출처별 상태, URL, parser version       |
| [docs/adding-a-source.md](docs/adding-a-source.md) | 신규 출처 추가 절차                    |
| [docs/operations.md](docs/operations.md)           | Supabase와 GitHub 배포·장애 대응       |
| [docs/commands.md](docs/commands.md)               | 개발·수집·배포 명령                    |
| [docs/testing.md](docs/testing.md)                 | 테스트 계층과 완료 게이트              |
| [docs/codemap.md](docs/codemap.md)                 | 디렉터리별 책임과 변경 경로            |
| [apps/web/DESIGN.md](apps/web/DESIGN.md)           | UI 디자인 시스템                       |
| [docs/roadmap.md](docs/roadmap.md)                 | 구현 이후의 제품 로드맵                |

## Knowledge graph

아키텍처나 모듈 관계를 조사할 때만 `graphify-out/GRAPH_REPORT.md`를 읽는다. 이 파일은 재생성 가능한 로컬 산출물이므로 커밋하지 않는다.
