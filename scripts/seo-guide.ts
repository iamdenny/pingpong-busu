import { buildCanonicalUrl } from "../apps/web/src/lib/pageMetadata";
import { breadcrumbJsonLd, escapeHtml, type BreadcrumbItem } from "./seo-html";
import { directoryPath } from "./seo-directory";

export const GUIDE_PATH = "/guide";

export const guideMetadata = {
  path: GUIDE_PATH,
  title: "탁구 부수란? 통합부수·지역부수·디비전 기준 정리 · BUSU",
  description:
    "탁구 부수의 뜻과 통합부수·지역부수·오픈부수·디비전부수의 차이, 2022년 7월 1일 통합 시행일, BUSU가 입상을 4강까지만 집계하는 이유를 정리했습니다.",
} as const;

export type GuideQuestion = {
  question: string;
  // The first paragraph is written to stand alone as the answer so it can be
  // quoted without the rest of the section.
  answer: readonly string[];
};

export const guideQuestions: readonly GuideQuestion[] = [
  {
    question: "탁구 부수란 무엇인가요?",
    answer: [
      "탁구 부수는 동호인 대회에서 참가자를 실력별로 나누는 등급 구분이며, 숫자가 작을수록 상위 실력입니다. 선수부 다음으로 0부·1부·2부 순서로 내려가고, 대회 주최 측이 참가 신청과 대진 편성에 사용합니다.",
      "부수는 전국 단일 기준으로 자동 부여되는 값이 아니라 대회와 지역, 시기에 따라 다른 체계로 운영되어 왔습니다. 그래서 같은 사람이 대회마다 다른 부수로 출전한 기록이 남기도 합니다.",
    ],
  },
  {
    question: "통합부수와 지역부수는 무엇이 다른가요?",
    answer: [
      "통합부수는 대한탁구협회가 전국 공통 기준으로 운영하는 부수 체계이고, 지역부수는 통합 시행 이전에 시·도 단위로 따로 운영하던 부수 체계입니다. 두 값은 같은 척도가 아니므로 직접 비교하면 안 됩니다.",
      "BUSU는 대회 지역과 개최일이 모두 확인될 때만 이 구분을 적용합니다. 원문에 통합부수, 지역부수, 오픈, 디비전이 적혀 있거나 종목 이름에 지역, 지역남성, 지역여성, 지역혼성 구분이 있으면 원문 표기를 날짜 추정보다 우선합니다.",
    ],
  },
  {
    question: "탁구 통합부수는 언제부터 시행됐나요?",
    answer: [
      "대부분의 지역은 2022년 7월 1일부터 통합부수를 적용하고, 광주광역시와 전라남도는 2017년 1월 1일부터 먼저 적용했습니다. BUSU는 이 날짜를 기준으로 그 전의 일반 숫자 부수를 지역부수, 당일부터를 통합부수로 분류합니다.",
      "이 날짜는 원문에 체계가 적혀 있지 않은 기록을 분류하기 위한 제품 기준일입니다. 지역이나 개최일 중 하나라도 확인되지 않으면 날짜 기준을 적용하지 않고 일반 숫자 부수를 통합부수로 둡니다.",
    ],
  },
  {
    question: "오픈부수와 디비전부수는 무엇인가요?",
    answer: [
      "오픈부수는 대회가 자체 기준으로 운영하는 별도 부수 체계이고, 디비전부수는 T1부터 T7까지의 디비전 등급으로 나누는 체계입니다. 둘 다 통합부수와 다른 척도이므로 BUSU는 각각 별도 행으로 보여줍니다.",
      "대회명이나 종목명에 디비전이 있거나 T1~T7 표기가 있으면 디비전부수로 분류합니다.",
    ],
  },
  {
    question: "여자부 부수는 어떻게 표시하나요?",
    answer: [
      "여자·여성 종목의 통합부수 기록은 통합부수 여자6부처럼 여자 표기를 붙여 보여줍니다. 같은 선수가 같은 날 여자 종목에서 여자6부, 혼성 종목에서 8부를 받는 사례가 있어 두 값을 같은 척도로 읽지 않도록 구분합니다.",
    ],
  },
  {
    question: "BUSU는 입상 기록을 어떤 기준으로 집계하나요?",
    answer: [
      "BUSU는 우승·준우승·1위·2위·3위·2강·4강까지를 입상으로 집계하고, 8강 이하 성적은 입상이 아닌 참가 이력으로 보존합니다. 선수 페이지의 “4강 이상 입상” 건수는 이 기준으로 센 값입니다.",
      "부수 요약과 최근 관측 부수는 개인전 기록을 우선하며 복식·단체전과 종목명에 혼합·혼성이 있는 기록은 제외합니다. 제외한 기록도 전체 이력에서는 그대로 확인할 수 있습니다.",
    ],
  },
  {
    question: "BUSU의 부수는 공식 부수인가요?",
    answer: [
      "아닙니다. BUSU가 보여주는 값은 공개 대회 기록에서 확인한 “관측 부수”이며 공식 등급이나 승급 판정이 아닙니다. BUSU는 부수를 판정하지 않고 공개된 근거와 원문 출처만 모아 보여줍니다.",
      "각 기록에는 당시 소속·부수·결과와 원문 출처 링크가 함께 남아 있어 값이 어디에서 나왔는지 직접 확인할 수 있습니다.",
    ],
  },
  {
    question: "이름이 같은 선수는 어떻게 구분하나요?",
    answer: [
      "BUSU는 이름이 같다는 이유만으로 선수를 자동으로 합치지 않습니다. 출처 identity와 소속·대회 근거가 다르면 별도 후보로 유지합니다.",
      "동명이인은 사용자가 직접 입력한 탁구 별칭으로 기록을 묶어 구분하며, 이 별칭은 본인 인증이나 실력·공식 등급을 뜻하지 않습니다. 잘못된 분류는 근거를 남기고 누구나 되돌릴 수 있습니다.",
    ],
  },
  {
    question: "BUSU의 데이터는 어디에서 오나요?",
    answer: [
      "공개된 탁구 대회 기록 사이트에서 공개적으로 게시된 참가·입상 정보만 수집합니다. 전화번호, 이메일, 전체 생년월일, 주소 같은 민감한 개인정보는 수집하지 않습니다.",
      "각 선수 페이지에는 기록을 확인한 공개 출처 이름과 마지막 확인 시점이 함께 표시됩니다.",
    ],
  },
];

const transitionRows: readonly (readonly [string, string])[] = [
  ["광주광역시 · 전라남도", "2017-01-01"],
  [
    "서울특별시 · 부산광역시 · 대구광역시 · 인천광역시 · 대전광역시 · 울산광역시 · 세종특별자치시",
    "2022-07-01",
  ],
  [
    "경기도 · 강원특별자치도 · 충청북도 · 충청남도 · 전북특별자치도 · 경상북도 · 경상남도 · 제주특별자치도",
    "2022-07-01",
  ],
];

function href(basePath: string, path: string): string {
  return `${basePath.replace(/\/+$/u, "")}${path}/`;
}

export function guideBreadcrumb(): BreadcrumbItem[] {
  return [
    { name: "BUSU 홈", url: buildCanonicalUrl("/") },
    { name: "탁구 부수 안내", url: buildCanonicalUrl(GUIDE_PATH) },
  ];
}

export function renderGuideBody(basePath: string, playerCount: number): string {
  const questions = guideQuestions
    .map(
      (entry) => `        <section class="seo-guide-question">
          <h2>${escapeHtml(entry.question)}</h2>
${entry.answer.map((paragraph) => `          <p>${escapeHtml(paragraph)}</p>`).join("\n")}
        </section>`,
    )
    .join("\n");
  const rows = transitionRows
    .map(
      ([region, date]) =>
        `            <tr><td>${escapeHtml(region)}</td><td><time datetime="${date}">${date}</time></td></tr>`,
    )
    .join("\n");
  const counted =
    playerCount > 0
      ? `현재 공개 기록에서 확인한 선수는 ${playerCount.toLocaleString("ko-KR")}명입니다. `
      : "";
  return `<article class="seo-guide">
      <nav class="seo-guide-breadcrumb" aria-label="상위 목록">
        <a href="${escapeHtml(href(basePath, ""))}">BUSU 홈</a>
      </nav>
      <h1>탁구 부수 안내: 통합부수·지역부수·오픈부수·디비전부수</h1>
      <p class="seo-guide-summary">탁구 부수는 동호인 대회에서 참가자를 실력별로 나누는 등급 구분입니다. 대부분의 지역은 2022년 7월 1일부터 전국 공통 통합부수를 적용하고, 그 이전 기록은 지역별로 따로 운영하던 지역부수입니다. ${counted}BUSU는 공개 대회 기록에서 확인한 관측 부수만 원문 출처와 함께 보여주며 공식 부수를 판정하지 않습니다.</p>
${questions}
        <section class="seo-guide-question">
          <h2>지역별 통합부수 적용 시작일</h2>
          <table class="seo-guide-table">
            <caption>원문에 부수 체계가 적혀 있지 않은 기록을 분류할 때 BUSU가 사용하는 기준일</caption>
            <thead><tr><th scope="col">지역</th><th scope="col">통합부수 적용 시작일</th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
          <p>원문에 부수 체계가 명시되어 있거나 대회별 예외가 확인된 경우에는 이 날짜보다 원문과 예외를 우선합니다. 제18회까지의 분당구청장기가 현재 확인된 예외입니다.</p>
        </section>
      <p class="seo-guide-links">
        <a href="${escapeHtml(href(basePath, directoryPath()))}">탁구 선수 전체 목록에서 이름으로 찾기</a>
      </p>
    </article>`;
}

export function guideJsonLd(): unknown[] {
  const canonical = buildCanonicalUrl(GUIDE_PATH);
  return [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      url: canonical,
      inLanguage: "ko-KR",
      name: guideMetadata.title,
      description: guideMetadata.description,
      isPartOf: { "@id": `${buildCanonicalUrl("/")}#website` },
      mainEntity: guideQuestions.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: entry.answer.join(" "),
        },
      })),
    },
    breadcrumbJsonLd(guideBreadcrumb()),
  ];
}
