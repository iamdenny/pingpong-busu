import { expect, test, type Locator } from "@playwright/test";

const readSearchFocusMetrics = async (input: Locator) =>
  input.evaluate((element) => {
    const row = element.closest(".search-form__row");
    if (!(row instanceof HTMLElement)) {
      throw new Error("Search input must be inside .search-form__row");
    }

    const inputStyle = getComputedStyle(element);
    const rowStyle = getComputedStyle(row);
    return {
      borderColor: rowStyle.borderColor,
      boxShadow: rowStyle.boxShadow,
      fontSize: Number.parseFloat(inputStyle.fontSize),
      viewportScale: window.visualViewport?.scale ?? null,
    };
  });

test("mobile search focus keeps its size and browser zoom access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("");

  const viewportContent = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewportContent).toBe("width=device-width, initial-scale=1.0");

  const homeInput = page.locator("#home-search");
  const homeBefore = await readSearchFocusMetrics(homeInput);
  await homeInput.focus();
  const homeAfter = await readSearchFocusMetrics(homeInput);

  expect(homeBefore.fontSize).toBeGreaterThanOrEqual(16);
  expect(homeAfter.fontSize).toBeGreaterThanOrEqual(16);
  expect(homeBefore.viewportScale).toBe(1);
  expect(homeAfter.viewportScale).toBe(1);
  expect(homeAfter.borderColor).toBe("rgb(22, 93, 255)");
  expect(homeBefore.boxShadow).not.toBe("none");
  expect(homeAfter.boxShadow).toBe(homeBefore.boxShadow);

  await page.goto("search?q=%EA%B9%80%ED%83%81%EA%B5%AC");
  const headerInput = page.locator("#header-search");
  const headerBefore = await readSearchFocusMetrics(headerInput);
  await headerInput.focus();
  const headerAfter = await readSearchFocusMetrics(headerInput);

  expect(headerBefore.fontSize).toBeGreaterThanOrEqual(16);
  expect(headerAfter.fontSize).toBeGreaterThanOrEqual(16);
  expect(headerBefore.viewportScale).toBe(1);
  expect(headerAfter.viewportScale).toBe(1);
  expect(headerAfter.borderColor).toBe("rgb(22, 93, 255)");
  expect(headerBefore.boxShadow).toBe("none");
  expect(headerAfter.boxShadow).toBe(headerBefore.boxShadow);

  await page.setViewportSize({ width: 915, height: 412 });
  const landscapeHeader = await readSearchFocusMetrics(headerInput);
  expect(landscapeHeader.fontSize).toBeGreaterThanOrEqual(16);

  await page.emulateMedia({ forcedColors: "active" });
  const forcedColorsOutline = await headerInput.evaluate((element) => {
    const row = element.closest(".search-form__row");
    if (!(row instanceof HTMLElement)) {
      throw new Error("Search input must be inside .search-form__row");
    }
    const rowStyle = getComputedStyle(row);
    return {
      style: rowStyle.outlineStyle,
      width: rowStyle.outlineWidth,
    };
  });
  expect(forcedColorsOutline).toEqual({ style: "solid", width: "2px" });
});

test("demo search vertical slice", async ({ page }) => {
  await page.goto("");
  await expect(
    page.getByRole("heading", { name: /전국 탁구 선수/u }),
  ).toBeVisible();
  await page.getByLabel("선수 검색").fill("김탁구");
  await page.getByRole("button", { name: "검색", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "“김탁구” 선수" }),
  ).toBeVisible();
  await expect(page.getByText("2건", { exact: true })).toBeVisible();
  await expect(page.getByText(/같은 이름의 선수가 여러 명/u)).toBeVisible();

  await page.getByRole("button", { name: "별칭으로 기록 묶기" }).click();
  const editDialog = page.getByRole("dialog", {
    name: "별칭으로 기록 묶기",
  });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByText(/후보 수 제한은 없습니다/u)).toBeVisible();
  await expect(
    editDialog.getByText(/별도의 비밀번호는 없습니다/u),
  ).toBeVisible();
  await expect(editDialog.locator('input[type="password"]')).toHaveCount(0);
  await editDialog
    .getByRole("group", { name: /서울.*스핀탁구클럽/u })
    .getByRole("radio", { name: "파워 드라이브 전문가" })
    .click();
  await editDialog
    .getByRole("group", { name: /부산.*블루라켓/u })
    .getByRole("radio", { name: "루프 드라이브 최강자" })
    .click();
  await expect(editDialog.getByText(/분류 2건 · 전체 2건/u)).toBeVisible();
  await editDialog.getByRole("button", { name: "취소" }).click();

  const candidates = page.getByRole("tabpanel", {
    name: "입상 선수 검색 결과 목록",
  });
  await expect(candidates.getByRole("heading", { name: "김탁구" })).toHaveCount(
    1,
  );
  await page
    .getByRole("link", {
      name: "김탁구 파워 드라이브 전문가 서울 스핀탁구클럽 상세 기록 보기",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "입상 이력 (4강 이상)" }),
  ).toBeAttached();
  await expect(page.getByText("2026 가상 전국오픈")).toHaveCount(2);
  await page.getByRole("tab", { name: "출처 비교" }).click();
  await expect(
    page.getByRole("heading", { name: "출처별 기록 차이" }),
  ).toBeVisible();
});

test("reduced motion keeps search navigation usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("");
  await page.getByLabel("선수 검색").fill("김탁구");
  await page.getByRole("button", { name: "검색", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "“김탁구” 선수" }),
  ).toBeVisible();
  const animationState = await page
    .locator(".candidate-list")
    .first()
    .evaluate((element) => ({
      activeAnimations: element.getAnimations().length,
      transform: getComputedStyle(element).transform,
    }));
  expect(animationState).toEqual({ activeAnimations: 0, transform: "none" });
});

test("navigation fallback and rapid result state changes converge", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("");
  await page.getByLabel("선수 검색").fill("김탁구");
  await page.getByRole("button", { name: "검색", exact: true }).click();

  const divisionFilter = page.getByRole("button", {
    name: /통합부수 6부 .* 결과 보기/,
  });
  await divisionFilter.click();
  const results = page.getByRole("tabpanel", { name: /선수 검색 결과 목록/ });
  await expect(results).toBeFocused();
  await expect(results.getByRole("heading", { name: "김탁구" })).toHaveCount(1);

  await results.getByRole("link", { name: /상세 기록 보기/ }).click();
  await page.getByRole("tab", { name: "출처 비교" }).click();
  await page.getByRole("tab", { name: /전체 이력/ }).click();
  await page.getByRole("tab", { name: "출처 비교" }).click();
  await expect(
    page.getByRole("heading", { name: "출처별 기록 차이" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "검색 결과로" }).click();
  await expect(
    page.getByRole("heading", { name: "“김탁구” 선수" }),
  ).toBeVisible();
});
