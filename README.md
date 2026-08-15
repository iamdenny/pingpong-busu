# BUSU

탁구 선수 부수·입상 기록 통합검색 서비스

Korean table tennis player rank and tournament record search.

여러 탁구 대회 사이트에 흩어진 선수의 출전 부수, 입상 기록, 소속 이력과 출처를 한곳에서 조회하고 비교합니다. BUSU는 부수를 판정하는 서비스가 아니라 판단 근거를 모으는 서비스입니다.

현재 구현의 사용자 흐름·도메인 규칙·수용 조건은 [제품 스펙](./docs/product-spec.md), 전체 문서 목록은 [문서 인덱스](./docs/README.md)를 참고하세요.

## 현재 MVP

- 탁구 라켓과 부수 단계를 결합한 BUSU 심볼, 브라우저 파비콘과 홈 헤더 브랜딩
- 홈·검색 결과·선수 상세별 의미 있는 title, description, canonical, Open Graph와 Twitter 메타데이터. 공개 선수를 배포 시 정적 HTML로 생성해 자바스크립트 없이도 선수별 메타데이터를 제공
- 환경 변수 없이 동작하는 한국어 demo 검색 결과 3건(가상 선수)
- 홈의 `김탁구`, `이라켓`, `김탁구 용인` 빠른 예시 검색
- 홈의 최근 검색어 10개 브라우저 저장, 최신순·중복 제거와 전체 삭제
- 검색 결과 상단의 최근 공개 기록 기반 오픈·통합·지역·디비전부수별 입상·참가 건수, 클릭형 후보 필터와 `통합부수 여자6부` 형식의 여자 종목 표기
- 김탁구 동명이인 2명의 지역·소속 분리
- `김미진 용인`처럼 이름 뒤에 지역을 붙이는 동명이인 필터
- 동명이인 공개 기록을 개수 제한 없이 위트 있는 탁구 별칭 그룹으로 나누고, 공개 이력에서 누구나 근거를 남겨 전체 원복하는 참여 편집
- 세로 여백을 줄인 검색 카드의 최신 입상 등수·대회일·대회명과 최근 출전 대회 요약, 카드 전체 상세 이동
- 참여 편집으로 연결된 동명이인을 먼저 표시하고 입상일·출전 기록일 기준으로 이어지는 검색 결과 정렬, 최신 공개 기록의 지역·소속 요약
- 대회일 우선·게시일 보조 최신순 선수 상세 타임라인, 출처 대회에 표시된 전체 종목명, 최근 관측 부수, 출처 비교와 독립 갱신 상태
- 홈에서 운영 source catalog를 작은 요약으로 표시하고, 상세 펼침에서 상태와 원문 URL 제공
- 검색 시 활성 출처만 갱신하고 최근 6시간 성공 결과를 우선 재사용한다. 시간 초과·접근 차단·구조 변경 등 실제 원인, 호출 제한 남은 시간과 자동 재시도를 표시하며 수동 재시도만 강제 갱신한다. 저장된 기록이 없을 때만 조회 중 상세를 기본으로 펼치고, 기록이 있거나 조회가 완료되면 요약만 표시. 실패한 출처는 5초 간격·최대 3회 수동 재시도 가능
- 승인된 에어핑퐁·오케이핑퐁 공개 선수 검색을 출처별 opt-in 수집으로 제공하고, 긴급 중지 시 원문 검색 링크로 대체
- strict TypeScript domain 정규화, 안정 해시, diff/revision 판정
- mock adapter와 fixture crawler, synthetic fixture로 검증한 애즈트리·대한탁구협회 디비전·마이티티·슈퍼스타탁구·용인탁구협회 다음 카페·아이핑 HTTP adapter
- Supabase PostgreSQL migration, RLS, synthetic seed, Edge Functions
- GitHub Actions CI, Pages 배포, 수동 crawler workflow
- GitHub Pages 배포마다 자동 생성하는 `YYYY.WEEK.SEQ` 버전과 모든 페이지 하단 버전 표시
- Cloudflare 기본 방문 통계와 셀프 호스트 Umami의 개인정보 최소화 제품 이벤트 분석
- 로그인 없이 문의·제보 내용을 공개 GitHub Issue로 보내는 하단 폼과 현재 URL·브라우저 User-Agent 자동 첨부

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

익명 문의·제보는 `submit-feedback` Edge Function이 현재 URL과 실제 요청의 `User-Agent`를 서버에서 확인해 GitHub Issue로 등록합니다. GitHub production environment의 `FEEDBACK_GITHUB_TOKEN`에는 대상 저장소 Issues 읽기·쓰기만 허용한 fine-grained token을, `GITHUB_ISSUES_REPOSITORY`에는 `iamdenny/pingpong-busu`, `FEEDBACK_ALLOWED_ORIGINS`에는 `https://busu.iamdenny.com`을 설정합니다. 배포 workflow가 이 값을 Supabase Edge 런타임의 `GITHUB_ISSUES_TOKEN`으로 전달하며, 토큰은 브라우저에 노출하지 않습니다.

운영 오류는 사용자 문의와 분리해 개인정보 없이 집계합니다. 브라우저의 렌더 오류·미처리 오류·미처리 Promise 거부와 출처의 구조 변경·인증 실패만 허용하며, 고정 route template·출처 코드·앱/파서 버전으로 만든 fingerprint가 3회 누적될 때 GitHub Issue를 한 번 게시합니다. 공개 브라우저 fingerprint에서는 임의 버전 회전을 제외합니다. 검색어, 선수 이름, 원문 URL, stack, HTML/body, 쿠키와 자격증명은 전송하거나 저장하지 않습니다. `report-runtime-incident`는 `RUNTIME_INCIDENT_ALLOWED_ORIGINS`의 Origin과 publishable key를 확인하고, private 집계/RPC와 GitHub token은 service-role Edge 경계 안에만 둡니다. 새 event와 게시 예산은 브라우저·출처 범위를 분리해 제한하고 30일 보존 정리는 매일 실행합니다. 오류 보고 실패는 화면 fallback이나 출처 refresh 응답을 막지 않습니다.

```bash
cp .env.example .env.local
supabase start
supabase db reset
supabase functions serve
```

[초기 migration](./supabase/migrations/202608120001_initial_schema.sql)은 테이블, index, public view, RLS를 함께 만듭니다. 브라우저에는 `VITE_SUPABASE_URL`과 publishable key만 둡니다. `SUPABASE_SERVICE_ROLE_KEY` 또는 secret key는 trusted crawler/운영 환경에서만 사용합니다. production 전환은 두 public 값을 설정하고 `VITE_APP_MODE=production`으로 빌드합니다.

Supabase repository는 공개 검색/상세 view와 refresh Edge Function을 사용합니다. [두 번째 migration](./supabase/migrations/202608120002_astree_refresh.sql)이 identity, revision upsert RPC와 상세 view를 추가합니다. Edge 환경에 `CRAWL_LIVE=true`, 활성 출처별 환경 변수를 설정하고 DB의 `sources.enabled`도 true로 둬야 실제 요청이 활성화됩니다. 배포 workflow는 루트 package 버전으로 `CRAWLER_USER_AGENT=BUSU/{version}`을 설정합니다. 마이티티는 단기 JSF 세션을 검색 요청에만 쓰고 저장하지 않으며, 슈퍼스타탁구는 공개 개인별 결과 GET 검색만 사용합니다. 뉴티티플레이는 공개 탁구인검색 결과를 최대 2페이지만 처리하는 production opt-in 출처입니다. 용인탁구협회 카페는 카카오 공식 카페 검색 API를 검색당 1회 호출하고 용인 카페 URL만 남깁니다. 아이핑은 서버 전용 계정으로 조회마다 새 PHP 세션을 만들고 CP949 검색 결과를 출전·전국 입상·지역 입상 순서로 처리하며 세션 식별자와 자격증명은 저장하지 않습니다. 공개 refresh의 호출 제한은 아이핑을 포함해 `출처 + 정규화 검색어`별로 적용하므로 다른 이름 검색을 출처 전체 60초 동안 막지 않습니다. 대신 아이핑 계정 전체는 분당 실제 출처 요청 2회로 제한하고, 인증·구조 오류가 연속 2회 발생하면 10분간 출처 요청을 중단합니다. 에어핑퐁과 뉴티티플레이는 출처 전체 분당 6회 예산을 적용합니다. 에어핑퐁 Edge 요청은 10초 안에 응답하지 않으면 한 번의 서버 시도를 종료하고, 화면이 5초 이상 기다린 뒤 최대 2회 다시 요청합니다. 인증 실패·구조 변경 같은 결정적인 실패는 자동 반복하지 않습니다. workspace live CLI adapter는 별도 진단 도구이므로 에어핑퐁 GET에 16초 제한과 일시 오류 1회 재시도를 유지합니다.

선수 기록은 크롤러 확인 시각이 아니라 `대회일 → 게시일 → 확인 시각` 우선순위로 최신순 정렬합니다. 대회일과 게시일이 모두 없는 기록은 날짜가 있는 기록 뒤에 표시합니다.

입상 기록은 공개 결과가 우승·준우승·1~3위·2강·4강으로 표시된 경우만 집계합니다. `예선 12조 3위`나 `조별 1위`처럼 예선·조별 문맥의 순위와 8강 이하, 예선·본선 진출 등은 전체 이력에는 남기되 입상 건수에는 포함하지 않습니다.

이미 같은 선수로 연결된 기록 중 실제 대회일·대회명·종목·부수 체계와 값·입상 결과가 일치하는 교차 출처 기록은 화면과 요약에서 한 건으로 집계합니다. 출처별 원본 행과 자연키는 변경하지 않으며 상세 이력의 한 행에서 모든 원문 링크를 제공합니다. 대회일이 없거나 한 출처 안에서 같은 판정값이 겹치거나 결과가 다르면 자동으로 묶지 않습니다.

검색 결과는 기본 `입상` 탭과 `출전` 탭으로 나눕니다. 각 탭에서 참여 편집으로 연결된 동명이인을 먼저 표시하고, 나머지 입상 후보는 최근 입상일, 출전 후보는 최근 대회일·게시일 순으로 정렬합니다. 날짜가 없는 기록만 해당 입상 또는 출전 기록의 최근 확인 시각을 보조 기준으로 사용합니다. 카드의 기록 기반 지역과 소속도 같은 시간축에서 가장 최근의 비어 있지 않은 공개 관측값을 표시하며, 관측값이 없을 때만 검토된 대표값을 사용합니다. 4강 이상 입상 기록이 한 건 이상인 후보는 `입상`, 입상 없이 참가 기록만 있는 후보는 `출전`에 표시해 동명이인이 많은 검색에서도 먼저 확인할 대상을 줄입니다. 동명이인 후보에 검증된 별칭이 있으면 상단 `현재 추정 부수`도 별칭별 영역과 `미분류 기록`으로 나눠 집계합니다. 각 영역의 `부수·건수`를 누르면 해당 별칭에 연결된 같은 체계와 부수의 후보만 남기고 결과 목록으로 이동하며, 부수 필터 안에서도 입상과 출전을 전환할 수 있습니다.

동명이인이 많으면 `이름 지역` 형식으로 검색합니다. 예를 들어 `김미진 용인`은 외부 출처에는 `김미진`만 조회하고, BUSU 저장 후보를 지역에 `용인`이 포함된 결과로 좁힙니다. 출처에 표시된 소속은 상세 원문 근거로 보존하지만 검토 없이 검색 카드의 대표 소속이나 canonical club으로 자동 승격하지 않습니다. 입상 후보 카드에는 최근 입상부터 등수와 그 다음 줄의 대회일을 최대 두 건 표시하고 나머지는 `외 N건`으로 줄입니다. 반복되는 `상세 보기` 버튼 대신 카드 전체가 해당 후보 상세 링크입니다. 검색 결과가 한 건 이상이면 `별칭으로 기록 묶기`를 열어 각 후보의 최근 출전 대회명과 원문 종목명을 확인하고 추천 목록에서 무작위로 제시된 첫 별칭을 수정하거나 원하는 별칭을 직접 입력해 기록을 배정할 수 있습니다. 단일 후보는 유일한 별칭 그룹에 기본 배정하고, 복수 후보는 사용자가 소속과 활동 지역을 확인해 직접 배정합니다. 저장된 별칭이 있으면 다음에 창을 열 때 사람 그룹과 기록 선택을 복원합니다. 전용 RPC가 아직 배포되지 않았거나 일시 실패하면 기존 공개 결과 조회로 최근 기록을 대체하며 화면에서 다시 불러올 수도 있습니다. 후보 수에는 고정 상한이 없고 확실하지 않은 기록은 미분류로 남깁니다. 편집은 즉시 반영되며 검색 화면의 `참여 편집 이력`에서 후보별 별칭을 확인하고 전체 원복할 수 있습니다. 별칭은 본인 인증이나 실제 실력·부수·공식 등급이 아니라 공개 기록을 묶고 구분하는 이름입니다.

부수는 값(`4부`, `A부`, `T5` 등)과 체계(`open`, `integrated`, `women`, `regional`, `division`)를 별도로 저장합니다. 대한탁구협회 디비전은 공개 선수조회에 표시되는 T1~T7 등급을 `division`으로 저장합니다. 명시된 체계와 대회별 override를 먼저 적용하고, 대회 지역과 개최일이 확인되면 [지역별 전환 기준](docs/division-transition-rules.md) 전의 일반 부수는 `regional`, 당일부터는 `integrated`로 분류합니다. `지역0~4부`, `지역남성`, `지역여성`, `지역혼성`처럼 종목에 지역 구분이 명시되면 날짜와 관계없이 `regional`로 분류합니다. 그 밖의 여자 종목은 전환 이후 내부적으로 `women`으로 저장하고 화면에는 `통합부수 여자6부`처럼 표시합니다. 전환일 이전 기록은 검색·상세 이력에 보존하고 상세 날짜 옆에 시행일을 표시하지만, `현재 추정 부수`와 최근 관측 부수 집계·최근 대회 요약에서는 제외합니다. 현재 제18회까지의 분당구청장기는 대회별 예외로 `regional`입니다. 지역이나 개최일이 없으면 명시적 지역 종목을 제외한 일반 숫자 부수는 `integrated`가 기본이고, 부수 값 자체가 없으면 `체계 확인 필요`로 표시합니다.

## Fixture crawler

```bash
pnpm crawl:fixture --query 김탁구 --version 1
pnpm crawl:fixture --query 김탁구 --version 1
pnpm crawl:fixture --query 김탁구 --version 2
```

각 실행은 inserted, unchanged, updated와 revision 수를 출력합니다. 로컬 반복 시나리오 상태는 gitignored `.busu-crawler-state.json`에 저장됩니다. 삭제하면 초기 상태로 돌아갑니다.

## Live crawler 안전 정책

`CRAWL_LIVE=false`가 기본입니다. 현재 production에서는 에어핑퐁·애즈트리·뉴티티플레이·대한탁구협회 디비전·오케이핑퐁·마이티티·슈퍼스타탁구와 용인탁구협회 다음 카페 공개 검색을 출처별 플래그로 활성화합니다. 에어핑퐁과 오케이핑퐁은 저장소 운영자가 수집 승낙 완료를 확인한 범위에서 공개 선수 검색 결과만 처리합니다. 용인 카페는 공식 카카오 API의 무료 쿼터 안에서 `{이름} 대회` 최신 50건을 한 번 조회하고, 용인 카페 URL과 정확한 이름 근거가 있는 검색 요약만 저장합니다. 아이핑은 인증형 adapter 구현을 완료했지만 전용 계정 Secret, `CRAWLER_SOURCE_IPING_ENABLED=true`, DB `sources.enabled=true`를 모두 설정한 경우에만 전국오픈·시군구 입상과 출전 이력을 조회합니다. 디비전 응답의 휴대폰과 슈퍼스타의 레이팅 표는 저장하지 않습니다. CAPTCHA/MFA/접근제어 우회와 BAND scraping은 구현하지 않으며 밴드는 사용자 검색 출처 목록에서도 제외합니다. 신규 출처는 [출처 추가 안내](./docs/adding-a-source.md)의 등록 절차와 정책 점검을 통과한 뒤 개별적으로 활성화합니다.

출처가 지역 칼럼을 제공하지 않을 때는 대회명과 종목명에서 `도·특별시·광역시·특별자치도 → 시·특례시·군·구`를 정규표현식으로 추출합니다. AI 판단은 사용하지 않으며, 접미사가 생략된 일부 지역 대회명만 제한된 별칭 사전을 사용합니다. 화면에서는 이를 `기록 기반 지역 추정`으로 표시하며, 동일인 병합이나 공식 거주지 판단에는 사용하지 않습니다.

## GitHub Pages

Repository Settings → Pages에서 Source를 **GitHub Actions**로 설정합니다. 현재 커스텀 도메인 `https://busu.iamdenny.com/`은 asset base `/`로 배포하고 HTTP 요청은 HTTPS로 전환합니다. production repository variables에는 `VITE_APP_MODE=production`, `VITE_APP_BASE_PATH=/`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SOURCE_REFRESH_ENABLED=true`를 설정합니다. 셀프 호스트 Umami를 사용할 때는 공개값인 `VITE_UMAMI_SCRIPT_URL`과 `VITE_UMAMI_WEBSITE_ID`도 추가합니다. `http://iamdenny.com/pingpong-busu/`은 커스텀 도메인으로 이동하는 이전 진입점입니다. publishable key와 Umami website 설정은 브라우저 공개용 값이며, service role/secret key, DB URL, Umami 관리자 자격 증명은 Pages workflow에 넣지 않습니다. 이벤트와 운영 절차는 [제품 분석 문서](./docs/analytics.md)를 따릅니다.

제품 버전의 단일 기준은 루트 `package.json`의 `version`이며 `YYYY.WEEK.SEQ` 형식을 사용합니다. `SEQ`는 같은 ISO 주 안에서 `0`부터 순서대로 증가하며, 배포 변경은 `pnpm release:bump`로 같은 주의 순번을 올리거나 새 주에는 `0`으로 초기화합니다. web 화면은 이 값을 직접 읽어 홈·검색 결과·선수 상세를 포함한 모든 페이지의 공통 footer에 표시합니다. Pages workflow는 빌드가 통과한 뒤 `v{version}` 태그와 GitHub Release 및 자동 릴리즈 노트를 먼저 만들고 정적 사이트를 게시합니다. 이미 다른 커밋이 같은 태그를 사용하면 배포를 중단하므로 모든 배포 PR은 버전 변경을 포함해야 합니다.

web은 `BrowserRouter`의 실제 경로를 사용하고, 알려지지 않은 직접 접근은 `404.html`이 SPA를 부팅합니다. 이전 `/#/...` 링크는 시작 시 같은 실제 경로로 이관합니다. production build는 공개 Supabase view를 publishable key로 페이지 단위 조회해 활성 공개 출처가 있는 선수마다 `/players/{public-id}/index.html`을 생성합니다. 생성 문서에는 선수별 title·description·canonical·Open Graph·Twitter 메타데이터가 초기 HTML부터 들어가며, `/search/index.html`은 `noindex,follow`, `sitemap.xml`은 홈과 생성된 선수 URL만 포함합니다. `robots.txt`는 이 sitemap을 가리킵니다.

이 목록은 배포 시점 스냅샷이므로 새로 수집된 선수는 다음 배포 후 검색엔진에 발견됩니다. Pages workflow는 `SEO_MANIFEST_REQUIRED=true`로 빌드하여 공개 설정 누락, manifest 요청·검증 실패 또는 빈 manifest가 발생하면 게시 전에 실패합니다. build에는 공개 URL과 publishable key만 사용하며 service role/secret key는 전달하지 않습니다.

## 서버 배포

Supabase backend는 별도 상시 Node 서버가 아니라 managed PostgreSQL과 Edge Functions로 운영합니다. production과 development는 서로 다른 Supabase Free 프로젝트를 사용하며 table prefix로 섞지 않습니다. main의 CI가 성공하면 [production 배포 workflow](./.github/workflows/deploy-supabase.yml)가 migration과 Edge Functions를 배포하고, [development 배포 workflow](./.github/workflows/deploy-supabase-development.yml)는 main에서 수동 확인 문자열을 입력한 경우에만 합성 seed와 함께 실행됩니다. development에서는 `mock` 외 출처와 live crawler가 항상 꺼집니다. 각 GitHub environment에는 별도 project 설정과 `SUPABASE_ACCESS_TOKEN` secret이 필요하며 DB 비밀번호는 CI에 저장하지 않습니다. 상세 설정과 운영 활성화 절차는 [운영 문서](./docs/operations.md)를 참고하세요.

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

익명 문의·제보는 전송 전 공개 범위를 안내하고 작성 내용, 쿼리 문자열을 제거한 현재 URL, 앱 버전, 요청의 브라우저 User-Agent, 언어와 viewport 크기만 공개 Issue에 남깁니다. IP 주소는 저장하거나 속도 제한 식별자로 사용하지 않습니다.

전화번호, 이메일, 전체 생년월일, 주소와 원본 HTML/이미지/PDF를 저장하지 않습니다. 최근 검색어는 서버로 보내 별도 보관하지 않고 현재 브라우저의 `localStorage`에 최대 10개만 저장하며 홈에서 전체 삭제할 수 있습니다. 동명이인 참여 편집에는 사용자가 기억할 비밀번호나 확인 코드를 요구하지 않습니다. 브라우저가 임의의 익명 편집자 ID를 자동으로 보관하고 서버는 원문 대신 HMAC만 사용하며, 저장값을 잃어도 편집이나 원복 권한은 사라지지 않습니다. 별칭은 사용자가 한글이나 영문을 포함한 2~20자로 직접 입력하며 서버가 길이·문자·중복과 전화번호·이메일·전체 생년월일·주소 형태를 다시 검증합니다. 이름만 같다는 이유로 시스템이 자동 병합하지 않으며 사용자가 기록을 별칭 그룹에 명시적으로 배정해야 합니다. 편집은 즉시 반영되지만 선수·대회 기록을 삭제하지 않고 출처 identity 연결과 별칭의 이전 상태를 보존합니다. 공개 편집 이력과 사용자 원복을 제공하며, 후속 편집이 있는 경우 최신 편집부터 역순으로 되돌려 데이터 손상을 방지합니다. 실출처 운영 활성화에는 출처별 정책 확인과 실제 Supabase project가 필요합니다. 별도 라이선스가 부여되기 전까지 저장소의 코드와 문서는 저작권자가 모든 권리를 보유합니다.

## Roadmap

1. 공개 refresh abuse control과 운영 모니터링 강화
2. 출처 운영 허용 범위의 정기 재검토와 허용된 source 확대
3. 공개 참여 편집의 합의·이견 표시와 abuse control 강화
4. 대회별 최소 출전 가능 부수 규칙 엔진

기여 규칙은 [CONTRIBUTING.md](./CONTRIBUTING.md), 전체 방향은 [MVP 범위](./docs/mvp-scope.md)와 [roadmap](./docs/roadmap.md)을 참고하세요.
