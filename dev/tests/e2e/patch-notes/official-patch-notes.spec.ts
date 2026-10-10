import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("26.20 shows every Rift champion, item effects and mechanical changes", async ({ page }) => {
  await page.goto("./patch-notes?patch=26.20");
  await expect(page.locator("article")).toHaveCount(19);
  await expect(page.locator("#patch-Ambessa")).toContainText("5~25");
  await expect(page.locator("#patch-Diana")).toContainText("14%");
  await expect(page.locator("#patch-Kindred")).toContainText("작은 몬스터 대상 지정");
  await expect(page.locator("#patch-Kindred")).toContainText("삭제");
  await expect(page.locator("#patch-Yunara")).toContainText("중첩되지 않음");
  await expect(page.locator("#patch-TahmKench")).toContainText("10/13.75/17.5/21.25/25");
  await expect(page.locator("#patch-TahmKench")).toContainText("10/20/30/40/50");
  const filters = page.getByRole("group", { name: "종류", exact: true });
  await filters.getByRole("button", { name: "아이템", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(3);
  const rocketbelt = page.locator('[id="patch-3152"]');
  await expect(rocketbelt).toContainText("135 (+주문력의 15%)");
  await page.getByRole("group", { name: "변경 방향" }).getByRole("button", { name: "하향", exact: true }).click();
  await expect(rocketbelt).toContainText("스킬 가속");
  await expect(rocketbelt).not.toContainText("사용 시 피해량");
  await page.getByRole("group", { name: "변경 방향" }).getByRole("button", { name: "전체", exact: true }).click();
  await filters.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("textbox", { name: "챔피언·아이템 검색" }).fill("니코");
  await expect(page.locator("article")).toHaveCount(1);
  await page.locator("#patch-Neeko").getByRole("button", { name: "E 칭칭올가미", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("26.19 shows official Aurora ranks, full Aphelios cooldowns and top-only Teleport", async ({ page }) => {
  await page.goto("./patch-notes?patch=26.19");
  await expect(page.locator("#patch-Aurora")).toContainText("1.75/2.5/3.25초");
  await expect(page.locator("#patch-Aurora")).toContainText("2.25/2.75/3.25초");
  await expect(page.locator("#patch-Aphelios")).toContainText("8/7.25/6.5/5.75/5초");
  await expect(page.locator("#patch-MasterYi")).toContainText("스킬 가속에 비례해 감소");
  await page.getByRole("group", { name: "종류", exact: true }).getByRole("button", { name: "게임 체계", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("390초");
  await expect(page.locator("article")).toContainText("300~210초");
  await expect(page.locator("article")).toContainText("변경 없음");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("new official entries fit mobile in each supported language and theme", async ({ page }) => {
  await page.goto("./patch-notes?patch=26.20");
  for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
    await page.evaluate(language => localStorage.setItem("language", language), locale);
    await page.reload();
    await expect(page.locator("article")).toHaveCount(19);
    for (const dark of [false, true]) {
      await page.evaluate(value => document.documentElement.classList.toggle("dark", value), dark);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  }
});
