import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const patches = [
  { patch: "26.15", count: 15, champion: "#patch-Belveth", text: "비전투 시 이동 속도", item: "2520" },
  { patch: "26.16", count: 22, champion: "#patch-Gwen", text: "챔피언 대상 체력 회복량", item: "3068" },
  { patch: "26.17", count: 16, champion: "#patch-Irelia", text: "마법 피해는 50% 효과", item: "3095" },
  { patch: "26.18", count: 12, champion: "#patch-Zaahen", text: "30/60/90/120/150", item: "3124" },
];

for (const { patch, count, champion, text, item } of patches) {
  test(`${patch} displays the restored official rows, skills and source in every language`, async ({ page }) => {
    await page.goto(`./patch-notes?patch=${patch}`);
    await expect(page.locator("article")).toHaveCount(count);
    await expect(page.locator(champion)).toContainText(text);
    await expect(page.locator(`[id="patch-${item}"]`)).toBeVisible();
    await expect(page.getByRole("link", { name: "공식 패치 노트", exact: true })).toHaveAttribute("href",
      `https://www.leagueoflegends.com/ko-kr/news/game-updates/league-of-legends-patch-${patch.replace(".", "-")}-notes/`);
    await page.locator(champion).locator("[data-skill-trigger]").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
      await page.evaluate(language => localStorage.setItem("language", language), locale);
      await page.reload();
      await expect(page.locator("article")).toHaveCount(count);
      for (const dark of [false, true]) {
        await page.evaluate(value => document.documentElement.classList.toggle("dark", value), dark);
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 844 });
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
      }
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  });
}

test("historical systems retain ADC scope, runes and source translation corrections", async ({ page }) => {
  await page.goto("./patch-notes?patch=26.16");
  await page.getByRole("group", { name: "종류", exact: true }).getByRole("button", { name: "게임 체계", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page.locator("#patch-system-adcmagicresistance")).toContainText("트리스타나");
  await expect(page.locator("#patch-system-junglepets")).toContainText("16%");
  await expect(page.locator("#patch-system-supportrolequest")).toContainText("-33%");
  await page.goto("./patch-notes?patch=26.15");
  await expect(page.locator("main footer")).toContainText("누락·오타");
  await expect(page.locator("#patch-Jade_Alistar")).toHaveCount(0);
  await page.goto("./patch-notes?patch=26.18");
  await page.evaluate(() => localStorage.setItem("language", "zh_CN"));
  await page.reload();
  await expect(page.locator("#patch-Zaahen")).toContainText("25 / 50 / 75 / 100 / 125");
  await expect(page.locator("main footer")).toContainText("補正");
});
