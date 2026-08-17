import { expect, test } from "@playwright/test";

test("production-backed build supports search and player detail", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const publicApiFailures: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/rest/v1/") && response.status() >= 400)
      publicApiFailures.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("search/?q=임대현");
  await expect(
    page.getByRole("heading", { name: "“임대현” 선수" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/임대현.*BUSU/u);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /임대현.*기록/u,
  );

  const detailLink = page
    .getByRole("link", { name: /임대현.*상세 기록 보기/u })
    .first();
  await expect(detailLink).toBeVisible();
  await detailLink.click();

  await expect(
    page.getByRole("heading", { name: /임대현/u }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "입상 이력 (4강 이상)" }),
  ).toBeVisible();
  const divisionSummary = page.locator(".division-summary");
  await expect(
    divisionSummary
      .locator(".division-summary__stats > div", { hasText: "최근 관측 부수" })
      .locator("dd"),
  ).toHaveText("오픈부수 7부");
  await expect(
    divisionSummary
      .locator(".division-summary__stats > div", { hasText: "통합부수 기록" })
      .locator("dd"),
  ).toHaveText("통합부수 6부");
  await expect(
    divisionSummary.getByRole("table", { name: "개인전" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/임대현.*BUSU/u);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "profile",
  );
  expect(publicApiFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});
