---
summary: "BUSU의 설치, 개발, 검증, 수집, Supabase 배포 명령을 정리한다."
read_when:
  - 로컬 개발 환경을 실행할 때
  - 테스트나 crawler, Supabase 명령을 찾을 때
title: "개발 명령"
---

# 개발 명령

## 요구 환경

- Node.js 24 (`.nvmrc`)
- pnpm 11.17 (`package.json#packageManager`)
- production DB/Edge 작업 시 Supabase CLI 로그인과 project link

## 설치와 웹 개발

```bash
pnpm install
pnpm dev
```

기본 미리보기 URL은 `http://localhost:5173/pingpong-busu/`다.

## 필수 완료 게이트

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs-check:scan
```

`pnpm build`는 Edge 공유 parser bundle을 먼저 동기화한 뒤 모든 workspace를 빌드한다. `supabase/functions/_shared/generated/astree-parser.js`는 직접 편집하지 않는다.

## 브라우저 테스트

```bash
pnpm test:e2e
pnpm test:e2e:live
```

`test:e2e:live`는 실제 출처 네트워크를 사용할 수 있으므로 명시적인 `BUSU_LIVE_E2E=true` 구성과 수집 정책 확인이 필요하다.

## Fixture crawler

```bash
pnpm crawl:fixture --query 김탁구 --version 1
pnpm crawl:fixture --query 김탁구 --version 2
```

version 1 반복 실행은 unchanged, version 2는 content 변경과 revision 생성을 검증한다. 상태는 gitignored `.busu-crawler-state.json`에 저장된다.

## Live crawler

```bash
pnpm crawl:live --query 김탁구 --source astree
pnpm crawl:live --query 김탁구 --source ttadivision
pnpm crawl:live --query 김탁구 --source mytt
pnpm crawl:live --query 김탁구 --source superstar
pnpm crawl:live --query 임대현 --source yongintt
pnpm crawl:live --query 김탁구 --source airping
pnpm crawl:live --query 김탁구 --source okpingpong
pnpm crawl:live --query 임대현 --source iping
```

`CRAWL_LIVE=true`와 해당 출처별 환경 변수가 없으면 실행하지 않는다. `yongintt`는 trusted 환경의 `KAKAO_REST_API_KEY`, `iping`은 `IPING_USERNAME`과 `IPING_PASSWORD`도 필요하다. 아이핑 계정과 세션은 브라우저 번들·DB·로그에 저장하지 않는다.

## Supabase

```bash
supabase start
supabase db reset
supabase functions serve
supabase migration list --linked
npx --yes supabase@latest db push --linked --dry-run
npx --yes supabase@latest db push --linked
npx --yes supabase@latest functions deploy refresh-player --project-ref <project-ref>
npx --yes supabase@latest functions deploy refresh-status --project-ref <project-ref>
```

`202608130001_reversible_player_merges.sql`, `202608130002_bounded_source_retries.sql`, `202608130003_division_observation_counts.sql`은 이 순서로 적용한다. 운영 확인과 관리자 병합·원복 RPC 예시는 [운영 문서](operations.md)를 따른다.

DB 용량 확인:

```bash
pnpm db:size
```

PAT, service role key, DB password는 명령 문자열이나 문서에 기록하지 않는다.

## 배포 버전 미리보기

```bash
VITE_APP_VERSION=2026.33.1 pnpm build
```

`YYYY.WEEK.SEQ` 형식의 값은 홈 하단에 표시된다. 실제 GitHub Pages 배포에서는 workflow가 Actions 실행 이력으로 값을 자동 생성하므로 repository variable로 고정하지 않는다. 값이 없거나 형식이 다르면 `버전 개발`로 표시된다.
