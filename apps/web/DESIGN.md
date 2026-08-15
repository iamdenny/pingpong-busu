# Design System: BUSU Web

**Project ID:** web

BUSU는 기록 근거를 빠르게 비교하는 차분하고 신뢰감 있는 검색 도구다. 장식보다 정보 위계를 우선하고, 밝은 청색 강조과 넉넉한 흰 배경으로 공개 기록과 상태 변화를 명확히 보여준다.

## 모션 원칙

- 모션은 정보 위계와 상태 변경만 설명하며 콘텐츠 렌더링이나 DOM 읽기 순서를 늦추지 않는다.
- 진입 효과는 opacity와 최대 8px 수직 이동만 사용한다. 후보·탭 전환은 240ms 안에 끝내고 후보 stagger는 여섯 번째 항목에서 상한을 둔다.
- 라우트 이동은 React Router view transition을 점진적 향상으로 사용하고 root crossfade만 허용한다. 비동기 상세 데이터와 카드 사이의 가짜 shared-element morph는 만들지 않는다.
- `prefers-reduced-motion: reduce`에서는 transform, stagger, source pulse, smooth scroll, view-transition animation을 제거한다.
- `별칭으로 기록 묶기` dialog는 검색 후보가 한 건 이상이면 제공하고, desktop에서 중앙 리프트(18px, scale 0.96), 700px 이하에서 bottom sheet로 연다. 닫기 효과가 끝날 때까지 native dialog top layer를 유지하고 reduced motion에서는 즉시 닫는다.
- 접기·펼치기 영역은 `CollapsibleContent`를 재사용한다. 트리거는 native `button`과 `aria-controls`·`aria-expanded`를 사용하고, 내용은 `grid-template-rows: 0fr → 1fr`와 opacity를 240ms 이내에 전환한다. 닫힌 내용에는 `aria-hidden`과 `inert`를 함께 적용하며 `prefers-reduced-motion: reduce`에서는 즉시 전환한다. 페이지별 `details` 또는 임의의 `max-height` 효과를 새로 만들지 않는다.

## 1. Visual Theme & Atmosphere

화면은 공공 데이터 도구처럼 안정적이되 딱딱하지 않아야 한다. 검색이 가장 강한 시각적 진입점이며, 결과에서는 후보·부수·출처 상태가 짧은 시선 이동으로 읽혀야 한다. 실제 공개 기록과 가상 데이터, 확정 정보와 추정 정보의 경계는 색과 문구로 분명히 구분한다.

## 2. Color Palette & Roles

- **Rally Blue (`#165DFF`)**: 검색 버튼, 링크, 핵심 수치, active 상태에만 사용한다.
- **Deep Rally Blue (`#0F46CA`)**: primary hover와 눌림 상태다.
- **Ink Navy (`#0F172A`)**: 제목과 핵심 본문이다.
- **Slate Gray (`#64748B`)**: 보조 설명, 날짜, 미확인 정보다.
- **Court Mist (`#F6F8FB`)**: 전체 페이지 배경이다.
- **Paper White (`#FFFFFF`)**: 카드와 표의 표면이다.
- **Line Silver (`#E2E8F0`)**: 구획선과 중립 border다.
- **Verified Teal (`#0F766E`)**: 실제 공개 기록과 성공 상태다.
- **Caution Amber (`#B45309`)**: 동명이인·출처 차이·운영 주의다.
- **Error Red (`#B91C1C`)**: 입력 오류와 실패 상태에만 사용한다.

## 3. Typography Rules

Inter, Pretendard, Apple system sans 순서의 글꼴을 사용한다. hero 제목은 `clamp()`로 유동 크기를 갖고 강한 음수 letter-spacing을 사용한다. 페이지 제목은 굵게, metadata와 상태는 0.72~0.9rem의 작은 크기로 낮춘다. 본문 line-height는 1.55를 유지해 한국어 가독성을 확보한다.

## 4. Component Stylings

Primary button은 Rally Blue 표면과 12px radius, 최소 44~48px touch target을 갖는다. 일반 후보는 16px radius의 흰 카드와 얇은 border를 사용하지만, 부수 요약은 카드 반복을 피하고 체계별 compact 행으로 표시한다. 검증된 별칭이 있는 동명이인 검색의 부수 요약은 별칭별 제목과 `미분류 기록` 제목 아래에 compact 표를 세로로 나누며, 제목은 실제 등급이 아니라 참여 편집 연결 범위임을 보조 문구로 알린다. 검색 후보 카드의 통계 3열은 입상·출전 맥락 열을 가장 넓게, 출처 열을 가장 좁게 배분한다. 입상 영역은 등수·날짜 옆에 대회명과 원문 종목명을 각각 최대 두 줄로 표시하고, 출전 탭에서도 최근 출전 대회명·원문 종목명·날짜를 같은 자리에 표시해 기록 맥락을 유지한다. 각 행의 부수 항목은 입상·참가 건수를 함께 보여주는 가로 버튼이며 선택하면 해당 별칭 영역의 같은 체계와 부수 결과 목록으로 초점을 이동한다. 입상·출전 탭은 선택된 흰 pill이 결과 패널과 같은 방향으로 좌우 이동하며, `prefers-reduced-motion`에서는 이동 효과를 제거한다. 상태 badge는 pill 형태지만 핵심 데이터 자체를 pill 남용으로 표현하지 않는다. 경고는 옅은 amber 배경, 실제 기록은 옅은 teal 배경을 사용한다. 실시간 출처 상세는 최초 저장 결과가 없을 때만 조회 중 자동으로 펼치고, 저장 결과가 있거나 조회가 끝나면 접어 둔다. 접힌 채 조회 중이면 딥 틸과 세이지 민트 조합의 실제 완료 비율 진행 바를 보여주고, 출처 한 곳이 완료될 때마다 채움 폭을 easing으로 부드럽게 늘린다. 카드 뒤를 지나는 저채도 틸 배경 스캔은 상세가 펼쳐져도 조회가 끝날 때까지 유지한다. `prefers-reduced-motion`에서는 두 움직임을 멈춘다. 실패 행의 재시도는 작은 보조 동작으로 남은 대기 시간이나 한도 상태를 함께 표시한다. 별칭 기록 묶기 dialog는 각 사람의 별칭을 label이 연결된 text input으로 직접 입력하고 후보가 다섯 그룹 이하일 때 native radio, 더 많을 때 select로 기록을 배정한다. 단일 후보는 유일한 그룹에 기본 배정하고 그룹 추가를 숨기며, 복수 후보는 자동 배정하지 않고 소속·활동 지역 확인 안내를 제공한다. 저장된 별칭이 없을 때는 추천 목록에서 별칭 하나만 무작위 제안하고, 저장된 별칭이 있으면 사람 그룹과 후보 선택을 복원한다. 모바일의 radio 선택지는 글자·간격을 줄여 한 줄을 유지하고 폭이 부족하면 가로 스크롤한다. 별칭은 amber 보조 badge로 표시하되 본인 인증이나 실제 실력·부수·공식 등급이 아니라 공개 기록 구분자라는 설명을 붙인다. 미분류 선택과 전체·분류 건수를 항상 제공하며 최근 기록 실패에는 작은 재조회 동작을 둔다. 공개 참여 편집 이력은 기본 접힘 상태의 `details`로 배치하며 반영·되돌림 상태, 근거와 후보별 별칭을 읽은 뒤에만 전체 원복 form으로 진입하게 한다.

통합부수 요약은 일반 숫자·희망·새싹 관측을 첫째 줄, 여자 숫자·여자희망·여자새싹 관측을 둘째 줄로 분리한다. 두 줄은 같은 통합부수 행 머리글을 공유하고 각 줄만 독립적으로 가로 스크롤한다.

동일한 대회 결과가 여러 출처에서 확인되면 상세 이력은 한 행으로 유지하고 출처 링크를 짧은 가로 목록으로 함께 배치한다. 검색 카드에는 `출처 N곳`을 보조 정보로 표시해 중복 제거와 근거 보존을 동시에 전달한다.

## 5. Layout Principles

공통 footer의 `문의·제보하기`는 native modal dialog를 열며 desktop에서는 중앙 dialog, 700px 이하에서는 한 열 bottom sheet로 표시한다. 작성 내용과 함께 현재 URL, 앱 버전, 브라우저 User-Agent, 언어와 viewport가 공개 GitHub Issue에 포함된다는 확인을 제출 전에 명시한다. 연락처와 이미지 입력은 두지 않으며 성공 뒤 공개 Issue 링크를 제공한다.

페이지 본문은 최대 1120px이고 중앙 정렬한다. desktop에서는 정보가 가로 grid/table로 정렬되며, 700px 이하에서는 후보와 상세 이력을 세로 흐름으로 전환한다. 긴 부수 요약은 페이지 높이를 늘리지 않고 체계별 행 안의 세부 정보만 가로 스크롤한다. 상세 기록은 desktop table, mobile card를 사용하되 DOM 의미와 날짜·원문 순서는 동일하게 유지한다. 배포 버전은 공통 footer의 가장 낮은 정보 위계에 작은 문자로 배치해 홈·검색 결과·선수 상세에서 일관되게 확인할 수 있게 한다.
