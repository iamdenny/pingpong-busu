# Design System: BUSU Web

**Project ID:** web

BUSU는 기록 근거를 빠르게 비교하는 차분하고 신뢰감 있는 검색 도구다. 장식보다 정보 위계를 우선하고, 밝은 청색 강조과 넉넉한 흰 배경으로 공개 기록과 상태 변화를 명확히 보여준다.

## 모션 원칙

- 모션은 정보 위계와 상태 변경만 설명하며 콘텐츠 렌더링이나 DOM 읽기 순서를 늦추지 않는다.
- 진입 효과는 opacity와 최대 8px 수직 이동만 사용한다. 후보·탭 전환은 240ms 안에 끝내고 후보 stagger는 여섯 번째 항목에서 상한을 둔다.
- 라우트 이동은 React Router view transition을 점진적 향상으로 사용하고 root crossfade만 허용한다. 비동기 상세 데이터와 카드 사이의 가짜 shared-element morph는 만들지 않는다.
- `prefers-reduced-motion: reduce`에서는 transform, stagger, source pulse, smooth scroll, view-transition animation을 제거한다.

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

Primary button은 Rally Blue 표면과 12px radius, 최소 44~48px touch target을 갖는다. 일반 후보는 16px radius의 흰 카드와 얇은 border를 사용하지만, 부수 요약은 카드 반복을 피하고 하나의 compact 2행 표로 표시한다. 표의 부수 항목은 입상·참가 건수를 함께 보여주는 버튼이며 선택하면 같은 체계와 부수의 결과 목록으로 초점을 이동한다. 상태 badge는 pill 형태지만 핵심 데이터 자체를 pill 남용으로 표현하지 않는다. 경고는 옅은 amber 배경, 실제 기록은 옅은 teal 배경을 사용한다. 실시간 출처 상세는 저장된 검색 결과가 없을 때만 조회 중 기본으로 펼치고, 기존 결과가 있거나 조회가 완료되면 요약만 남긴다. 실패 행의 재시도는 작은 보조 동작으로 남은 대기 시간이나 한도 상태를 함께 표시한다.

## 5. Layout Principles

페이지 본문은 최대 1120px이고 중앙 정렬한다. desktop에서는 정보가 가로 grid/table로 정렬되며, 700px 이하에서는 후보와 상세 이력을 세로 흐름으로 전환한다. 긴 부수 요약은 페이지 높이를 늘리지 않고 해당 표 컨테이너만 가로 스크롤한다. 상세 기록은 desktop table, mobile card를 사용하되 DOM 의미와 날짜·원문 순서는 동일하게 유지한다. 배포 버전은 홈 footer에만 가장 낮은 정보 위계의 작은 문자로 배치하고 검색 결과와 선수 상세에는 반복하지 않는다.
