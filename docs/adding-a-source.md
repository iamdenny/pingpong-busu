# 출처 추가 안내

BUSU는 하나의 배포 단위 안에서 출처별 adapter를 분리합니다. 수집처가 늘어나도 별도 마이크로서비스를 만들지 않고, 각 출처의 실패와 활성화 상태만 격리합니다.

## 필수 절차

1. 공개 접근 범위, robots.txt, 이용약관, 요청 빈도와 데이터 재사용 범위를 기록합니다.
2. `packages/source-adapters/src/<source>/`에 adapter, Zod schema, parser를 추가합니다.
3. 실제 응답에서 개인정보를 제거한 synthetic fixture와 parser unit test를 추가합니다.
4. `SourceCode`와 `sources` catalog migration에 출처를 비활성 상태로 등록합니다.
5. Edge Function handler에 동일한 parser와 timeout, page cap, cooldown, 출처별 최소 호출 간격을 적용합니다.
6. 전체 `CRAWL_LIVE`, 출처별 환경 변수, DB `sources.enabled`의 세 단계 승인을 거쳐 활성화합니다.
7. 오류 코드와 parser version을 운영 문서에 기록하고 즉시 끌 수 있는지 확인합니다.

이름이 같아도 자동 병합하지 않습니다. 로그인, CAPTCHA 또는 접근제어 우회는 구현하지 않으며 BAND는 수동 확인 출처로만 유지합니다.

지역은 출처의 명시적 지역 필드를 우선합니다. 지역 필드가 없으면 공통 정규표현식 파서가 대회명·종목명의 도·시·군·구를 추출하며 AI는 사용하지 않습니다. 행정구역 접미사가 생략된 대회명은 검토된 별칭만 추가하고 synthetic test를 함께 작성합니다. UI에는 추정값임을 표시하며, 지명과 거주지는 동일하지 않으므로 이 값으로 선수를 자동 병합하지 않습니다.
