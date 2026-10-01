import { expect, test } from "@playwright/test";
import { translations } from "../src/i18n/translations";

for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
  for (const width of [1440, 390]) {
    test(`Nidalee W and Vex P show level tables in descriptions: ${locale} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((language) => localStorage.setItem("language", language), locale);
      await page.goto("./vs?a=Nidalee&t=Vex");
      const title = translations[locale].skillTooltip.levelValuesTitle;
      const nidalee = page.locator('[data-ability-info][data-side="mine"][data-slot="W"]');
      const human = nidalee.locator('[data-ability-form="A"]');
      await expect(human.getByRole("region", { name: title }).getByRole("cell")).toHaveText(["4", "6", "8", "10"]);
      await expect(nidalee.locator('[data-ability-form="B"]').getByRole("table")).toHaveCount(0);
      const vex = page.getByTestId("vs-opponent-P");
      await expect(vex.getByRole("region", { name: title }).getByRole("table")).toHaveCount(3);
      await expect(vex.getByRole("table").first().getByRole("cell")).toHaveText(["25", "22", "19", "16"]);
      await page.getByTestId("vs-mine-W").getByRole("button").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator('[data-ability-form="A"]').getByRole("cell")).toHaveText(["4", "6", "8", "10"]);
      await expect(dialog.locator('[data-ability-form="B"]').getByRole("table")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

test("Wukong passive and R show level tables in the VS description list", async ({ page }) => {
  await page.goto("./vs?a=MonkeyKing&t=Galio");
  await expect(page.getByTestId("vs-mine-P").getByRole("table")).toHaveCount(1);
  await expect(page.locator('[data-ability-info][data-side="mine"][data-slot="R"]').getByRole("table")).toHaveCount(1);
  await expect(page.locator('[data-ability-info][data-side="opponent"][data-slot="W"]').getByRole("table")).toHaveCount(1);
});
