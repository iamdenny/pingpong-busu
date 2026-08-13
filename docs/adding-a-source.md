---
summary: "신규 공개 탁구 출처를 안전하게 등록하고 parser와 운영 스위치를 추가하는 절차다."
read_when:
  - 신규 source adapter를 구현할 때
  - 실출처 활성화 조건을 검토할 때
title: "출처 추가 안내"
---

# 출처 추가 안내

BUSU는 하나의 배포 단위 안에서 출처별 adapter를 분리합니다. 수집처가 늘어나도 별도 마이크로서비스를 만들지 않고, 각 출처의 실패와 활성화 상태만 격리합니다.

## 필수 절차

1. 공개 접근 범위, robots.txt, 이용약관, 요청 빈도와 데이터 재사용 범위를 기록합니다.
2. `packages/source-adapters/src/<source>/`에 adapter, Zod schema, parser를 추가합니다.
3. 실제 응답에서 개인정보를 제거한 synthetic fixture와 parser unit test를 추가합니다.
4. `SourceCode`와 `sources` catalog migration에 출처를 비활성 상태로 등록합니다.
5. Edge Function handler에 동일한 parser와 timeout, page cap, cooldown, 출처별 최소 호출 간격을 적용합니다. 멱등 GET만 timeout·연결 오류·HTTP 408/5xx에 한해 최대 한 번 재시도하고, 로그인 POST·인증 실패·4xx·parser 오류는 자동 재시도하지 않습니다.
6. 전체 `CRAWL_LIVE`, 출처별 환경 변수, DB `sources.enabled`의 세 단계 승인을 거쳐 활성화합니다.
7. 정상 0건 응답과 구조 변경을 구분하는 fixture를 만들고, `source_timeout`, `source_blocked`, `source_schema_changed`, `source_not_configured`, `source_auth_failed`, `source_rate_limited` 등 사용자에게 노출할 안전한 오류 코드를 정합니다.
8. parser version과 출처별 timeout을 운영 문서에 기록하고 즉시 끌 수 있는지 확인합니다.

이름이 같아도 자동 병합하지 않습니다. 로그인 출처의 자격증명과 세션은 서버 런타임에서만 사용하고 브라우저 번들, `VITE_` 변수, DB, 로그, 원문 URL에 남기지 않습니다. 로그인 절차, CAPTCHA, MFA 또는 접근제어를 우회하지 않으며 BAND는 수동 확인 출처로만 유지합니다.

지역은 출처의 명시적 지역 필드를 우선합니다. 지역 필드가 없으면 공통 정규표현식 파서가 대회명·종목명의 도·시·군·구를 추출하며 AI는 사용하지 않습니다. 행정구역 접미사가 생략된 대회명은 검토된 별칭만 추가하고 synthetic test를 함께 작성합니다. UI에는 추정값임을 표시하며, 지명과 거주지는 동일하지 않으므로 이 값으로 선수를 자동 병합하지 않습니다.
