import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  for (const restored of [false, true]) {
    test(`${restored ? "restored" : "new"} champion keeps its selection and recovers from a failed detail request at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      if (restored) {
        await page.addInitScript(() => {
          localStorage.setItem("cooldown:storage-schema", "2");
          localStorage.setItem("cooldown_selected_champions", JSON.stringify([{ id: "Ahri", key: "103" }]));
          localStorage.setItem("cooldown_tabs", JSON.stringify([{ mode: "normal", champions: ["Ahri"], id: "retry-ahri" }]));
          localStorage.setItem("cooldown_selected_tab_id", "retry-ahri");
        });
      }
      let failed = true;
      await page.route("**/champions/ko_KR/Ahri.json*", async (route) => {
        if (failed) await route.fulfill({ status: 503, body: "{}" });
        else await route.continue();
      });
      await page.goto("./");
      if (!restored) {
        await page.getByRole("button", { name: "챔피언 추가하기", exact: true }).click();
        await page.getByRole("button", { name: "Select 아리", exact: true }).click();
        await page.keyboard.press("Escape");
      }
      const error = page.getByRole("alert");
      await expect(error).toContainText("아리");
      await expect(error).toContainText("데이터를 불러오지 못했습니다");
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("cooldown_selected_champions") ?? "[]").map((champion: { id: string }) => champion.id))).toEqual(["Ahri"]);
      failed = false;
      await error.getByRole("button", { name: "다시 시도", exact: true }).click();
      await expect(page.getByAltText("Q", { exact: true })).toBeVisible();
      await expect(error).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("cooldown_tabs") ?? "[]").map((tab: { champions: string[] }) => tab.champions))).toEqual([["Ahri"]]);
    });
  }
}
