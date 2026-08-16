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
- hosted DB/Edge 작업 시 Supabase CLI 로그인과 대상별 project link

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

`pnpm build`는 Edge 공유 parser bundle을 먼저 동기화한 뒤 모든 workspace를 빌드하고 web의 SEO 정적 파일을 생성한다. Supabase 공개 설정이 없으면 로컬 build는 빈 선수 목록으로 검색 문서·robots·sitemap을 만들며, 운영 workflow는 `SEO_MANIFEST_REQUIRED=true`라서 설정 누락·요청/검증 실패·빈 manifest가 있으면 실패한다. `supabase/functions/_shared/generated/astree-parser.js`와 `apps/web/dist`는 직접 편집하지 않는다.

## 브라우저 테스트

```bash
pnpm test:e2e
pnpm test:e2e:production
pnpm test:e2e:live
```

`test:e2e:production`은 production 설정으로 이미 생성한 `apps/web/dist`를 대상으로 공개 검색·상세 조회만 확인한다. 먼저 `VITE_APP_BASE_PATH=/`와 production publishable 설정으로 `pnpm build`를 실행해야 한다. `test:e2e:live`는 실제 출처 네트워크를 사용할 수 있으므로 명시적인 `BUSU_LIVE_E2E=true` 구성과 수집 정책 확인이 필요하다.

## Fixture crawler

```bash
pnpm crawl:fixture --query 김탁구 --version 1
pnpm crawl:fixture --query 김탁구 --version 2
```

version 1 반복 실행은 unchanged, version 2는 content 변경과 revision 생성을 검증한다. 상태는 gitignored `.busu-crawler-state.json`에 저장된다.

## Live crawler

```bash
pnpm crawl:live --query 김탁구 --source astree
pnpm crawl:live --query 김탁구 --source newttplay
pnpm crawl:live --query 김탁구 --source ttadivision
pnpm crawl:live --query 김탁구 --source mytt
pnpm crawl:live --query 김탁구 --source superstar
pnpm crawl:live --query 임대현 --source yongintt
pnpm crawl:live --query 김탁구 --source airping
pnpm crawl:live --query 김탁구 --source okpingpong
pnpm crawl:live --query 임대현 --source iping
```

`CRAWL_LIVE=true`와 해당 출처별 환경 변수가 없으면 실행하지 않는다. `newttplay` production은 `CRAWLER_SOURCE_NEWTTPLAY_ENABLED=true`와 DB `sources.enabled=true`를 함께 사용한다. `yongintt`는 trusted 환경의 `KAKAO_REST_API_KEY`, 로컬 `iping` CLI는 `IPING_USERNAME`과 `IPING_PASSWORD`도 필요하다. production은 같은 두 Secret을 main 예약 Playwright worker에만 주입하며 `pnpm iping:worker --mode drain-iping` 또는 승인된 `recover-iping` 모드로 한 queue job을 처리한다. 아이핑 계정·세션·검색 HTML은 브라우저 번들·DB·로그에 저장하지 않는다.

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
npx --yes supabase@latest functions deploy submit-identity-claim --project-ref <project-ref>
npx --yes supabase@latest functions deploy revert-identity-edit --project-ref <project-ref>
npx --yes supabase@latest functions deploy submit-feedback --project-ref <project-ref>
npx --yes supabase@latest functions deploy report-runtime-incident --project-ref <project-ref>
```

`202608130001_reversible_player_merges.sql`부터 `202608140012_individual_division_summary.sql`까지 파일명 순서로 적용한다. 참여 편집·원복과 운영 오류 보고 확인은 [운영 문서](operations.md)를 따른다. `report-runtime-incident` 로컬 호출에는 publishable key와 허용 Origin이 필요하며 실제 GitHub token을 명령줄이나 로그에 넣지 않는다.

독립 development 프로젝트의 최초 구성과 반복 배포는 main의 `Deploy Supabase development backend` workflow를 사용한다. 로컬에서 미리 볼 때도 production ref와 다른지 확인하고 development에만 seed를 포함한다.

```bash
supabase link --project-ref <development-project-ref>
supabase projects list
supabase db push --linked --dry-run --include-seed
supabase db push --linked --include-seed
supabase migration list --linked
```

`--include-seed`는 development 전용이다. production에는 사용하지 않는다. remote reset은 데이터를 삭제하므로 자동화하지 않으며, development를 폐기·재구성할 때만 대상 ref를 다시 확인하고 운영 절차에 따라 수동 실행한다.

로컬 DB에서 출처 관측 경계와 TypeScript/SQL 입상 truth table의 동등성을 확인할 때는 reset 후 트랜잭션 검증을 실행한다.

```bash
docker exec -i supabase_db_pingpong-busu psql -U postgres -d postgres < tests/sql/source-observation-boundary.sql
```

DB 용량 확인:

```bash
pnpm db:size
```

PAT, service role key, DB password는 명령 문자열이나 문서에 기록하지 않는다. development에는 production 데이터, Kakao key 또는 iPing 계정을 복제하지 않는다.

production 공개 조회 배포 게이트를 로컬에서 재현하려면 publishable 설정만 주입해 다음 명령을 실행한다. service role key는 사용하지 않는다.

```bash
PUBLIC_READ_SUPABASE_URL=<url> \
PUBLIC_READ_PUBLISHABLE_KEY=<publishable-key> \
PUBLIC_READ_MAX_MS=2500 \
node --import tsx scripts/check-public-read-health.ts
```

## 배포 버전 미리보기

```bash
pnpm release:check
pnpm release:bump
pnpm build
```

`release:check`는 루트 `package.json`의 `YYYY.WEEK.SEQ` 형식을 검증한다. `release:bump`는 같은 ISO 주차의 순번을 올리며 이 파일만 수정한다. 배포 PR에는 변경된 버전을 커밋해야 한다. web 화면과 GitHub 태그·Release는 모두 이 값을 사용한다.
