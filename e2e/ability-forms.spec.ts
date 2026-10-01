import { expect, test } from "@playwright/test";

for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
  test(`both forms have distinct icons, tooltips and cooldown rows: ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript((language) => localStorage.setItem("language", language), locale);
    await page.goto("./vs?a=Jayce&t=Nidalee");
    const q = page.getByTestId("vs-mine-Q");
    await expect(q.locator("[data-form-half]")).toHaveCount(2);
    await expect(q.locator('[data-form-half="A"]')).toHaveCSS("clip-path", "polygon(0px 0px, 0px 100%, 100% 100%)");
    await expect(q.locator('[data-form-half="B"]')).toHaveCSS("clip-path", "polygon(0px 0px, 100% 0px, 100% 100%)");
    await q.getByRole("button").hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip.locator("[data-ability-form]")).toHaveCount(2);
    await expect(tooltip.locator('[data-ability-form="B"]')).toContainText(/전격 폭발|Shock Blast|电能震荡/);
    await page.keyboard.press("Escape");
    const firstRow = page.locator('[data-rank-row="1"] td[headers$="vs-mine-Q"]');
    await expect(firstRow.locator('[data-form-cooldown="A"] [data-cooldown]')).toHaveText("16");
    await expect(firstRow.locator('[data-form-cooldown="B"] [data-cooldown]')).toHaveText("8");
    const missingForms = page.locator('[data-rank-row="2"] td[headers$="vs-mine-R"]');
    await expect(missingForms).toHaveText("—");
    await expect(missingForms.locator("[data-form-cooldown]")).toHaveCount(0);
    await page.getByTestId("vs-opponent-Q").getByRole("button").click();
    await expect(page.getByRole("dialog").locator("[data-ability-form]")).toHaveCount(2);
    await expect(page.getByRole("dialog").locator('[data-ability-form="B"]')).toContainText(/숨통 끊기|Takedown|推倒/);
    await expect(page.getByRole("dialog").locator('[data-ability-form="B"]')).toContainText("R");
  });
}

for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
  for (const width of [1440, 390]) {
    test(`Jayce R shows level tables for both forms: ${locale} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((language) => localStorage.setItem("language", language), locale);
      await page.goto("./vs?a=Jayce&t=Nidalee");
      const trigger = page.getByTestId("vs-mine-R").getByRole("button");
      if (width < 768) await trigger.click();
      else await trigger.hover();
      const details = page.getByRole(width < 768 ? "dialog" : "tooltip");
      await expect(details).toBeInViewport({ ratio: 0.99 });
      const cannon = details.locator('[data-ability-form="A"]');
      await expect(cannon.getByRole("table")).toHaveCount(1);
      await expect(cannon.getByRole("cell")).toHaveText(["20%", "25%", "30%", "35%"]);
      await expect(cannon.getByRole("columnheader")).toHaveText(
        locale === "ko_KR" ? ["Lv 1", "Lv 6", "Lv 11", "Lv 16~"]
          : locale === "en_US" ? ["Lv 1", "Lv 6", "Lv 11", "Lv 16+"]
            : ["1级", "6级", "11级", "16级起"],
      );
      const hammer = details.locator('[data-ability-form="B"]');
      await expect(hammer.getByRole("table")).toHaveCount(2);
      await expect(hammer.getByRole("table").nth(0).getByRole("cell")).toHaveText(["5", "12", "19", "26"]);
      await expect(hammer.getByRole("table").nth(1).getByRole("cell")).toHaveText(["25", "60", "95", "130"]);
    });
  }
}

test.describe("touch input on the original cooldown route", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("one tap opens both forms and closing restores the skill button", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "챔피언 추가하기" }).tap();
    await page.getByRole("button", { name: "Select 니달리", exact: true }).tap();
    await page.keyboard.press("Escape");
    const trigger = page.getByRole("button", { name: "Q 창 투척 / 숨통 끊기", exact: true });
    await trigger.tap();
    await expect(page.getByRole("dialog")).toBeInViewport({ ratio: 0.99 });
    await expect(page.getByRole("dialog").locator("[data-ability-form]")).toHaveCount(2);
    await expect(page.getByRole("dialog").locator('[data-ability-form="B"]')).toContainText("숨통 끊기");
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("touch input on the VS route", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test("closing a skill dialog does not reopen the hover tooltip", async ({ page }) => {
    await page.goto("./vs?a=Jayce&t=Nidalee");
    const trigger = page.getByTestId("vs-mine-Q").getByRole("button");
    await trigger.tap();
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
});

test("Elise and Gnar preserve passive form versus cast cooldown", async ({ page }) => {
  await page.goto("./vs?a=Elise&t=Gnar");
  await expect(page.getByTestId("vs-mine-E").locator("[data-form-half]")).toHaveCount(2);
  const gnarW = page.locator('[data-rank-row="1"] td[headers$="vs-opponent-W"]');
  await expect(gnarW.locator('[data-form-cooldown="A"] [data-cooldown]')).toHaveText("—");
  await expect(gnarW.locator('[data-form-cooldown="B"] [data-cooldown]')).toHaveText("7");
  const eliseE = page.locator('[data-rank-row="1"] td[headers$="vs-mine-E"]');
  await expect(eliseE.locator('[data-form-cooldown="B"] [data-cooldown]')).toHaveText("22");
});

for (const width of [1440, 390]) {
  test(`original cooldown route has the same form icons, descriptions and values at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    await page.getByRole("button", { name: "챔피언 추가하기" }).click();
    await page.getByRole("button", { name: "Select 제이스", exact: true }).click();
    await page.keyboard.press("Escape");
    const icon = page.locator('[data-form-icon][aria-label="Q"]:visible');
    await expect(icon.locator("[data-form-half]")).toHaveCount(2);
    const q = page.locator('[data-skill-rank="JayceToTheSkies"][data-rank="1"]:visible');
    await expect(q.locator('[data-rank-form="A"] [data-form-value]')).toHaveText("16초");
    await expect(q.locator('[data-rank-form="B"] [data-form-value]')).toHaveText("8초");
    const missingForms = page.locator('[data-skill-rank="JayceStanceHtG"][data-rank="2"]:visible');
    await expect(missingForms).toHaveText("—");
    await expect(missingForms.locator("[data-rank-form]")).toHaveCount(0);
    if (width < 768) await icon.click();
    else await icon.hover();
    const details = page.getByRole(width < 768 ? "dialog" : "tooltip");
    await expect(details).toBeInViewport({ ratio: 0.99 });
    await expect(details.locator("[data-ability-form]")).toHaveCount(2);
    await expect(details.locator('[data-ability-form="A"]')).toContainText("하늘로!");
    await expect(details.locator('[data-ability-form="B"]')).toContainText("전격 폭발");
    await page.keyboard.press("Escape");
    const r = page.locator('[data-form-icon][aria-label="R"]:visible');
    if (width < 768) await r.click();
    else await r.hover();
    await expect(details.locator('[data-ability-form="A"]').getByRole("cell")).toHaveText(["20%", "25%", "30%", "35%"]);
    await expect(details.locator('[data-ability-form="B"]').getByRole("table")).toHaveCount(2);
  });
}
