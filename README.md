# BUSU

탁구 선수 부수·입상 기록 통합검색 서비스

Korean table tennis player rank and tournament record search.

여러 탁구 대회 사이트에 흩어진 선수의 출전 부수, 입상 기록, 소속 이력과 출처를 한곳에서 조회하고 비교합니다. BUSU는 부수를 판정하는 서비스가 아니라 판단 근거를 모으는 서비스입니다.

현재 구현의 사용자 흐름·도메인 규칙·수용 조건은 [제품 스펙](./docs/product-spec.md), 전체 문서 목록은 [문서 인덱스](./docs/README.md)를 참고하세요.

## 현재 MVP

- 탁구 라켓과 부수 단계를 결합한 BUSU 심볼, 브라우저 파비콘과 홈 헤더 브랜딩
- 홈·검색 결과·선수 상세별 의미 있는 title, description, canonical, Open Graph와 Twitter 메타데이터
- 환경 변수 없이 동작하는 한국어 demo 검색 결과 3건(가상 선수)
- 홈의 `김탁구`, `이라켓`, `김탁구 용인` 빠른 예시 검색
- 홈의 최근 검색어 10개 브라우저 저장, 최신순·중복 제거와 전체 삭제
- 검색 결과 상단의 최근 공개 기록 기반 오픈·통합·지역·디비전부수별 입상·참가 건수, 클릭형 후보 필터와 `통합부수 여자6부` 형식의 여자 종목 표기
- 김탁구 동명이인 2명의 지역·소속 분리
- `김미진 용인`처럼 이름 뒤에 지역을 붙이는 동명이인 필터
- 동명이인 후보를 직접 선택하고 비공개 4자리 구분 코드로 관리자 검토를 요청하는 참여자 제보
- 세로 여백을 줄인 검색 카드의 최신 입상 등수와 다음 줄 대회일 요약, 카드 전체 상세 이동
- 대회일 우선·게시일 보조 최신순 선수 상세 타임라인, 출처 대회에 표시된 전체 종목명, 최근 관측 부수, 출처 비교와 독립 갱신 상태
- 홈에서 운영 source catalog를 작은 요약으로 표시하고, 상세 펼침에서 상태와 원문 URL 제공
- 검색 시 활성 출처만 갱신하고 시간 초과·접근 차단·구조 변경 등 실제 원인, 호출 제한 남은 시간과 자동 재시도를 표시. 저장된 기록이 없을 때만 조회 중 상세를 기본으로 펼치고, 기록이 있거나 조회가 완료되면 요약만 표시. 실패한 출처는 5초 간격·최대 3회 수동 재시도 가능
- 승인된 에어핑퐁·오케이핑퐁 공개 선수 검색을 출처별 opt-in 수집으로 제공하고, 긴급 중지 시 원문 검색 링크로 대체
- strict TypeScript domain 정규화, 안정 해시, diff/revision 판정
- mock adapter와 fixture crawler, synthetic fixture로 검증한 애즈트리·대한탁구협회 디비전·마이티티·슈퍼스타탁구·용인탁구협회 다음 카페·아이핑 HTTP adapter
- Supabase PostgreSQL migration, RLS, synthetic seed, Edge Functions
- GitHub Actions CI, Pages 배포, 수동 crawler workflow
- GitHub Pages 배포마다 자동 생성하는 `YYYY.WEEK.SEQ` 버전과 모든 페이지 하단 버전 표시

## 실행

Node 24와 pnpm 11.17을 사용합니다.

```bash
pnpm install
pnpm dev
```

`http://localhost:5173/pingpong-busu/`에서 열고 `김탁구`를 검색합니다. 주요 검증 명령은 다음과 같습니다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Demo mode

`VITE_SUPABASE_URL` 또는 `VITE_SUPABASE_PUBLISHABLE_KEY`가 없거나 `VITE_APP_MODE=demo`이면 자동으로 demo repository를 사용합니다. 기존 프로젝트의 `VITE_SUPABASE_ANON_KEY`도 호환합니다. 화면 상단에 가상 데이터임을 표시합니다. 모든 인물과 대회는 합성 데이터입니다.

로컬 전용 middleware를 사용할 때는 `.env.local`에서 `VITE_DEV_LIVE_SEARCH=true`, `CRAWL_LIVE=true`, `CRAWLER_SOURCE_ASTREE_ENABLED=true`를 함께 설정합니다. 배포된 Supabase Edge Function에서 활성 출처를 조회할 때는 `VITE_DEV_LIVE_SEARCH=false`, `VITE_SOURCE_REFRESH_ENABLED=true`로 설정하고 서버에 출처별 플래그를 둡니다. 용인탁구협회 다음 카페는 서버의 `KAKAO_REST_API_KEY`, 아이핑은 `IPING_USERNAME`과 `IPING_PASSWORD`도 필요합니다. 브라우저가 외부 출처를 직접 호출하지 않으며 service key, 외부 API key, 로그인 자격증명도 받지 않습니다. 동일 이름은 소속별 후보로 분리하고 자동 병합하지 않습니다. `.env.local`은 배포에 포함되지 않습니다.

## Supabase 설정

```bash
cp .env.example .env.local
supabase start
supabase db reset
supabase functions serve
```

[초기 migration](./supabase/migrations/202608120001_initial_schema.sql)은 테이블, index, public view, RLS를 함께 만듭니다. 브라우저에는 `VITE_SUPABASE_URL`과 publishable key만 둡니다. `SUPABASE_SERVICE_ROLE_KEY` 또는 secret key는 trusted crawler/운영 환경에서만 사용합니다. production 전환은 두 public 값을 설정하고 `VITE_APP_MODE=production`으로 빌드합니다.

Supabase repository는 공개 검색/상세 view와 refresh Edge Function을 사용합니다. [두 번째 migration](./supabase/migrations/202608120002_astree_refresh.sql)이 identity, revision upsert RPC와 상세 view를 추가합니다. Edge 환경에 `CRAWL_LIVE=true`, 활성 출처별 환경 변수를 설정하고 DB의 `sources.enabled`도 true로 둬야 실제 요청이 활성화됩니다. 배포 workflow는 루트 package 버전으로 `CRAWLER_USER_AGENT=BUSU/{version}`을 설정합니다. 마이티티는 단기 JSF 세션을 검색 요청에만 쓰고 저장하지 않으며, 슈퍼스타탁구는 공개 개인별 결과 GET 검색만 사용합니다. 용인탁구협회 카페는 카카오 공식 카페 검색 API를 검색당 1회 호출하고 용인 카페 URL만 남깁니다. 아이핑은 서버 전용 계정으로 조회마다 새 PHP 세션을 만들고 CP949 검색 결과만 처리하며 세션 식별자와 자격증명은 저장하지 않습니다. 공개 refresh에서는 검색어와 무관한 아이핑 출처 전체 60초 제한을 추가해 서버 계정의 대리 호출을 방어합니다. 에어핑퐁·오케이핑퐁과 아이핑의 멱등 GET 요청은 일시적인 timeout과 5xx에 한해 한 번만 재시도하고, 로그인 POST·인증 실패·구조 변경은 자동 반복하지 않습니다.

선수 기록은 크롤러 확인 시각이 아니라 `대회일 → 게시일 → 확인 시각` 우선순위로 최신순 정렬합니다. 대회일과 게시일이 모두 없는 기록은 날짜가 있는 기록 뒤에 표시합니다.

입상 기록은 공개 결과가 우승·준우승·1~3위·2강·4강으로 표시된 경우만 집계합니다. `예선 12조 3위`나 `조별 1위`처럼 예선·조별 문맥의 순위와 8강 이하, 예선·본선 진출 등은 전체 이력에는 남기되 입상 건수에는 포함하지 않습니다.

검색 결과는 기본 `입상` 탭과 `출전` 탭으로 나눕니다. 4강 이상 입상 기록이 한 건 이상인 후보는 `입상`, 입상 없이 참가 기록만 있는 후보는 `출전`에 표시해 동명이인이 많은 검색에서도 먼저 확인할 대상을 줄입니다. 상단 `현재 추정 부수`의 `부수·건수`를 누르면 같은 체계와 부수인 후보만 남기고 결과 목록으로 이동하며, 부수 필터 안에서도 입상과 출전을 전환할 수 있습니다.

동명이인이 많으면 `이름 지역` 형식으로 검색합니다. 예를 들어 `김미진 용인`은 외부 출처에는 `김미진`만 조회하고, BUSU 저장 후보를 지역에 `용인`이 포함된 결과로 좁힙니다. 출처에 표시된 소속은 상세 원문 근거로 보존하지만 검토 없이 검색 카드의 대표 소속이나 canonical club으로 자동 승격하지 않습니다. 입상 후보 카드에는 최근 입상부터 등수와 그 다음 줄의 대회일을 최대 두 건 표시하고 나머지는 `외 N건`으로 줄입니다. 반복되는 `상세 보기` 버튼 대신 카드 전체가 해당 후보 상세 링크입니다. `내 기록 구분 돕기`를 열면 각 후보의 최근 출전 대회명과 원문 종목명을 최대 두 건 함께 보여 선택 근거로 사용합니다.

부수는 값(`4부`, `A부`, `T5` 등)과 체계(`open`, `integrated`, `women`, `regional`, `division`)를 별도로 저장합니다. 대한탁구협회 디비전은 공개 선수조회에 표시되는 T1~T7 등급을 `division`으로 저장합니다. 참가 종목에 `여자` 또는 `여성`이 있으면 내부적으로 `women`으로 우선 분류하지만 화면에는 별도 여자부수 체계가 아니라 `통합부수 여자6부`처럼 표시합니다. 단, 종목 내부 구분이 `지역`, `지역남성`, `지역여성`, `지역혼성`이면 대회명에 `오픈`이 있어도 `integrated`로 분류합니다. 사용자가 근거를 제공한 대회별 예외는 버전 관리되는 override가 일반 추론보다 우선하며, 현재 제16회 이하 분당구청장기는 `regional`로 분류합니다. 일반 숫자 부수는 시·군·구 같은 지역명과 무관하게 `integrated`로 분류하고, 이 예외를 제외한 대회명·종목명에 `오픈`이 명시된 경우만 `open`으로 분류합니다. `regional`은 `지역부수` 체계가 명시되거나 대회별 override가 있는 경우에만 사용하며, 부수 값 자체가 없으면 `체계 확인 필요`로 표시합니다.

## Fixture crawler

```bash
pnpm crawl:fixture --query 김탁구 --version 1
pnpm crawl:fixture --query 김탁구 --version 1
pnpm crawl:fixture --query 김탁구 --version 2
```

각 실행은 inserted, unchanged, updated와 revision 수를 출력합니다. 로컬 반복 시나리오 상태는 gitignored `.busu-crawler-state.json`에 저장됩니다. 삭제하면 초기 상태로 돌아갑니다.

## Live crawler 안전 정책

`CRAWL_LIVE=false`가 기본입니다. 현재 production에서는 에어핑퐁·애즈트리·대한탁구협회 디비전·오케이핑퐁·마이티티·슈퍼스타탁구와 용인탁구협회 다음 카페 공개 검색을 출처별 플래그로 활성화합니다. 에어핑퐁과 오케이핑퐁은 저장소 운영자가 수집 승낙 완료를 확인한 범위에서 공개 선수 검색 결과만 처리합니다. 용인 카페는 공식 카카오 API의 무료 쿼터 안에서 `{이름} 대회` 최신 50건을 한 번 조회하고, 용인 카페 URL과 정확한 이름 근거가 있는 검색 요약만 저장합니다. 아이핑은 인증형 adapter 구현을 완료했지만 전용 계정 Secret, `CRAWLER_SOURCE_IPING_ENABLED=true`, DB `sources.enabled=true`를 모두 설정한 경우에만 전국오픈·시군구 입상과 출전 이력을 조회합니다. 디비전 응답의 휴대폰과 슈퍼스타의 레이팅 표는 저장하지 않습니다. CAPTCHA/MFA/접근제어 우회와 BAND scraping은 구현하지 않으며 밴드는 사용자 검색 출처 목록에서도 제외합니다. 신규 출처는 [출처 추가 안내](./docs/adding-a-source.md)의 등록 절차와 정책 점검을 통과한 뒤 개별적으로 활성화합니다.

출처가 지역 칼럼을 제공하지 않을 때는 대회명과 종목명에서 `도·특별시·광역시·특별자치도 → 시·특례시·군·구`를 정규표현식으로 추출합니다. AI 판단은 사용하지 않으며, 접미사가 생략된 일부 지역 대회명만 제한된 별칭 사전을 사용합니다. 화면에서는 이를 `기록 기반 지역 추정`으로 표시하며, 동일인 병합이나 공식 거주지 판단에는 사용하지 않습니다.

## GitHub Pages

Repository Settings → Pages에서 Source를 **GitHub Actions**로 설정합니다. 현재 커스텀 도메인 `https://busu.iamdenny.com/`은 asset base `/`로 배포하고 HTTP 요청은 HTTPS로 전환합니다. production repository variables에는 `VITE_APP_MODE=production`, `VITE_APP_BASE_PATH=/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SOURCE_REFRESH_ENABLED=true`를 설정합니다. `http://iamdenny.com/pingpong-busu/`은 커스텀 도메인으로 이동하는 이전 진입점입니다. publishable key는 브라우저 공개용 값이며, service role/secret key는 Pages workflow에 넣지 않습니다.

제품 버전의 단일 기준은 루트 `package.json`의 `version`이며 `YYYY.WEEK.SEQ` 형식을 사용합니다. `SEQ`는 같은 ISO 주 안에서 `0`부터 순서대로 증가하며, 배포 변경은 `pnpm release:bump`로 같은 주의 순번을 올리거나 새 주에는 `0`으로 초기화합니다. web 화면은 이 값을 직접 읽어 홈·검색 결과·선수 상세를 포함한 모든 페이지의 공통 footer에 표시합니다. Pages workflow는 빌드가 통과한 뒤 `v{version}` 태그와 GitHub Release 및 자동 릴리즈 노트를 먼저 만들고 정적 사이트를 게시합니다. 이미 다른 커밋이 같은 태그를 사용하면 배포를 중단하므로 모든 배포 PR은 버전 변경을 포함해야 합니다.

정적 HTML에는 홈의 기본 OG 메타데이터가 포함되고, React가 실행되면 검색어와 선수 상세 데이터에 맞게 title·description·canonical·Open Graph·Twitter 메타데이터를 갱신합니다. 현재 `HashRouter` 기반 GitHub Pages에서는 URL fragment가 서버로 전달되지 않으므로 자바스크립트를 실행하지 않는 SNS 미리보기 봇은 검색·상세 주소에서도 홈 기본 메타데이터를 표시할 수 있습니다. 검색·상세별 서버 생성 미리보기가 필요하면 별도 OG 렌더링 endpoint 또는 SSR 호스팅을 추가해야 합니다.

## 서버 배포

Supabase backend는 별도 상시 Node 서버가 아니라 managed PostgreSQL과 Edge Functions로 운영합니다. main의 CI가 성공하면 [Supabase 배포 workflow](./.github/workflows/deploy-supabase.yml)가 migration을 적용하고 Edge Functions 및 crawler 안전 플래그를 배포합니다. GitHub `production` environment에는 `SUPABASE_ACCESS_TOKEN` secret과 `SUPABASE_PROJECT_ID` variable이 필요합니다. Supabase CLI의 passwordless login role을 사용하므로 DB 비밀번호를 CI에 저장하지 않습니다. 상세 설정과 운영 활성화 절차는 [운영 문서](./docs/operations.md)를 참고하세요.

## 구조

```text
apps/web             React/Vite UI와 repository 구현
packages/domain      정규화, 모델, hash, diff
packages/crawler-core adapter 계약, 오류, in-memory upsert
packages/source-adapters 출처별 HTTP adapter, parser와 비활성 skeleton
supabase             migration, seed, Edge Functions
scripts              fixture/live CLI와 용량 점검
docs                 설계·정책·운영 문서
```

## 개인정보와 한계

전화번호, 이메일, 전체 생년월일, 주소와 원본 HTML/이미지/PDF를 저장하지 않습니다. 최근 검색어는 서버로 보내 별도 보관하지 않고 현재 브라우저의 `localStorage`에 최대 10개만 저장하며 홈에서 전체 삭제할 수 있습니다. 동명이인 제보에는 휴대폰 번호나 생년월일 대신 본인이 정한 숫자 4자리만 사용하며 원문 코드는 저장하지 않고 서버 HMAC으로 즉시 변환합니다. 이름만 같거나 제보가 접수됐다는 이유로 선수를 자동 병합하지 않습니다. 참여자 제보, 관리자용 검토 queue와 되돌릴 수 있는 canonical merge 원복 RPC를 구현했습니다. 병합은 선수·대회 기록을 삭제하지 않고 출처 identity 연결의 이전 상태를 보존하며, 별도 운영자 인증 UI는 아직 없습니다. 실출처 운영 활성화에는 출처별 정책 확인과 실제 Supabase project가 필요합니다. 별도 라이선스가 부여되기 전까지 저장소의 코드와 문서는 저작권자가 모든 권리를 보유합니다.

## Roadmap

1. 공개 refresh abuse control과 운영 모니터링 강화
2. 출처 운영 허용 범위의 정기 재검토와 허용된 source 확대
3. 관리자 인증 UI와 승인된 동명이인 merge/split 실행
4. 대회별 최소 출전 가능 부수 규칙 엔진

기여 규칙은 [CONTRIBUTING.md](./CONTRIBUTING.md), 전체 방향은 [MVP 범위](./docs/mvp-scope.md)와 [roadmap](./docs/roadmap.md)을 참고하세요.
