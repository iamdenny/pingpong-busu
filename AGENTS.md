# BUSU repository rules

- 사용자 화면과 사용자 대상 문서는 한국어를 기본으로 한다.
- 코드 식별자, 타입, DB 컬럼, 커밋 메시지는 영어를 사용한다.
- TypeScript strict mode를 유지하고 `any`를 사용하지 않는다. 불가피하면 이유를 주석으로 남긴다.
- 외부 데이터는 Zod 또는 동등한 런타임 검증을 거친다.
- HTML 문자열을 React에 직접 렌더링하지 않는다.
- service role key, crawler secret, admin token을 브라우저 번들에 넣지 않는다. `VITE_`에는 공개 값만 둔다.
- 이름만 같다는 이유로 선수를 자동 병합하지 않는다.
- live crawling은 기본 비활성화하고 BAND scraping은 구현하지 않는다.
- parser 변경 시 synthetic fixture test를 추가한다.
- 신규 기능에는 가능한 한 unit test를 추가한다.
- 임시 mock과 실제 데이터를 화면에서 명확히 구분한다.
- 전화번호, 이메일, 전체 생년월일, 주소 등 민감 개인정보를 수집하지 않는다.
- 사용자 화면에서 “현재 확정 부수”라는 표현을 사용하지 않는다.
- 지나친 추상화와 불필요한 마이크로서비스를 만들지 않는다.
- 변경 후 README와 관련 문서를 함께 갱신한다.
- 완료 전 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 실행한다.
- 테스트 실패를 무시하거나 삭제해서 통과시키지 않는다.

## Commands

- `pnpm install`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm crawl:fixture --query 김탁구 --version 1`
- `pnpm crawl:live --query 김탁구 --source airping`
- `pnpm db:size`
