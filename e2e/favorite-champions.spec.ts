import { expect, test, type Page } from "@playwright/test";

async function openChampionSelector(page: Page): Promise<void> {
  await page.getByRole("button", { name: "챔피언 추가하기" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => {
    localStorage.removeItem("cooldown:favorite-champion-ids");
  });
  await page.reload();
});

test("pins a favorite above the champion divider and persists it", async ({ page }) => {
  await openChampionSelector(page);

  await page.getByRole("button", { name: "Select 오공", exact: true }).hover();
  await page.getByRole("button", { name: "오공 즐겨찾기 추가" }).click();

  await expect.poll(() => page.locator("[data-champion-list]").evaluate(
    (element) => element.scrollTop,
  )).toBe(0);
  await expect(page.getByText("즐겨찾기", { exact: true })).toBeVisible();
  await expect(page.getByText("전체 챔피언", { exact: true })).toBeVisible();
  await expect(page.locator("[data-champion-item]").first()).toContainText("오공");

  await page.reload();
  await openChampionSelector(page);
  await expect(page.locator("[data-champion-item]").first()).toContainText("오공");
  await expect(
    page.getByRole("button", { name: "오공 즐겨찾기 해제" }),
  ).toBeVisible();
});

test("exposes empty stars through an explicit touch-friendly edit mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChampionSelector(page);

  const favoriteWukong = page.getByRole("button", {
    name: "오공 즐겨찾기 추가",
  });
  await expect(favoriteWukong).toHaveCSS("opacity", "0");

  await page.getByRole("button", { name: "즐겨찾기 편집" }).click();
  await expect(favoriteWukong).toHaveCSS("opacity", "1");
  await favoriteWukong.click();

  await page.getByRole("button", { name: "즐겨찾기 편집 완료" }).click();
  await expect(
    page.getByRole("button", { name: "오공 즐겨찾기 해제" }),
  ).toHaveCSS("opacity", "1");
});
