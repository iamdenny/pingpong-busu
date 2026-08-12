import { expect, test } from '@playwright/test';

test.skip(process.env.BUSU_LIVE_E2E !== 'true', '명시적인 live E2E 실행에서만 외부 출처를 조회합니다.');

test('애즈트리 공개 기록을 검색하고 상세 이력을 연다', async ({ page }) => {
  await page.goto('#/search?q=%EC%9E%84%EB%8C%80%ED%98%84');
  await expect(page.getByText(/애즈트리에서 기록 \d+건/u)).toBeVisible({ timeout: 15_000 });
  const candidates = page.getByRole('region', { name: '선수 검색 결과 목록' });
  await expect(candidates.getByText('실제 공개 기록').first()).toBeVisible();
  const detailLinks = candidates.getByRole('link', { name: '상세 보기' });
  expect(await detailLinks.count()).toBeGreaterThan(0);
  await detailLinks.first().click();
  await expect(page.getByText('애즈트리 공개 기록').first()).toBeVisible();
  const visibleHistory = page.locator('.record-cards article, .record-table-wrap table').filter({ visible: true });
  expect(await visibleHistory.count()).toBeGreaterThan(0);
  await expect(visibleHistory.first()).toBeVisible();
});
