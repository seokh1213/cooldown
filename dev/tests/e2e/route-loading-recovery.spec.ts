import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  test(`a failed route chunk keeps navigation and reload recovery: ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    let failures = 1;
    await page.route(/\/VsPage-[^/]+\.js$|\/src\/pages\/VsPage\/index\.tsx(?:\?.*)?$/, (route) =>
      failures-- > 0 ? route.abort() : route.continue(),
    );
    await page.goto("./vs");
    await expect(page.getByRole("alert")).toContainText("데이터를 불러오지 못했습니다.");
    await expect(page.getByRole("heading", { name: "챔피언 맞대결", exact: true })).toBeVisible();
    if (width < 768) await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("button", { name: "챔피언 쿨타임", exact: true }).click();
    await expect(page.getByRole("heading", { name: "챔피언을 선택하세요", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (width < 768) await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await page.getByRole("button", { name: "챔피언 맞대결", exact: true }).click();
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.getByRole("button", { name: "공유", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}
