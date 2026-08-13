import { expect, test } from "@playwright/test";

test("anonymous feedback dialog is usable on desktop and mobile", async ({
  page,
}) => {
  await page.goto("");
  const trigger = page.getByRole("button", { name: "문의·제보하기" });
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeVisible();

  const triggerBox = await trigger.boundingBox();
  expect(triggerBox?.height).toBeGreaterThanOrEqual(48);

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "문의·제보하기" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(/현재 URL.*User-Agent.*viewport/u),
  ).toBeVisible();
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0);

  const layout = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);

  await dialog
    .getByLabel("문의·제보 내용")
    .fill("현재 페이지 링크와 브라우저 정보가 함께 전달되는지 확인합니다.");
  await dialog.getByRole("checkbox", { name: /GitHub Issue에 공개/u }).check();
  await dialog.getByRole("button", { name: "공개 제보 보내기" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "현재 제보를 접수할 수 없습니다",
  );

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
