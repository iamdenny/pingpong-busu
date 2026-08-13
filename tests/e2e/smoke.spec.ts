import { expect, test } from "@playwright/test";

test("demo search vertical slice", async ({ page }) => {
  await page.goto("");
  await expect(
    page.getByRole("heading", { name: /전국 탁구 선수/ }),
  ).toBeVisible();
  await page.getByLabel("선수 검색").fill("김탁구");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(
    page.getByRole("heading", { name: "“김탁구” 선수" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "입상 2건" })).toBeVisible();
  await expect(page.getByText(/같은 이름의 선수가 여러 명/)).toBeVisible();

  const candidates = page.getByRole("tabpanel", {
    name: /선수 검색 결과 목록/,
  });
  await expect(candidates.getByRole("heading", { name: "김탁구" })).toHaveCount(
    2,
  );
  await candidates
    .getByRole("link", { name: /상세 기록 보기/ })
    .first()
    .click();

  await expect(page.getByRole("heading", { name: "대회 이력" })).toBeAttached();
  await expect(page.getByRole("heading", { name: "김탁구" })).toBeVisible();
  await page.getByRole("tab", { name: "출처 비교" }).click();
  await expect(
    page.getByRole("heading", { name: "출처별 기록 차이" }),
  ).toBeVisible();
});

test("reduced motion keeps search navigation usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("");
  await page.getByLabel("선수 검색").fill("김탁구");
  await page.getByRole("button", { name: "검색" }).click();

  await expect(
    page.getByRole("heading", { name: "“김탁구” 선수" }),
  ).toBeVisible();
  const animationState = await page
    .locator(".candidate-motion-item")
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
  await page.getByRole("button", { name: "검색" }).click();

  const divisionFilter = page.getByRole("button", {
    name: /오픈부수 6부 .* 결과 보기/,
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
