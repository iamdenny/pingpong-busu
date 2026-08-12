---
summary: 'BUSU의 설치, 개발, 검증, 수집, Supabase 배포 명령을 정리한다.'
read_when:
  - 로컬 개발 환경을 실행할 때
  - 테스트나 crawler, Supabase 명령을 찾을 때
title: '개발 명령'
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
```

`CRAWL_LIVE=true`와 해당 출처별 환경 변수가 없으면 실행하지 않는다. 에어핑퐁·오케이핑퐁은 운영 승낙 전 활성화하지 않는다.

## Supabase

```bash
supabase start
supabase db reset
supabase functions serve
npx --yes supabase@latest db push --linked --dry-run
npx --yes supabase@latest db push --linked
npx --yes supabase@latest functions deploy refresh-player --project-ref <project-ref>
npx --yes supabase@latest functions deploy refresh-status --project-ref <project-ref>
```

DB 용량 확인:

```bash
pnpm db:size
```

PAT, service role key, DB password는 명령 문자열이나 문서에 기록하지 않는다.
